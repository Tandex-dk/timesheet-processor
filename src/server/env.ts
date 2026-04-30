import { z } from 'zod';

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
  CLERK_SECRET_KEY: z.string().min(1),
  POSTGRES_URL: z.string().min(1),
  DATABASE_URL: z.string().optional(),
  APP_URL: z.string().url(),
  MAX_UPLOAD_MB: z.coerce.number().int().positive().default(10),
  PROCESS_TIMEOUT_MS: z.coerce.number().int().positive().default(120000),
  PROCESS_RATE_LIMIT_COUNT: z.coerce.number().int().positive().default(20),
  PROCESS_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
});

let cachedEnv: z.infer<typeof serverEnvSchema> | null = null;

export function getEnv() {
  if (cachedEnv) {
    return cachedEnv;
  }

  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => {
      const key = issue.path.join('.') || 'unknown';
      return `${key}: ${issue.message}`;
    });
    throw new Error(`Invalid server environment configuration:\n${issues.join('\n')}`);
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}
