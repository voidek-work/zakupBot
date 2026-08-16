import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

export function parseBigIntIds(val?: string | null): bigint[] {
  if (!val) return [];
  return val
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^\d+$/.test(s))
    .map((s) => BigInt(s));
}

const envSchema = z.object({
  BOT_TOKEN: z.string().min(1, 'BOT_TOKEN is required'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  MANAGER_TELEGRAM_IDS: z
    .string()
    .default('')
    .transform((val) => parseBigIntIds(val)),
  DIRECTOR_TELEGRAM_IDS: z
    .string()
    .default('')
    .transform((val) => parseBigIntIds(val)),
  APPROVAL_THRESHOLD_GEL: z
    .string()
    .optional()
    .transform((val) => (val && !isNaN(parseFloat(val)) ? parseFloat(val) : 200)),
  APPROVAL_THRESHOLD_RUB: z
    .string()
    .optional()
    .transform((val) => (val && !isNaN(parseFloat(val)) ? parseFloat(val) : 200)),
  GOOGLE_SPREADSHEET_ID: z.string().optional(),
  GOOGLE_SERVICE_ACCOUNT_EMAIL: z.string().optional(),
  GOOGLE_PRIVATE_KEY: z
    .string()
    .optional()
    .transform((val) => (val ? val.replace(/\\n/g, '\n') : undefined)),
  MONTHLY_BUDGET_GEL: z
    .string()
    .optional()
    .transform((val) => (val && !isNaN(parseFloat(val)) ? parseFloat(val) : 900)),
  CRON_WEEKLY_DIGEST: z.string().default('0 10 * * 1'),
  CRON_REGULAR_CHECKLIST: z.string().default('0 16 * * 5'),
  CRON_DEADLINE_REMINDER: z.string().default('0 10 * * *'),
});

const parsed = envSchema.safeParse(process.env);

export const env = parsed.success
  ? {
      ...parsed.data,
      APPROVAL_THRESHOLD_GEL:
        parsed.data.APPROVAL_THRESHOLD_GEL ??
        parsed.data.APPROVAL_THRESHOLD_RUB ??
        200,
      MONTHLY_BUDGET_GEL: parsed.data.MONTHLY_BUDGET_GEL ?? 900,
    }
  : {
      BOT_TOKEN: process.env.BOT_TOKEN || '',
      DATABASE_URL: process.env.DATABASE_URL || '',
      MANAGER_TELEGRAM_IDS: parseBigIntIds(process.env.MANAGER_TELEGRAM_IDS),
      DIRECTOR_TELEGRAM_IDS: parseBigIntIds(process.env.DIRECTOR_TELEGRAM_IDS),
      APPROVAL_THRESHOLD_GEL: parseFloat(
        process.env.APPROVAL_THRESHOLD_GEL ||
          process.env.APPROVAL_THRESHOLD_RUB ||
          '200'
      ) || 200,
      MONTHLY_BUDGET_GEL: parseFloat(process.env.MONTHLY_BUDGET_GEL || '900') || 900,
      GOOGLE_SPREADSHEET_ID: process.env.GOOGLE_SPREADSHEET_ID,
      GOOGLE_SERVICE_ACCOUNT_EMAIL: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      GOOGLE_PRIVATE_KEY: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      CRON_WEEKLY_DIGEST: process.env.CRON_WEEKLY_DIGEST || '0 10 * * 1',
      CRON_REGULAR_CHECKLIST: process.env.CRON_REGULAR_CHECKLIST || '0 16 * * 5',
      CRON_DEADLINE_REMINDER: process.env.CRON_DEADLINE_REMINDER || '0 10 * * *',
    };

