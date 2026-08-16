import { Composer, InlineKeyboard } from 'grammy';
import { BotContext } from '../context.js';
import { requestService } from '../../services/requestService.js';
import { notificationService } from '../../services/notificationService.js';
import { googleSheetsService } from '../../services/googleSheetsService.js';
import { env } from '../../config/env.js';
import { STATUS_LABELS, URGENCY_LABELS, REJECTION_REASONS } from '../../config/constants.js';
import { RequestStatus } from '@prisma/client';

export const managerHandlers = new Composer<BotContext>();

// Command to manually sync & initialize Google Sheets
managerHandlers.command('sync_sheets', async (ctx) => {
  await ctx.reply('⏳ Проверяю подключение к Google Таблицам и синхронизирую данные...');
  const success = await googleSheetsService.init();
  if (success) {
    const importedCount = await googleSheetsService.syncRegularItemsFromSheet();
    await ctx.reply(
      '✅ <b>Google Таблица успешно синхронизирована!</b>\n\n' +
        '• Вкладка <b>«Заявки»</b>: структура и заголовки в порядке.\n' +
        `• Вкладка <b>«Регулярные расходники»</b>: синхронизировано <b>${importedCount} позиций</b> (все изменения из таблицы подтянуты в бота).\n\n` +
        `🔗 <a href="https://docs.google.com/spreadsheets/d/${env.GOOGLE_SPREADSHEET_ID}">Открыть Google Таблицу</a>`,
      { parse_mode: 'HTML' }
    );
  } else {
    await ctx.reply(
      '❌ <b>Не удалось подключиться к Google Таблице.</b>\n\n' +
        'Пожалуйста, откройте вашу Google Таблицу, нажмите <b>«Поделиться» (Share)</b> и добавьте сервисный email с правами <b>Редактор (Editor)</b>:\n' +
        `<code>${env.GOOGLE_SERVICE_ACCOUNT_EMAIL}</code>`,
      { parse_mode: 'HTML' }
    );
  }
});

// 1. New requests list for manager
managerHandlers.hears(['📥 Новые заявки', 'mgr_list_new'], async (ctx) => {
  await showNewRequests(ctx);
});

managerHandlers.callbackQuery('mgr_list_new', async (ctx) => {
  await ctx.answerCallbackQuery();
  await showNewRequests(ctx);
});

async function showNewRequests(ctx: BotContext) {
  const requests = await requestService.getManagerRequests({
    status: RequestStatus.NEW,
    take: 15,
  });

  if (requests.length === 0) {
    await ctx.reply('🎉 <b>Новых необработанных заявок нет!</b>\nВсе заявки приняты в работу или закуплены.', {
      parse_mode: 'HTML',
    });
    return;
  }

  await ctx.reply(`📥 <b>НОВЫЕ ЗАЯВКИ НА ЗАКУПКУ (${requests.length} шт):</b>`, {
    parse_mode: 'HTML',
  });

  for (const req of requests) {
    const isUrgent = req.urgency === 'URGENT';
    const kb = new InlineKeyboard()
      .text('🟢 В работу', `req_take_${req.id}`)
      .text('🛒 Заказано', `req_order_${req.id}`)
      .row()
      .text('🔴 Отклонить', `req_reject_${req.id}`)
      .url('💬 Автор', `tg://user?id=${req.userId}`);

    const text = [
      `${isUrgent ? '🚨 <b>СРОЧНО</b>' : '🟡 <b>Планово</b>'} | <b>Заявка #${req.id}</b>`,
      `📦 <b>Товар:</b> <code>${req.itemName}</code> (${req.quantity})`,
      `👤 <b>Мастер:</b> ${req.user.fullName} (${req.postName || 'Цех'})`,
      `📂 <b>Категория:</b> ${req.category.icon} ${req.category.name}`,
      `💰 <b>Прим. цена:</b> ${req.estPrice ? `${req.estPrice} ₾` : 'Не указана'}`,
      `🎯 <b>Обоснование:</b> ${req.justification}`,
      req.link ? `🔗 <a href="${req.link}">Ссылка на товар</a>` : '',
    ]
      .filter(Boolean)
      .join('\n');

    if (req.photoFileId) {
      await ctx.replyWithPhoto(req.photoFileId, {
        caption: text,
        parse_mode: 'HTML',
        reply_markup: kb,
      });
    } else {
      await ctx.reply(text, {
        parse_mode: 'HTML',
        reply_markup: kb,
      });
    }
  }
}

