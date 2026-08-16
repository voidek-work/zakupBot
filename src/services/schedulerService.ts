import cron from 'node-cron';
import { Bot } from 'grammy';
import { env } from '../config/env.js';
import { notificationService } from './notificationService.js';

export function setupScheduler(bot: Bot<any>) {
  console.log('⏰ Initializing automated cron schedulers...');

  // 1. Weekly planned requests digest (Monday morning)
  if (cron.validate(env.CRON_WEEKLY_DIGEST)) {
    cron.schedule(env.CRON_WEEKLY_DIGEST, async () => {
      console.log('📢 Running scheduled task: Weekly Planned Digest');
      try {
        await notificationService.sendWeeklyPlannedDigest(bot);
      } catch (err) {
        console.error('❌ Error during weekly digest schedule:', err);
      }
    });
    console.log(`  - Weekly Planned Digest scheduled: "${env.CRON_WEEKLY_DIGEST}"`);
  } else {
    console.warn(`⚠️ Invalid cron expression for CRON_WEEKLY_DIGEST: ${env.CRON_WEEKLY_DIGEST}`);
  }

  // 2. Weekly inventory checklist prompt (Friday afternoon)
  if (cron.validate(env.CRON_REGULAR_CHECKLIST)) {
    cron.schedule(env.CRON_REGULAR_CHECKLIST, async () => {
      console.log('📢 Running scheduled task: Regular Consumables Checklist');
      try {
        await notificationService.sendInventoryChecklistPrompt(bot);
      } catch (err) {
        console.error('❌ Error during regular checklist schedule:', err);
      }
    });
    console.log(`  - Regular Checklist scheduled: "${env.CRON_REGULAR_CHECKLIST}"`);
  } else {
    console.warn(
      `⚠️ Invalid cron expression for CRON_REGULAR_CHECKLIST: ${env.CRON_REGULAR_CHECKLIST}`
    );
  }
}
