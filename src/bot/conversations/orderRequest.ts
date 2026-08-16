import { InlineKeyboard } from 'grammy';
import { BaseContext, BotConversation } from '../context.js';
import { requestService } from '../../services/requestService.js';
import { notificationService } from '../../services/notificationService.js';

export async function orderRequestConversation(
  conversation: BotConversation,
  ctx: BaseContext
) {
  const requestId = ctx.session.tempData?.orderRequestId;
  if (!requestId) {
    await ctx.reply('⚠️ Ошибка: ID заявки не найден.');
    return;
  }

  const managerId = BigInt(ctx.from!.id);
  const request = await conversation.external(async () => {
    const r = await requestService.getRequestById(requestId);
    if (!r) return null;
    return {
      itemName: r.itemName,
      quantity: r.quantity,
      estPrice: r.estPrice ? Number(r.estPrice) : null,
    };
  });

  if (!request) {
    await ctx.reply('⚠️ Заявка не найдена в базе данных.');
    return;
  }

  // 1. Actual Price
  await ctx.reply(
    `🛒 <b>Оформление заказа по заявке #${requestId}</b>\n` +
      `📦 Товар: <b>${request.itemName}</b> (${request.quantity})\n` +
      `💰 Прим. цена: ${request.estPrice ? `${request.estPrice} ₾` : 'Не указана'}\n\n` +
      `✏️ <b>Шаг 1 из 3: Введите фактическую стоимость покупки (в лари ₾):</b>`,
    { parse_mode: 'HTML' }
  );

  const priceCtx = await conversation.waitFor(':text');
  if (priceCtx.message?.text === '❌ Отмена') {
    await priceCtx.reply('❌ Оформление отменено.');
    return;
  }

  const actualPrice = parseFloat(priceCtx.message!.text!.replace(/[^0-9.]/g, '')) || 0;

  // 2. Expected Delivery Date
  const dateKeyboard = new InlineKeyboard()
    .text('Сегодня', 'date_today')
    .text('Завтра', 'date_tomorrow')
    .row()
    .text('Через 2-3 дня', 'date_3days')
    .text('Через неделю', 'date_week')
    .row()
    .text('❓ Неизвестно / Пропустить', 'date_skip');

  await priceCtx.reply(
    `💰 Фактическая сумма: <b>${actualPrice} ₾</b>\n\n📅 <b>Шаг 2 из 3: Укажите ожидаемый срок доставки:</b>`,
    {
      parse_mode: 'HTML',
      reply_markup: dateKeyboard,
    }
  );

  let expectedDate: Date | undefined = undefined;
  const dateCtx = await conversation.waitFor(['callback_query:data', ':text']);

  if (dateCtx.callbackQuery) {
    await dateCtx.answerCallbackQuery();
    const data = dateCtx.callbackQuery.data!;
    const now = new Date();

    if (data === 'date_today') {
      expectedDate = new Date();
    } else if (data === 'date_tomorrow') {
      expectedDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    } else if (data === 'date_3days') {
      expectedDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    } else if (data === 'date_week') {
      expectedDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    }
    await dateCtx.editMessageText(
      `📅 Срок доставки: <b>${
        expectedDate ? expectedDate.toLocaleDateString('ru-RU') : 'Не указан'
      }</b>`,
      { parse_mode: 'HTML' }
    );
  } else if (dateCtx.message?.text) {
    const textInput = dateCtx.message.text.trim();
    // Try to parse days or date
    const days = parseInt(textInput, 10);
    if (!isNaN(days) && days > 0 && days < 365) {
      expectedDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    } else {
      const parsedDate = new Date(textInput);
      expectedDate = !isNaN(parsedDate.getTime()) ? parsedDate : new Date();
    }
  }

  // 3. Receipt photo (Optional)
  const receiptKeyboard = new InlineKeyboard().text('➡️ Пропустить', 'skip_receipt');

  await ctx.reply(
    `🧾 <b>Шаг 3 из 3: Отправьте фото кассового чека или накладной:</b>\n<i>(Или нажмите «Пропустить»)</i>`,
    {
      parse_mode: 'HTML',
      reply_markup: receiptKeyboard,
    }
  );

  let receiptFileId: string | undefined = undefined;
  const receiptCtx = await conversation.waitFor(['callback_query:data', ':photo']);

  if (receiptCtx.callbackQuery) {
    await receiptCtx.answerCallbackQuery();
    await receiptCtx.editMessageText('🧾 Чек: <i>Пропущено</i>', { parse_mode: 'HTML' });
  } else if (receiptCtx.message?.photo) {
    const photos = receiptCtx.message.photo;
    receiptFileId = photos[photos.length - 1].file_id;
  }

  // Update in DB & notify author
  await conversation.external(async () => {
    const updated = await requestService.markAsOrdered(
      requestId,
      managerId,
      actualPrice,
      expectedDate,
      receiptFileId
    );

    await notificationService.notifyAuthorStatusChange(
      ctx.api as any,
      updated as any,
      `Товар заказан завхозом.`
    ).catch(console.error);

    return true;
  });

  await ctx.reply(
    `✅ <b>Заявка #${requestId} переведена в статус «Заказано»!</b>\n` +
      `💰 Сумма: ${actualPrice} ₾\n` +
      `📅 Срок: ${
        expectedDate ? expectedDate.toLocaleDateString('ru-RU') : 'Не указан'
      }\n` +
      `Автор заявки получил оповещение.`,
    { parse_mode: 'HTML' }
  );
}
