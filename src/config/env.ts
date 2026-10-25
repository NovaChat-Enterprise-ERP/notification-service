import { z } from 'zod';
import { baseEnvSchema, loadEnv, serviceUrl } from '@novachat-enterprise-erp/common';

const schema = baseEnvSchema.extend({
  PORT: z.coerce.number().default(4007),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  WORKSPACE_SERVICE_URL: serviceUrl('http://localhost:4002'),
  MESSAGE_SERVICE_URL: serviceUrl('http://localhost:4003'),
  PUBLIC_APP_URL: z.url().default('http://localhost:3000'),
  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().default('NovaChat <onboarding@resend.dev>'),
});

export type Env = z.infer<typeof schema>;

export const loadNotificationEnv = (): Env => loadEnv(schema);
