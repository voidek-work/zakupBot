import { Composer, InlineKeyboard } from 'grammy';
import { BotContext } from '../context.js';
import { getMainKeyboard } from '../keyboards/main.js';
import { prisma } from '../../db/client.js';
import { WORKSHOP_POSTS } from '../../config/constants.js';
import { requestService } from '../../services/requestService.js';

export const commonHandlers = new Composer<BotContext>();

commonHandlers.command('start', async (ctx) => {
  const user = ctx.dbUser;
  const role = ctx.userRole || 'MECHANIC';

  let roleDesc = '👷 <b>Сотрудник / Мастер цеха</b>';
  if (role === 'MANAGER') roleDesc = '📦 <b>Завхоз / Снабженец</b>';
  if (role === 'DIRECTOR') roleDesc = '👑 <b>Руководитель / Директор</b>';

  const text = [
    `👋 Привет, <b>${ctx.from?.first_name || 'друг'}</b>!`,
    `Добро пожаловать в систему закупок и снабжения автосервиса.`,
    `\nВаша роль: ${roleDesc}`,
    `Пост/Зона: <b>${user?.postName || 'Не привязан'}</b>`,
    `\n💡 <i>Используйте кнопки меню ниже для работы с заявками и расходниками.</i>`,
  ].join('\n');

  await ctx.reply(text, {
    parse_mode: 'HTML',
    reply_markup: getMainKeyboard(role),
  });
});

commonHandlers.hears('👤 Мой профиль', async (ctx) => {
  await showProfile(ctx);
});

commonHandlers.hears('👤 Профиль / Пост', async (ctx) => {
  await showProfile(ctx);
});

async function showProfile(ctx: BotContext) {
  const user = ctx.dbUser;
  if (!user) return;

  const totalRequests = await prisma.request.count({
    where: { userId: user.id },
  });

  const roleDesc =
    user.role === 'MANAGER'
      ? '📦 Завхоз / Снабженец'
      : user.role === 'DIRECTOR'
      ? '👑 Руководитель'
      : '👷 Мастер / Механик';

  const text = [
    `👤 <b>ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ</b>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `• Имя: <b>${user.fullName}</b>`,
    `• Telegram ID: <code>${user.id}</code>`,
    `• Роль: <b>${roleDesc}</b>`,
    `• Текущий пост: <b>${user.postName || 'Не выбран'}</b>`,
    `• Всего создано заявок: <b>${totalRequests} шт</b>`,
  ].join('\n');

  const kb = new InlineKeyboard().text('🏢 Сменить рабочий пост/зону', 'change_my_post');

  await ctx.reply(text, {
    parse_mode: 'HTML',
    reply_markup: kb,
  });
}

commonHandlers.callbackQuery('change_my_post', async (ctx) => {
  await ctx.answerCallbackQuery();

  const kb = new InlineKeyboard();
  WORKSHOP_POSTS.forEach((post, idx) => {
    kb.text(post, `set_post_${idx}`);
    if (idx % 2 === 1) kb.row();
  });

  await ctx.editMessageText('🏢 <b>Выберите ваш постоянный рабочий пост/зону:</b>', {
    parse_mode: 'HTML',
    reply_markup: kb,
  });
});

commonHandlers.callbackQuery(/^set_post_(\d+)$/, async (ctx) => {
  const idx = parseInt(ctx.match[1], 10);
  const selectedPost = WORKSHOP_POSTS[idx];
  const userId = BigInt(ctx.from.id);

  await prisma.user.update({
    where: { id: userId },
    data: { postName: selectedPost },
  });

  await ctx.answerCallbackQuery({ text: `Пост изменен на: ${selectedPost}` });
  await ctx.editMessageText(
    `✅ Ваш рабочий пост успешно обновлен: <b>${selectedPost}</b>.\nТеперь при создании заявок этот пост будет предлагаться автоматически.`,
    { parse_mode: 'HTML' }
  );
});

// Helper to format help guides
function getHelpMenuKeyboard() {
  return new InlineKeyboard()
    .text('👷 Для механиков', 'help_guide_mech')
    .text('📦 Для завхозов', 'help_guide_mgr')
    .text('👑 Для директора', 'help_guide_dir');
}

commonHandlers.hears('📖 Справка', async (ctx) => {
  await sendHelpRoot(ctx);
});

commonHandlers.command('help', async (ctx) => {
  await sendHelpRoot(ctx);
});

async function sendHelpRoot(ctx: BotContext) {
  const text = [
    `📖 <b>РУКОВОДСТВО ПОЛЬЗОВАТЕЛЯ ZAKUPBOT</b>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `Бот автоматизирует снабжение автосервиса: заявки на инструмент, регулярные расходники, контроль бюджета 900 ₾ и учет поставок.`,
    `\nВыберите ваш профиль для подробной инструкции:`,
  ].join('\n');

  await ctx.reply(text, {
    parse_mode: 'HTML',
    reply_markup: getHelpMenuKeyboard(),
  });
}

