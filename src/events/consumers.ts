import { EVENTS, type MeetingDto, type MessageCreatedEvent } from '@novachat-enterprise-erp/contracts';
import type { EventSubscriber } from '@novachat-enterprise-erp/events';
import type { NotificationService } from '../services/notification.service.js';

export const registerConsumers = (subscriber: EventSubscriber, notifications: NotificationService): void => {
  subscriber
    .on<MessageCreatedEvent & { threadParticipantIds?: string[] }>(EVENTS.MESSAGE_CREATED, (e) =>
      notifications.onMessageCreated(e.workspaceId!, e.actorId!, e.data),
    )
    .on<{ meeting: MeetingDto; userIds: string[]; inviterName: string | null }>(EVENTS.MEETING_INVITED, (e) =>
      notifications.onMeetingInvited(e.workspaceId!, e.actorId!, e.data),
    )
    .on<{ email: string | null; url: string; workspaceName: string; inviterName: string | null }>(EVENTS.INVITE_CREATED, (e) =>
      notifications.onWorkspaceInvite(e.data),
    );
};
