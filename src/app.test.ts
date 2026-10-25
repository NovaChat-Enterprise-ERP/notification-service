import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { EVENTS, type MessageDto, type NotificationDto } from '@novachat-enterprise-erp/contracts';
import { CONV, WS, createHarness } from './test/harness.js';

let h: Awaited<ReturnType<typeof createHarness>>;
const base = `/api/v1/workspaces/${WS}/notifications`;

const message = (overrides: Partial<MessageDto> = {}): MessageDto => ({
  id: crypto.randomUUID(),
  workspaceId: WS,
  conversationId: CONV,
  authorId: 'ada',
  parentId: null,
  kind: 'user',
  body: null,
  text: 'Hello there',
  attachments: [],
  mentions: [],
  mentionsChannel: false,
  reactions: [],
  replyCount: 0,
  lastReplyAt: null,
  replyUserIds: [],
  isPinned: false,
  clientMsgId: null,
  editedAt: null,
  deletedAt: null,
  createdAt: new Date().toISOString(),
  ...overrides,
});

const inbox = async (userId: string) => (await request(h.app).get(base).set(h.as(userId))).body as { items: NotificationDto[]; unreadCount: number };

beforeAll(async () => {
  h = await createHarness();
});
afterAll(() => h.close());

describe('message notifications', () => {
  it('notifies mentions once with the highest priority type', async () => {
    await h.service.onMessageCreated(WS, 'ada', {
      message: message({ mentions: ['grace'], mentionsChannel: true }),
      conversation: { id: CONV, type: 'public_channel', name: 'general' },
      recipientUserIds: [],
    });
    const grace = await inbox('grace');
    expect(grace.items.map((n) => n.type)).toEqual(['mention']);
    expect(grace.items[0]!.title).toBe('Ada mentioned you in #general');
    expect((await inbox('linus')).items.map((n) => n.type)).toEqual(['channel_mention']);
    expect((await inbox('ada')).items).toEqual([]);
    expect((await inbox('gone')).items).toEqual([]);
    expect(h.events.ofType(EVENTS.NOTIFICATION_CREATED).length).toBe(2);
  });

  it('notifies DM recipients and thread participants', async () => {
    await h.service.onMessageCreated(WS, 'grace', {
      message: message({ authorId: 'grace', text: 'psst' }),
      conversation: { id: CONV, type: 'dm', name: null },
      recipientUserIds: ['ada'],
    });
    const ada = await inbox('ada');
    expect(ada.items[0]).toMatchObject({ type: 'dm', title: 'Grace', body: 'psst' });

    const root = crypto.randomUUID();
    await h.service.onMessageCreated(WS, 'linus', {
      message: message({ authorId: 'linus', parentId: root }),
      conversation: { id: CONV, type: 'public_channel', name: 'general' },
      recipientUserIds: [],
      threadParticipantIds: ['ada'],
    });
    const latest = (await inbox('ada')).items[0]!;
    expect(latest.type).toBe('thread_reply');
    expect(latest.link).toBe(`home/c/${CONV}?message=${root}&thread=${root}`);
  });

  it('respects preference levels', async () => {
    await request(h.app).put(`${base}/preferences`).set(h.as('linus')).send({ level: 'mentions' }).expect(200);
    const before = (await inbox('linus')).items.length;
    await h.service.onMessageCreated(WS, 'ada', {
      message: message({ parentId: crypto.randomUUID() }),
      conversation: { id: CONV, type: 'public_channel', name: 'general' },
      recipientUserIds: [],
      threadParticipantIds: ['linus'],
    });
    expect((await inbox('linus')).items.length).toBe(before);
    await request(h.app).put(`${base}/preferences`).set(h.as('linus')).send({ level: 'none' }).expect(200);
    await h.service.onMessageCreated(WS, 'ada', {
      message: message({ mentions: ['linus'] }),
      conversation: { id: CONV, type: 'public_channel', name: 'general' },
      recipientUserIds: [],
    });
    expect((await inbox('linus')).items.length).toBe(before);
  });

  it('marks notifications read', async () => {
    const grace = await inbox('grace');
    expect(grace.unreadCount).toBe(1);
    const res = await request(h.app).post(`${base}/${grace.items[0]!.id}/read`).set(h.as('grace'));
    expect(res.body.unreadCount).toBe(0);
    await request(h.app).post(`${base}/read-all`).set(h.as('ada')).expect(200);
    expect((await request(h.app).get(`${base}/unread-count`).set(h.as('ada'))).body.unreadCount).toBe(0);
  });
});

describe('meetings and emails', () => {
  it('delivers meeting invites in-app and by email unless paused', async () => {
    h.directory.people.get('linus')!.notificationsPausedUntil = new Date(Date.now() + 3_600_000).toISOString();
    await request(h.app).put(`${base}/preferences`).set(h.as('linus')).send({ level: 'all' });
    await h.service.onMeetingInvited(WS, 'ada', {
      meeting: { id: 'mt', code: 'abc-defg-hij', title: 'Office hours', joinPath: 'buzz/abc-defg-hij' } as never,
      userIds: ['grace', 'linus'],
      inviterName: 'Ada',
    });
    expect((await inbox('grace')).items[0]).toMatchObject({ type: 'meeting_invite', link: 'buzz/abc-defg-hij' });
    expect(h.mailer.sent.map((m) => m.to)).toEqual(['grace@example.com']);
    const silent = h.events.ofType<{ userId: string; notification: { silent: boolean } }>(EVENTS.NOTIFICATION_CREATED).at(-1)!;
    expect(silent.data).toMatchObject({ userId: 'linus', notification: { silent: true } });
  });

  it('emails workspace invites with escaped content', async () => {
    await h.service.onWorkspaceInvite({ email: 'new@example.com', url: 'http://app.test/invite/x', workspaceName: '<Cohort>', inviterName: 'Ada' });
    const email = h.mailer.sent.at(-1)!;
    expect(email).toMatchObject({ to: 'new@example.com', subject: 'Join <Cohort> on NovaChat' });
    expect(email.html).toContain('&lt;Cohort&gt;');
  });
});
