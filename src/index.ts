import { run } from '@grammyjs/runner';
import { connectDB } from './db/client.js';
import { createBot } from './bot/index.js';
import { setupScheduler } from './services/schedulerService.js';
import { googleSheetsService } from './services/googleSheetsService.js';
import { env } from './config/env.js';

async function bootstrap() {
  console.log('🚀 Starting Telegram Procurement Bot for Auto Repair Shop...');

  // 1. Connect to PostgreSQL
  await connectDB();

  // 2. Initialize Google Sheets (structure & headers)
  await googleSheetsService.init().catch(console.error);

  // 2. Initialize Bot
  if (!env.BOT_TOKEN) {
    console.error('❌ BOT_TOKEN is not defined in .env file!');
    console.log('ℹ️ Please configure .env file and restart.');
    process.exit(1);
  }

  const bot = createBot();

  // 3. Setup Cron Schedulers (Weekly Digest & Consumables Checklist)
  setupScheduler(bot);

  // 4. Start concurrent bot runner
  const runner = run(bot);
  console.log('🤖 Telegram Bot is running in polling mode!');

  // 5. Graceful shutdown
  const stop = async () => {
    console.log('🛑 Stopping bot runner gracefully...');
    if (runner.isRunning()) {
      await runner.stop();
    }
    process.exit(0);
  };

  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

bootstrap().catch((err) => {
  console.error('❌ Fatal error during bootstrap:', err);
  process.exit(1);
});
