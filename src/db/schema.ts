import { boolean, index, jsonb, pgSchema, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { NotificationLevel, NotificationType } from '@novachat-enterprise-erp/contracts';

export const notificationsSchema = pgSchema('notifications');

const ts = (name: string) => timestamp(name, { withTimezone: true, precision: 6 });

export const notifications = notificationsSchema.table(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull(),
    userId: text('user_id').notNull(),
    type: text('type').$type<NotificationType>().notNull(),
    actorId: text('actor_id'),
    title: text('title').notNull(),
    body: text('body'),
    link: text('link'),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
    readAt: ts('read_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('notifications_user_created_idx').on(t.workspaceId, t.userId, t.createdAt.desc())],
);

export const preferences = notificationsSchema.table(
  'preferences',
  {
    workspaceId: uuid('workspace_id').notNull(),
    userId: text('user_id').notNull(),
    level: text('level').$type<NotificationLevel>().notNull().default('all'),
    emailEnabled: boolean('email_enabled').notNull().default(true),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] })],
);

export const schema = { notifications, preferences };

export type NotificationRow = typeof notifications.$inferSelect;
export type PreferenceRow = typeof preferences.$inferSelect;
