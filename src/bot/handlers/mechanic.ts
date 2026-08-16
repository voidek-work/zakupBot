import { Composer, InlineKeyboard } from 'grammy';
import { BotContext } from '../context.js';
import { requestService } from '../../services/requestService.js';
import { STATUS_LABELS, URGENCY_LABELS } from '../../config/constants.js';
import { prisma } from '../../db/client.js';

export const mechanicHandlers = new Composer<BotContext>();

// Trigger new request wizard
mechanicHandlers.hears(['➕ Новая заявка', '➕ Создать заявку'], async (ctx) => {
  await ctx.conversation.enter('newRequestConversation');
});

// View my requests
mechanicHandlers.hears('📋 Мои заявки', async (ctx) => {
  if (!ctx.from) return;
  const userId = BigInt(ctx.from.id);
  const requests = await requestService.getUserRequests(userId, 10);

  if (requests.length === 0) {
    await ctx.reply(
      '📋 У вас пока нет созданных заявок.\nНажмите <b>➕ Новая заявка</b>, чтобы создать первую.',
      { parse_mode: 'HTML' }
    );
    return;
  }

  const text = [
    `📋 <b>ВАШИ ПОСЛЕДНИЕ ЗАЯВКИ:</b>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    ...requests.map((r) => {
      const status = STATUS_LABELS[r.status] || r.status;
      const urgency = r.urgency === 'URGENT' ? '🔴' : '🟡';
      const date = new Date(r.createdAt).toLocaleDateString('ru-RU');
      return (
        `<b>#${r.id} ${r.category.icon} ${r.itemName}</b> (${r.quantity})\n` +
        `• Статус: <b>${status}</b>\n` +
        `• Срочность: ${urgency} | Дата: ${date}\n` +
        (r.rejectReason ? `• Причина отказа: <i>${r.rejectReason}</i>\n` : '') +
        (r.actualPrice ? `• Факт. цена: <b>${r.actualPrice} ₾</b>\n` : '') +
        `────────────────────`
      );
    }),
  ].join('\n');

  const activeRequests = requests.filter(
    (r) =>
      r.status === 'NEW' ||
      r.status === 'PENDING_APPROVAL' ||
      r.status === 'IN_PROGRESS'
  );

  const kb = new InlineKeyboard();
  if (activeRequests.length > 0) {
    activeRequests.slice(0, 5).forEach((r) => {
      kb.text(`✏️ Изменить #${r.id}`, `req_edit_${r.id}`)
        .text(`❌ Отменить #${r.id}`, `req_cancel_ask_${r.id}`)
        .row();
    });
  }

  await ctx.reply(text, {
    parse_mode: 'HTML',
    reply_markup: activeRequests.length > 0 ? kb : undefined,
  });
});

// Quick consumable shortcut
mechanicHandlers.hears('⚡ Быстрый расходник', async (ctx) => {
  const kb = new InlineKeyboard()
    .text('🧴 Очиститель тормозов (1 баллон)', 'quick_req_brake')
    .row()
    .text('🧴 WD-40 400мл (1 баллон)', 'quick_req_wd40')
    .row()
    .text('🧤 Перчатки нитрил L (1 пачка)', 'quick_req_gloves_l')
    .row()
    .text('🧤 Перчатки нитрил XL (1 пачка)', 'quick_req_gloves_xl')
    .row()
    .text('🧼 Паста для рук Чистик', 'quick_req_cleaner')
    .row()
    .text('❌ Закрыть', 'close_quick');

  await ctx.reply(
    '⚡ <b>БЫСТРЫЙ ЗАКАЗ РАСХОДНИКА НА ПОСТ</b>\n\nВыберите нужную позицию для мгновенной заявки завхозу:',
    {
      parse_mode: 'HTML',
      reply_markup: kb,
    }
  );
});