// Help role callbacks
commonHandlers.callbackQuery('help_guide_mech', async (ctx) => {
  await ctx.answerCallbackQuery();
  const text = [
    `👷 <b>ИНСТРУКЦИЯ ДЛЯ МАСТЕРОВ И МЕХАНИКОВ</b>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `1. <b>Создание заявки:</b> нажмите <b>➕ Новая заявка</b> ➔ выберите категорию, укажите товар, количество и срочность.`,
    `2. <b>Срочность:</b>`,
    `   • 🔴 <b>СРОЧНО</b> — горит пост, работа стоит. Завхоз получает пуш моментально.`,
    `   • 🟡 <b>Планово</b> — пополнение запаса, уходит в дайджест закупки на понедельник.`,
    `3. <b>⚡ Быстрый расходник:</b> заказ в 1 клик (очиститель тормозов, WD-40, смазка).`,
    `4. <b>📋 Мои заявки:</b> просмотр статусов ваших заказов, отмена (❌) или редактирование (✏️).`,
    `5. <b>✅ Получение товара:</b> когда товар доставлен, нажмите кнопку «✅ Получил на руки», чтобы закрыть заявку.`,
  ].join('\n');

  await ctx.editMessageText(text, {
    parse_mode: 'HTML',
    reply_markup: new InlineKeyboard().text('⬅️ Назад к меню справки', 'help_root'),
  });
});

commonHandlers.callbackQuery('help_guide_mgr', async (ctx) => {
  await ctx.answerCallbackQuery();
  const text = [
    `📦 <b>ИНСТРУКЦИЯ ДЛЯ ЗАВХОЗА / СНАБЖЕНЦА</b>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `1. <b>Обработка заявок:</b>`,
    `   • <b>🟢 В работу</b> — берете в обработку.`,
    `   • <b>🛒 Заказано</b> — вводите факт. цену (₾), срок поставки и фото чека.`,
    `   • <b>🔴 Отклонить</b> — выберите причину (есть на складе, нецелесообразно и т.д.).`,
    `2. <b>📦 Доставка:</b> когда поставщик привез товар ➔ нажмите «📦 Доставлено на склад». Мастер получит уведомление забрать.`,
    `3. <b>🔄 Расходники цеха:</b> ведение каталога регулярных товаров (химия, перчатки, кофе).`,
    `4. <b>📋 Пятничный чек-лист:</b> в пятницу бот присылает опросник обхода для закупки на понедельник.`,
    `5. <b>📊 Google Таблицы:</b> все заявки и расходы автоматически синхронизируются в реальном времени.`,
  ].join('\n');

  await ctx.editMessageText(text, {
    parse_mode: 'HTML',
    reply_markup: new InlineKeyboard().text('⬅️ Назад к меню справки', 'help_root'),
  });
});