// 2. Orders In Progress & Ordered
managerHandlers.hears('⏳ В работе / Заказано', async (ctx) => {
  const inProgress = await requestService.getManagerRequests({
    status: RequestStatus.IN_PROGRESS,
    take: 10,
  });

  const ordered = await requestService.getManagerRequests({
    status: RequestStatus.ORDERED,
    take: 10,
  });

  if (inProgress.length === 0 && ordered.length === 0) {
    await ctx.reply('⏳ Сейчас нет активных заказов в работе или в пути.', {
      parse_mode: 'HTML',
    });
    return;
  }

  let text = `⏳ <b>ТЕКУЩИЕ ЗАКАЗЫ В РАБОТЕ И В ПУТИ:</b>\n━━━━━━━━━━━━━━━━━━━━\n\n`;

  if (inProgress.length > 0) {
    text += `⚙️ <b>В работе (${inProgress.length} шт):</b>\n`;
    for (const r of inProgress) {
      text += `• <b>#${r.id} ${r.itemName}</b> (${r.quantity}) — [${r.user.fullName}]\n`;
    }
    text += `\n`;
  }

  if (ordered.length > 0) {
    text += `🛒 <b>Заказано / Ожидается (${ordered.length} шт):</b>\n`;
    for (const r of ordered) {
      const dateStr = r.expectedDate
        ? ` (Доставка: ${new Date(r.expectedDate).toLocaleDateString('ru-RU')})`
        : '';
      text += `• <b>#${r.id} ${r.itemName}</b> (${r.quantity}) — ${r.actualPrice} ₾${dateStr}\n`;
    }
  }

  await ctx.reply(text, { parse_mode: 'HTML' });

  // Render individual actionable cards for ordered items
  for (const r of ordered) {
    const kb = new InlineKeyboard()
      .text('📦 Доставлено на склад', `req_deliver_${r.id}`)
      .url('💬 Автор', `tg://user?id=${r.userId}`);

    await ctx.reply(
      `🛒 <b>Заказ #${r.id}: ${r.itemName} (${r.quantity})</b>\n` +
        `• Автор: ${r.user.fullName} (${r.postName || 'Цех'})\n` +
        `• Факт. цена: <b>${r.actualPrice} ₾</b>\n` +
        `• Нажмите кнопку, когда товар физически прибудет в автосервис:`,
      {
        parse_mode: 'HTML',
        reply_markup: kb,
      }
    );
  }
});

// Action: Take to work
managerHandlers.callbackQuery(/^req_take_(\d+)$/, async (ctx) => {
  const requestId = parseInt(ctx.match[1], 10);
  const managerId = BigInt(ctx.from.id);

  const updated = await requestService.takeToWork(requestId, managerId);
  await ctx.answerCallbackQuery({ text: `Заявка #${requestId} взята в работу!` });

  // Notify author
  await notificationService.notifyAuthorStatusChange(
    ctx.api as any,
    updated as any,
    'Заявка принята завхозом в работу.'
  );

  const kb = new InlineKeyboard()
    .text('🛒 Заказано', `req_order_${requestId}`)
    .text('🔴 Отклонить', `req_reject_${requestId}`)
    .row()
    .url('💬 Автор', `tg://user?id=${updated.userId}`);

  if (ctx.callbackQuery.message?.text) {
    await ctx.editMessageText(
      ctx.callbackQuery.message.text + `\n\n🟢 <b>Статус: Взято в работу</b>`,
      { parse_mode: 'HTML', reply_markup: kb }
    );
  }
});

// Action: Order (Enter order wizard)
managerHandlers.callbackQuery(/^req_order_(\d+)$/, async (ctx) => {
  const requestId = parseInt(ctx.match[1], 10);
  ctx.session.tempData = { ...ctx.session.tempData, orderRequestId: requestId };

  await ctx.answerCallbackQuery();
  await ctx.conversation.enter('orderRequestConversation');
});

// Action: Deliver to warehouse
managerHandlers.callbackQuery(/^req_deliver_(\d+)$/, async (ctx) => {
  const requestId = parseInt(ctx.match[1], 10);
  const managerId = BigInt(ctx.from.id);

  const updated = await requestService.markAsDelivered(requestId, managerId);
  await ctx.answerCallbackQuery({ text: `Заявка #${requestId} отмечена как доставленная!` });

  // Notify author with quick "received" button
  await notificationService.notifyAuthorStatusChange(
    ctx.api as any,
    updated as any
  );

  await ctx.editMessageText(
    `📦 <b>Заявка #${requestId} (${updated.itemName}) доставлена на склад!</b>\n` +
      `Мастер <b>${updated.user.fullName}</b> получил уведомление о необходимости забрать заказ.`,
    { parse_mode: 'HTML' }
  );
});

