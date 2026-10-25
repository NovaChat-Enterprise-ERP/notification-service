import type { Logger, ReadinessCheck } from '@novachat-enterprise-erp/common';
import type { EventPublisher } from '@novachat-enterprise-erp/events';
import type { NotificationRepository } from './repositories/notification.repository.js';
import type { Directory } from './providers/directory.js';
import type { Mailer } from './providers/mailer.js';
import { NotificationService } from './services/notification.service.js';
import { NotificationController } from './controllers/notification.controller.js';

export interface ContainerDeps {
  logger: Logger;
  internalSecret: string;
  publicAppUrl: string;
  repo: NotificationRepository;
  directory: Directory;
  mailer: Mailer;
  events: EventPublisher;
  readiness?: Record<string, ReadinessCheck>;
}

export const buildContainer = (deps: ContainerDeps) => {
  const services = {
    notifications: new NotificationService(deps.repo, deps.directory, deps.mailer, deps.events, deps.publicAppUrl, deps.logger),
  };
  return {
    logger: deps.logger,
    internalSecret: deps.internalSecret,
    readiness: deps.readiness ?? {},
    services,
    controllers: { notifications: new NotificationController(services.notifications) },
  };
};

export type Container = ReturnType<typeof buildContainer>;
