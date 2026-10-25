import type { Request, Response } from 'express';
import { z } from 'zod';
import { listNotificationsQuerySchema, updateNotificationPreferencesSchema } from '@novachat-enterprise-erp/contracts';
import { memberContext, parse, uuidParam } from '@novachat-enterprise-erp/common';
import type { NotificationService } from '../services/notification.service.js';

const readSchema = z.object({ ids: z.array(z.uuid()).min(1).max(200) });

export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  list = async (req: Request, res: Response) => {
    const { unread, cursor, limit } = parse(listNotificationsQuerySchema, req.query);
    res.json(await this.notifications.list(memberContext(req), unread === 'true', cursor, limit));
  };

  unreadCount = async (req: Request, res: Response) => {
    res.json({ unreadCount: await this.notifications.unreadCount(memberContext(req)) });
  };

  markOne = async (req: Request, res: Response) => {
    res.json({ unreadCount: await this.notifications.markRead(memberContext(req), [uuidParam(req, 'notificationId', 'Notification')]) });
  };

  markMany = async (req: Request, res: Response) => {
    const { ids } = parse(readSchema, req.body);
    res.json({ unreadCount: await this.notifications.markRead(memberContext(req), ids) });
  };

  markAll = async (req: Request, res: Response) => {
    res.json({ unreadCount: await this.notifications.markRead(memberContext(req), 'all') });
  };

  preferences = async (req: Request, res: Response) => {
    res.json(await this.notifications.preferences(memberContext(req)));
  };

  updatePreferences = async (req: Request, res: Response) => {
    res.json(await this.notifications.updatePreferences(memberContext(req), parse(updateNotificationPreferencesSchema, req.body)));
  };
}
