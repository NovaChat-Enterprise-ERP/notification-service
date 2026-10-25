import {
  EVENTS,
  type MemberDto,
  type MessageCreatedEvent,
  type MeetingDto,
  type NotificationDto,
  type NotificationLevel,
  type NotificationPreferencesDto,
  type NotificationType,
  type Page,
} from '@novachat-enterprise-erp/contracts';
import { decodeCursor, encodeCursor, type Logger, type MemberContext } from '@novachat-enterprise-erp/common';
import type { EventPublisher } from '@novachat-enterprise-erp/events';
import type { NotificationRow } from '../db/schema.js';
import type { NewNotification, NotificationRepository } from '../repositories/notification.repository.js';
import type { Directory } from '../providers/directory.js';
import type { Mailer } from '../providers/mailer.js';
import { meetingInviteEmail, workspaceInviteEmail } from './templates.js';

const PRIORITY: Record<NotificationType, number> = {
  mention: 5,
  dm: 4,
  channel_mention: 3,
  thread_reply: 2,
  meeting_invite: 1,
  reaction: 0,
};

const ALLOWED: Record<NotificationLevel, NotificationType[]> = {
  all: ['mention', 'dm', 'channel_mention', 'thread_reply', 'meeting_invite', 'reaction'],
  mentions: ['mention', 'dm', 'channel_mention', 'meeting_invite'],
  none: [],
};

export const toNotificationDto = (n: NotificationRow): NotificationDto => ({
  id: n.id,
  workspaceId: n.workspaceId,
  userId: n.userId,
  type: n.type,
  actorId: n.actorId,
  title: n.title,
  body: n.body,
  link: n.link,
  data: n.data,
  readAt: n.readAt?.toISOString() ?? null,
  createdAt: n.createdAt.toISOString(),
});

const isPaused = (member: MemberDto | undefined) =>
  !!member?.notificationsPausedUntil && new Date(member.notificationsPausedUntil) > new Date();

const truncate = (text: string, max = 200) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

type MessageEvent = MessageCreatedEvent & { threadParticipantIds?: string[] };

export class NotificationService {
  constructor(
    private readonly repo: NotificationRepository,
    private readonly directory: Directory,
    private readonly mailer: Mailer,
    private readonly events: EventPublisher,
    private readonly publicAppUrl: string,
    private readonly logger: Logger,
  ) {}