// Action: Reject (Enter rejection wizard or show reasons)
managerHandlers.callbackQuery(/^req_reject_(\d+)$/, async (ctx) => {
  const requestId = parseInt(ctx.match[1], 10);
  ctx.session.tempData = { ...ctx.session.tempData, rejectRequestId: requestId };

  await ctx.answerCallbackQuery();
  await ctx.conversation.enter('rejectRequestConversation');
});

// View all requests history
managerHandlers.hears('📋 Все заявки', async (ctx) => {
  const requests = await requestService.getManagerRequests({ take: 15 });

  if (requests.length === 0) {
    await ctx.reply('📋 В базе данных пока нет истории заявок.');
    return;
  }

  const text = [
    `📋 <b>ПОСЛЕДНИЕ 15 ЗАЯВОК (ВСЕ СТАТУСЫ):</b>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    ...requests.map((r) => {
      const status = STATUS_LABELS[r.status] || r.status;
      const urg = r.urgency === 'URGENT' ? '🔴' : '🟡';
      return (
        `<b>#${r.id} ${r.category.icon} ${r.itemName}</b> (${r.quantity})\n` +
        `• Автор: ${r.user.fullName} (${r.postName || 'Цех'})\n` +
        `• Статус: <b>${status}</b> | ${urg}\n` +
        (r.actualPrice ? `• Факт. цена: <b>${r.actualPrice} ₾</b>\n` : '') +
        `────────────────────`
      );
    }),
  ].join('\n');

  await ctx.reply(text, { parse_mode: 'HTML' });
});

// Director: Expense summary
managerHandlers.hears('📊 Сводка расходов', async (ctx) => {
  const completed = await requestService.getManagerRequests({
    status: RequestStatus.COMPLETED,
    take: 50,
  });
  const ordered = await requestService.getManagerRequests({
    status: RequestStatus.ORDERED,
    take: 50,
  });

  const totalCompletedSum = completed.reduce(
    (acc, r) => acc + (r.actualPrice ? Number(r.actualPrice) : 0),
    0
  );
  const totalOrderedSum = ordered.reduce(
    (acc, r) => acc + (r.actualPrice ? Number(r.actualPrice) : 0),
    0
  );

  const text = [
    `📊 <b>СВОДКА РАСХОДОВ И ЗАКУПОК</b>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `✅ <b>Выполненные закупки:</b> ${completed.length} шт на сумму <b>${totalCompletedSum.toLocaleString('ru-RU')} ₾</b>`,
    `🛒 <b>Заказы в пути/ожидании:</b> ${ordered.length} шт на сумму <b>${totalOrderedSum.toLocaleString('ru-RU')} ₾</b>`,
    `💰 <b>Общий оборот:</b> <b>${(totalCompletedSum + totalOrderedSum).toLocaleString('ru-RU')} ₾</b>`,
    `\n📋 <i>Детальные отчеты доступны в синхронизированной Google Таблице.</i>`,
  ].join('\n');

  await ctx.reply(text, { parse_mode: 'HTML' });
});

// Director: Approval requests
managerHandlers.hears('📥 Заявки на согласование', async (ctx) => {
  const pending = await requestService.getManagerRequests({
    status: RequestStatus.PENDING_APPROVAL,
    take: 15,
  });

  if (pending.length === 0) {
    await ctx.reply('🎉 <b>Нет заявок, ожидающих персонального согласования!</b>', {
      parse_mode: 'HTML',
    });
    return;
  }

  await ctx.reply(`📥 <b>ЗАЯВКИ НА СОГЛАСОВАНИЕ (${pending.length} шт):</b>`, {
    parse_mode: 'HTML',
  });

  for (const req of pending) {
    const kb = new InlineKeyboard()
      .text('🟢 Одобрить', `req_take_${req.id}`)
      .text('🔴 Отклонить', `req_reject_${req.id}`)
      .row()
      .url('💬 Автор', `tg://user?id=${req.userId}`);

    const text = [
      `🏷 <b>Заявка #${req.id}</b> | ${req.urgency === 'URGENT' ? '🚨 СРОЧНО' : '🟡 Планово'}`,
      `📦 <b>Товар:</b> <code>${req.itemName}</code> (${req.quantity})`,
      `👤 <b>Мастер:</b> ${req.user.fullName} (${req.postName || 'Цех'})`,
      `💰 <b>Сумма:</b> <b>${req.estPrice ? `${req.estPrice} ₾` : 'Не указана'}</b>`,
      `🎯 <b>Обоснование:</b> ${req.justification}`,
    ].join('\n');

    await ctx.reply(text, {
      parse_mode: 'HTML',
      reply_markup: kb,
    });
  }
});
