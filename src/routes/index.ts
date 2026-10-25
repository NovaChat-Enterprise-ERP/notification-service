import { Router } from 'express';
import { requireMember } from '@novachat-enterprise-erp/common';
import type { Container } from '../container.js';

export const publicRoutes = ({ controllers: { notifications: n } }: Container): Router => {
  const ws = Router({ mergeParams: true });
  ws.use(requireMember);
  ws.get('/notifications', n.list);
  ws.get('/notifications/unread-count', n.unreadCount);
  ws.get('/notifications/preferences', n.preferences);
  ws.put('/notifications/preferences', n.updatePreferences);
  ws.post('/notifications/read', n.markMany);
  ws.post('/notifications/read-all', n.markAll);
  ws.post('/notifications/:notificationId/read', n.markOne);

  const router = Router();
  router.use('/workspaces/:workspaceId', ws);
  return router;
};
