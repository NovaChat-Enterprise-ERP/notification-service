import { fileURLToPath } from 'node:url';
import { DEFAULT_ROLE_PERMISSIONS, type MemberDto } from '@novachat-enterprise-erp/contracts';
import { createLogger } from '@novachat-enterprise-erp/common';
import { InMemoryEventBus } from '@novachat-enterprise-erp/events';
import { TEST_SECRET, asUser, createTestDatabase } from '@novachat-enterprise-erp/testing';
import { schema } from '../db/schema.js';
import type { Database } from '../db/client.js';
import { DrizzleNotificationRepository } from '../repositories/notification.repository.js';
import type { Directory } from '../providers/directory.js';
import { RecordingMailer } from '../providers/mailer.js';
import { buildContainer } from '../container.js';
import { createApp } from '../app.js';

export const WS = '00000000-0000-4000-8000-0000000000d1';
export const CONV = '00000000-0000-4000-8000-0000000000c1';

const member = (userId: string, name: string, extra: Partial<MemberDto> = {}): MemberDto => ({
  id: `m-${userId}`,
  workspaceId: WS,
  userId,
  name,
  username: userId,
  email: `${userId}@example.com`,
  image: null,
  title: null,
  role: { id: 'r', key: 'member', name: 'Member' },
  status: { emoji: null, text: null, expiresAt: null },
  isAway: false,
  notificationsPausedUntil: null,
  deactivatedAt: null,
  joinedAt: new Date().toISOString(),
  ...extra,
});

export class FakeDirectory implements Directory {
  people = new Map<string, MemberDto>([
    ['ada', member('ada', 'Ada')],
    ['grace', member('grace', 'Grace')],
    ['linus', member('linus', 'Linus')],
    ['gone', member('gone', 'Gone', { deactivatedAt: new Date().toISOString() })],
  ]);
  async members(_w: string, userIds: string[]) {
    return userIds.map((u) => this.people.get(u)).filter((m): m is MemberDto => !!m);
  }
  async conversationMemberIds() {
    return ['ada', 'grace', 'linus', 'gone'];
  }
}

export const createHarness = async () => {
  const migrations = fileURLToPath(new URL('../../drizzle', import.meta.url));
  const { db, close } = await createTestDatabase(schema, migrations, 'notifications');
  const events = new InMemoryEventBus('notification-service');
  const mailer = new RecordingMailer();
  const directory = new FakeDirectory();
  const container = buildContainer({
    logger: createLogger('test', 'silent'),
    internalSecret: TEST_SECRET,
    publicAppUrl: 'http://app.test',
    repo: new DrizzleNotificationRepository(db as unknown as Database),
    directory,
    mailer,
    events,
  });
  const as = (userId: string) =>
    asUser({ userId, workspaceId: WS, memberId: `m-${userId}`, role: 'member', permissions: DEFAULT_ROLE_PERMISSIONS.member });
  return { app: createApp(container), service: container.services.notifications, events, mailer, directory, close, as };
};