mechanicHandlers.callbackQuery(/^quick_req_(.+)$/, async (ctx) => {
  const itemKey = ctx.match[1];
  const userId = BigInt(ctx.from.id);
  const user = ctx.dbUser;

  const quickItemsMap: Record<
    string,
    { name: string; qty: string; categoryName: string; just: string; defaultCatId: number }
  > = {
    brake: {
      name: 'Очиститель тормозов 500мл',
      qty: '1 баллон',
      categoryName: 'Химия и масла',
      defaultCatId: 2,
      just: 'Закончился на посту',
    },
    wd40: {
      name: 'WD-40 400мл',
      qty: '1 баллон',
      categoryName: 'Химия и масла',
      defaultCatId: 2,
      just: 'Закончился на посту',
    },
    gloves_l: {
      name: 'Перчатки нитриловые (L)',
      qty: '1 пачка (50 пар)',
      categoryName: 'Расходники и крепёж',
      defaultCatId: 3,
      just: 'Расход на посту',
    },
    gloves_xl: {
      name: 'Перчатки нитриловые (XL)',
      qty: '1 пачка (50 пар)',
      categoryName: 'Расходники и крепёж',
      defaultCatId: 3,
      just: 'Расход на посту',
    },
    cleaner: {
      name: 'Паста для мытья рук ("Чистик")',
      qty: '1 банка',
      categoryName: 'Хозтовары и гигиена',
      defaultCatId: 4,
      just: 'Пополнение умывальника',
    },
  };

  const itemInfo = quickItemsMap[itemKey];
  if (!itemInfo) {
    await ctx.answerCallbackQuery({ text: 'Позиция не найдена' });
    return;
  }

  // Safely find category by name or fallback
  let categoryId = itemInfo.defaultCatId;
  const category = await prisma.category.findFirst({
    where: { name: itemInfo.categoryName },
  });
  if (category) {
    categoryId = category.id;
  } else {
    const firstCat = await prisma.category.findFirst();
    if (firstCat) categoryId = firstCat.id;
  }

  // Create request in DB
  const req = await requestService.createRequest({
    userId,
    categoryId,
    postName: user?.postName || 'Слесарный пост',
    itemName: itemInfo.name,
    quantity: itemInfo.qty,
    urgency: 'URGENT',
    justification: itemInfo.just,
  });

  await ctx.answerCallbackQuery({ text: `Заявка #${req.id} создана!` });
  await ctx.editMessageText(
    `✅ <b>Быстрая заявка #${req.id} отправлена завхозу!</b>\n` +
      `📦 Товар: <b>${itemInfo.name}</b> (${itemInfo.qty})\n` +
      `🏢 Пост: ${user?.postName || 'Цех'}\n` +
      `⚡ Срочность: 🔴 СРОЧНО`,
    { parse_mode: 'HTML' }
  );
});

mechanicHandlers.callbackQuery('close_quick', async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.deleteMessage();
});

// Confirmation from employee that goods received on hands
mechanicHandlers.callbackQuery(/^req_complete_(\d+)$/, async (ctx) => {
  const requestId = parseInt(ctx.match[1], 10);
  const userId = BigInt(ctx.from.id);

  const updated = await requestService.markAsCompleted(requestId, userId);
  await ctx.answerCallbackQuery({ text: 'Спасибо за подтверждение!' });

  await ctx.editMessageText(
    `✅ <b>Заявка #${requestId} закрыта!</b>\n` +
      `Товар <b>${updated.itemName}</b> успешно получен сотрудником.\n` +
      `Спасибо за работу!`,
    { parse_mode: 'HTML' }
  );
});

// Edit request trigger
mechanicHandlers.callbackQuery(/^req_edit_(\d+)$/, async (ctx) => {
  const requestId = parseInt(ctx.match[1], 10);
  ctx.session.tempData = { ...ctx.session.tempData, editRequestId: requestId };

  await ctx.answerCallbackQuery();
  await ctx.conversation.enter('editRequestConversation');
});

// Cancel request confirmation prompt
mechanicHandlers.callbackQuery(/^req_cancel_ask_(\d+)$/, async (ctx) => {
  const requestId = parseInt(ctx.match[1], 10);
  await ctx.answerCallbackQuery();

  const kb = new InlineKeyboard()
    .text('❌ Да, отменить заявку', `req_cancel_yes_${requestId}`)
    .text('⬅️ Не отменять', `req_cancel_no_${requestId}`);

  await ctx.reply(
    `⚠️ <b>Вы действительно хотите отменить заявку #${requestId}?</b>\n\nЗаявка будет переведена в статус «Отклонено/Отменено».`,
    {
      parse_mode: 'HTML',
      reply_markup: kb,
    }
  );
});

// Cancel request confirmed
mechanicHandlers.callbackQuery(/^req_cancel_yes_(\d+)$/, async (ctx) => {
  const requestId = parseInt(ctx.match[1], 10);
  const userId = BigInt(ctx.from.id);

  try {
    const updated = await requestService.cancelRequest(
      requestId,
      userId,
      'Отменено автором'
    );
    await ctx.answerCallbackQuery({ text: `Заявка #${requestId} отменена` });
    await ctx.editMessageText(
      `❌ <b>Заявка #${requestId} (${updated.itemName}) успешно отменена.</b>\nСтатус изменен на «Отклонено».`,
      { parse_mode: 'HTML' }
    );
  } catch (err: any) {
    await ctx.answerCallbackQuery({ text: 'Ошибка при отмене' });
    await ctx.editMessageText(`⚠️ Не удалось отменить заявку: ${err.message}`);
  }
});

// Cancel request aborted
mechanicHandlers.callbackQuery(/^req_cancel_no_(\d+)$/, async (ctx) => {
  const requestId = parseInt(ctx.match[1], 10);
  await ctx.answerCallbackQuery({ text: 'Отмена действия' });
  await ctx.editMessageText(`Действие отменено. Заявка #${requestId} осталась активной.`);
});

