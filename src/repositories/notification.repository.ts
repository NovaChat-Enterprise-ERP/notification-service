import { and, count, desc, eq, inArray, isNull, lt, or } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { notifications, preferences, type NotificationRow, type PreferenceRow } from '../db/schema.js';

export type NewNotification = Pick<NotificationRow, 'workspaceId' | 'userId' | 'type' | 'title'> &
  Partial<Pick<NotificationRow, 'actorId' | 'body' | 'link' | 'data'>>;

export interface NotificationRepository {
  createMany(input: NewNotification[]): Promise<NotificationRow[]>;
  list(workspaceId: string, userId: string, unreadOnly: boolean, before: { createdAt: string; id: string } | null, limit: number): Promise<NotificationRow[]>;
  unreadCount(workspaceId: string, userId: string): Promise<number>;
  markRead(workspaceId: string, userId: string, ids: string[] | 'all'): Promise<number>;
  preferencesFor(workspaceId: string, userIds: string[]): Promise<Map<string, PreferenceRow>>;
  upsertPreferences(workspaceId: string, userId: string, patch: Partial<Pick<PreferenceRow, 'level' | 'emailEnabled'>>): Promise<PreferenceRow>;
}

export class DrizzleNotificationRepository implements NotificationRepository {
  constructor(private readonly db: Database) {}

  async createMany(input: NewNotification[]): Promise<NotificationRow[]> {
    if (input.length === 0) return [];
    return this.db.insert(notifications).values(input).returning();
  }

  async list(workspaceId: string, userId: string, unreadOnly: boolean, before: { createdAt: string; id: string } | null, limit: number) {
    const cursor = before
      ? or(
          lt(notifications.createdAt, new Date(before.createdAt)),
          and(eq(notifications.createdAt, new Date(before.createdAt)), lt(notifications.id, before.id)),
        )
      : undefined;
    return this.db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.workspaceId, workspaceId),
          eq(notifications.userId, userId),
          unreadOnly ? isNull(notifications.readAt) : undefined,
          cursor,
        ),
      )
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(limit);
  }

  async unreadCount(workspaceId: string, userId: string): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(notifications)
      .where(and(eq(notifications.workspaceId, workspaceId), eq(notifications.userId, userId), isNull(notifications.readAt)));
    return Number(row?.total ?? 0);
  }

  async markRead(workspaceId: string, userId: string, ids: string[] | 'all'): Promise<number> {
    const rows = await this.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.workspaceId, workspaceId),
          eq(notifications.userId, userId),
          isNull(notifications.readAt),
          ids === 'all' ? undefined : inArray(notifications.id, ids),
        ),
      )
      .returning({ id: notifications.id });
    return rows.length;
  }

  async preferencesFor(workspaceId: string, userIds: string[]): Promise<Map<string, PreferenceRow>> {
    if (userIds.length === 0) return new Map();
    const rows = await this.db
      .select()
      .from(preferences)
      .where(and(eq(preferences.workspaceId, workspaceId), inArray(preferences.userId, userIds)));
    return new Map(rows.map((r) => [r.userId, r]));
  }

  async upsertPreferences(workspaceId: string, userId: string, patch: Partial<Pick<PreferenceRow, 'level' | 'emailEnabled'>>) {
    const [row] = await this.db
      .insert(preferences)
      .values({ workspaceId, userId, ...patch })
      .onConflictDoUpdate({ target: [preferences.workspaceId, preferences.userId], set: { ...patch, updatedAt: new Date() } })
      .returning();
    return row!;
  }
}
