import { Bot, session } from 'grammy';
import { conversations, createConversation } from '@grammyjs/conversations';
import { env } from '../config/env.js';
import { BotContext, SessionData } from './context.js';
import { authMiddleware } from './middlewares/auth.js';
import { newRequestConversation } from './conversations/newRequest.js';
import { rejectRequestConversation } from './conversations/rejectRequest.js';
import { orderRequestConversation } from './conversations/orderRequest.js';
import { addRegularItemConversation } from './conversations/regularManage.js';
import { editRequestConversation } from './conversations/editRequest.js';
import { commonHandlers } from './handlers/common.js';
import { mechanicHandlers } from './handlers/mechanic.js';
import { managerHandlers } from './handlers/manager.js';
import { regularHandlers } from './handlers/regular.js';

export function createBot(): Bot<BotContext> {
  const bot = new Bot<BotContext>(env.BOT_TOKEN);

  // 1. Session middleware
  bot.use(
    session({
      initial: (): SessionData => ({
        tempData: {},
      }),
    })
  );

  // 2. Conversations plugin & registrations
  bot.use(conversations());
  bot.use(createConversation(newRequestConversation));
  bot.use(createConversation(rejectRequestConversation));
  bot.use(createConversation(orderRequestConversation));
  bot.use(createConversation(addRegularItemConversation));
  bot.use(createConversation(editRequestConversation));

  // 3. Authentication & Role resolution middleware
  bot.use(authMiddleware);

  // 4. Handlers and composers
  bot.use(commonHandlers);
  bot.use(mechanicHandlers);
  bot.use(managerHandlers);
  bot.use(regularHandlers);

  // Global error handler
  bot.catch((err) => {
    console.error('❌ Telegram Bot Unhandled Error:', err);
  });

  return bot;
}