commonHandlers.callbackQuery('help_guide_dir', async (ctx) => {
  await ctx.answerCallbackQuery();
  const text = [
    `👑 <b>ИНСТРУКЦИЯ ДЛЯ РУКОВОДИТЕЛЯ / ДИРЕКТОРА</b>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `1. <b>💰 Контроль бюджета (900 ₾ / мес):</b>`,
    `   • Бот ведет подсчет трат за текущий месяц.`,
    `   • При превышении месячного лимита 900 ₾ все новые заявки поступают вам на согласование.`,
    `   • Заявки свыше порога крупной суммы также требуют вашего одобрения.`,
    `2. <b>📥 Согласование:</b> получайте карточки с кнопками <b>🟢 Одобрить</b> / <b>🔴 Отклонить</b>.`,
    `3. <b>📊 Сводка расходов:</b> общий оборот, сумма закрытых закупок и заказов в пути.`,
    `4. <b>🏢 Расходы по постам:</b> детальная аналитика — какой пост потратил сколько бюджета.`,
    `5. <b>⚙️ Управление лимитом:</b> возможность изменить месячный лимит бюджета прямо в боте.`,
  ].join('\n');

  await ctx.editMessageText(text, {
    parse_mode: 'HTML',
    reply_markup: new InlineKeyboard().text('⬅️ Назад к меню справки', 'help_root'),
  });
});

commonHandlers.callbackQuery('help_root', async (ctx) => {
  await ctx.answerCallbackQuery();
  const text = [
    `📖 <b>РУКОВОДСТВО ПОЛЬЗОВАТЕЛЯ ZAKUPBOT</b>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `Бот автоматизирует снабжение автосервиса: заявки на инструмент, регулярные расходники, контроль бюджета 900 ₾ и учет поставок.`,
    `\nВыберите ваш профиль для подробной инструкции:`,
  ].join('\n');

  await ctx.editMessageText(text, {
    parse_mode: 'HTML',
    reply_markup: getHelpMenuKeyboard(),
  });
});

// Search handler
commonHandlers.hears('🔍 Поиск заявки', async (ctx) => {
  await ctx.reply(
    `🔍 <b>Поиск по истории заявок</b>\n\nОтправьте в чат команду <code>/find &lt;запрос&gt;</code> (например <code>/find #15</code>, <code>/find масло</code> или <code>/find съемник</code>).`,
    { parse_mode: 'HTML' }
  );
});

commonHandlers.command('find', async (ctx) => {
  const query = ctx.match?.trim();
  if (!query) {
    await ctx.reply('⚠️ Пожалуйста, укажите поисковый запрос: например <code>/find 12</code> или <code>/find очиститель</code>', {
      parse_mode: 'HTML',
    });
    return;
  }

  const results = await requestService.searchRequests(query, 5);

  if (results.length === 0) {
    await ctx.reply(`🔍 По запросу «<b>${query}</b>» заявок не найдено.`, {
      parse_mode: 'HTML',
    });
    return;
  }

  await ctx.reply(`🔍 <b>Результаты поиска по запросу «${query}» (${results.length}):</b>`, {
    parse_mode: 'HTML',
  });

  for (const req of results) {
    const statusIcons: Record<string, string> = {
      NEW: '🆕 Новая',
      PENDING_APPROVAL: '⏳ На согласовании',
      IN_PROGRESS: '🟢 В работе',
      ORDERED: '🛒 Заказано',
      DELIVERED: '📦 На складе',
      COMPLETED: '✅ Выдано',
      REJECTED: '❌ Отклонено',
    };

    const priceInfo = req.actualPrice
      ? `💰 Факт: <b>${req.actualPrice} ₾</b>`
      : (req.estPrice ? `💰 Оценка: <b>${req.estPrice} ₾</b>` : '');

    const text = [
      `🏷 <b>Заявка #${req.id}</b> | ${statusIcons[req.status] || req.status}`,
      `📦 <b>Товар:</b> ${req.itemName} (${req.quantity})`,
      `🏢 <b>Пост:</b> ${req.postName || 'Цех'} | 👤 ${req.user.fullName}`,
      priceInfo,
      `🎯 <i>${req.justification}</i>`,
    ].filter(Boolean).join('\n');

    await ctx.reply(text, { parse_mode: 'HTML' });
  }
});

