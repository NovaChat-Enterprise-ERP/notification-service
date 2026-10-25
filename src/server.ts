import { InternalHttpClient, createLogger, startServer } from '@novachat-enterprise-erp/common';
import { RedisStreamEventPublisher, RedisStreamEventSubscriber } from '@novachat-enterprise-erp/events';
import { loadNotificationEnv } from './config/env.js';
import { createDatabase } from './db/client.js';
import { DrizzleNotificationRepository } from './repositories/notification.repository.js';
import { ServiceDirectory } from './providers/directory.js';
import { ConsoleMailer, ResendMailer } from './providers/mailer.js';
import { registerConsumers } from './events/consumers.js';
import { buildContainer } from './container.js';
import { createApp } from './app.js';

const env = loadNotificationEnv();
const logger = createLogger('notification-service', env.LOG_LEVEL);
const { db, pool } = createDatabase(env.DATABASE_URL, (err) =>
  logger.warn({ err }, 'Idle database connection failed; the pool will reconnect'),
);
const events = new RedisStreamEventPublisher({ redisUrl: env.REDIS_URL, source: 'notification-service' });
const client = (url: string) => new InternalHttpClient(url, env.INTERNAL_SECRET, 'notification-service');

const container = buildContainer({
  logger,
  internalSecret: env.INTERNAL_SECRET,
  publicAppUrl: env.PUBLIC_APP_URL,
  repo: new DrizzleNotificationRepository(db),
  directory: new ServiceDirectory(client(env.WORKSPACE_SERVICE_URL), client(env.MESSAGE_SERVICE_URL)),
  mailer: env.RESEND_API_KEY ? new ResendMailer(env.RESEND_API_KEY, env.MAIL_FROM) : new ConsoleMailer(logger),
  events,
  readiness: { database: async () => void (await pool.query('select 1')) },
});

const subscriber = new RedisStreamEventSubscriber({
  redisUrl: env.REDIS_URL,
  source: 'notification-service',
  group: 'notification-service',
  logger,
});
registerConsumers(subscriber, container.services.notifications);
await subscriber.start();

startServer({
  app: createApp(container),
  port: env.PORT,
  logger,
  onShutdown: [() => subscriber.stop(), () => events.close(), () => pool.end()],
});