  async list(actor: MemberContext, unreadOnly: boolean, cursor: string | undefined, limit: number): Promise<Page<NotificationDto> & { unreadCount: number }> {
    const rows = await this.repo.list(actor.workspaceId, actor.userId, unreadOnly, decodeCursor(cursor), limit + 1);
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map(toNotificationDto),
      nextCursor: rows.length > limit && last ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id }) : null,
      unreadCount: await this.repo.unreadCount(actor.workspaceId, actor.userId),
    };
  }

  unreadCount(actor: MemberContext): Promise<number> {
    return this.repo.unreadCount(actor.workspaceId, actor.userId);
  }

  async markRead(actor: MemberContext, ids: string[] | 'all'): Promise<number> {
    await this.repo.markRead(actor.workspaceId, actor.userId, ids);
    return this.repo.unreadCount(actor.workspaceId, actor.userId);
  }

  async preferences(actor: MemberContext): Promise<NotificationPreferencesDto> {
    const pref = (await this.repo.preferencesFor(actor.workspaceId, [actor.userId])).get(actor.userId);
    return { level: pref?.level ?? 'all', emailEnabled: pref?.emailEnabled ?? true };
  }

  async updatePreferences(actor: MemberContext, patch: Partial<NotificationPreferencesDto>): Promise<NotificationPreferencesDto> {
    const row = await this.repo.upsertPreferences(actor.workspaceId, actor.userId, patch);
    return { level: row.level, emailEnabled: row.emailEnabled };
  }

  async onMessageCreated(workspaceId: string, actorId: string, data: MessageEvent): Promise<void> {
    const { message, conversation } = data;
    if (message.kind === 'system') return;

    const targets = new Map<string, NotificationType>();
    const add = (userId: string, type: NotificationType) => {
      const current = targets.get(userId);
      if (!current || PRIORITY[type] > PRIORITY[current]) targets.set(userId, type);
    };
    if (conversation.type === 'dm' || conversation.type === 'group_dm') data.recipientUserIds.forEach((u) => add(u, 'dm'));
    (data.threadParticipantIds ?? []).forEach((u) => add(u, 'thread_reply'));
    if (message.mentionsChannel) (await this.directory.conversationMemberIds(conversation.id)).forEach((u) => add(u, 'channel_mention'));
    message.mentions.forEach((u) => add(u, 'mention'));
    targets.delete(actorId);
    if (targets.size === 0) return;

    const where = conversation.name ? `#${conversation.name}` : 'a direct message';
    const link = `home/c/${conversation.id}?message=${message.parentId ?? message.id}${message.parentId ? `&thread=${message.parentId}` : ''}`;
    await this.deliver(workspaceId, actorId, targets, (type, actorName) => ({
      title: {
        dm: actorName,
        mention: `${actorName} mentioned you in ${where}`,
        channel_mention: `${actorName} notified everyone in ${where}`,
        thread_reply: `${actorName} replied to a thread in ${where}`,
        meeting_invite: actorName,
        reaction: actorName,
      }[type],
      body: truncate(message.text || (message.attachments.length ? `Shared ${message.attachments.length} file(s)` : '')),
      link,
      data: { conversationId: conversation.id, messageId: message.id, parentId: message.parentId },
    }));
  }

  async onMeetingInvited(workspaceId: string, actorId: string, data: { meeting: MeetingDto; userIds: string[]; inviterName: string | null }) {
    const targets = new Map(data.userIds.map((u) => [u, 'meeting_invite' as NotificationType]));
    targets.delete(actorId);
    const title = data.meeting.title ?? 'a meeting';
    const delivered = await this.deliver(workspaceId, actorId, targets, (_type, actorName) => ({
      title: `${actorName} invited you to ${title}`,
      body: `Meeting code ${data.meeting.code}`,
      link: data.meeting.joinPath,
      data: { meetingId: data.meeting.id, code: data.meeting.code },
    }));
    for (const { member, preference, actorName } of delivered) {
      if (!preference.emailEnabled || isPaused(member)) continue;
      const url = `${this.publicAppUrl}/w/${workspaceId}/${data.meeting.joinPath}`;
      await this.safeSend(meetingInviteEmail(member.email, actorName, title, url));
    }
  }

  async onWorkspaceInvite(data: { email: string | null; url: string; workspaceName: string; inviterName: string | null }) {
    if (!data.email) return;
    await this.safeSend(workspaceInviteEmail(data.email, data.workspaceName, data.inviterName, data.url));
  }

  private async deliver(
    workspaceId: string,
    actorId: string,
    targets: Map<string, NotificationType>,
    render: (type: NotificationType, actorName: string) => Pick<NewNotification, 'title' | 'body' | 'link' | 'data'>,
  ) {
    const userIds = [...targets.keys()];
    const [members, prefs] = await Promise.all([
      this.directory.members(workspaceId, [...userIds, actorId]),
      this.repo.preferencesFor(workspaceId, userIds),
    ]);
    const byUser = new Map(members.map((m) => [m.userId, m]));
    const actorName = byUser.get(actorId)?.name ?? 'Someone';

    const recipients = userIds
      .map((userId) => ({
        userId,
        type: targets.get(userId)!,
        member: byUser.get(userId),
        preference: { level: prefs.get(userId)?.level ?? 'all', emailEnabled: prefs.get(userId)?.emailEnabled ?? true },
      }))
      .filter((r) => r.member && !r.member.deactivatedAt && ALLOWED[r.preference.level as NotificationLevel].includes(r.type));

    const rows = await this.repo.createMany(
      recipients.map((r) => ({ workspaceId, userId: r.userId, type: r.type, actorId, ...render(r.type, actorName) })),
    );
    for (const row of rows) {
      await this.events.publish({
        type: EVENTS.NOTIFICATION_CREATED,
        workspaceId,
        actorId,
        data: { userId: row.userId, notification: { ...toNotificationDto(row), silent: isPaused(byUser.get(row.userId)) } },
      });
    }
    return recipients.map((r) => ({ member: r.member!, preference: r.preference, actorName }));
  }

  private async safeSend(message: Parameters<Mailer['send']>[0]) {
    try {
      await this.mailer.send(message);
    } catch (err) {
      this.logger.error({ err, to: message.to }, 'Email delivery failed');
    }
  }
}
