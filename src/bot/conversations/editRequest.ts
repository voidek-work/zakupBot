import { InlineKeyboard } from 'grammy';
import { BaseContext, BotConversation } from '../context.js';
import { requestService } from '../../services/requestService.js';
import { WORKSHOP_POSTS, URGENCY_LABELS, STATUS_LABELS } from '../../config/constants.js';
import { Urgency, RequestStatus } from '@prisma/client';

export async function editRequestConversation(
  conversation: BotConversation,
  ctx: BaseContext
) {
  const requestId = ctx.session.tempData?.editRequestId;
  if (!requestId) {
    await ctx.reply('⚠️ Ошибка: ID заявки для редактирования не найден.');
    return;
  }

  const userId = BigInt(ctx.from!.id);
  const request = await conversation.external(async () => {
    return requestService.getRequestById(requestId);
  });

  if (!request) {
    await ctx.reply('⚠️ Заявка не найдена в базе данных.');
    return;
  }

  if (
    request.status !== RequestStatus.NEW &&
    request.status !== RequestStatus.PENDING_APPROVAL &&
    request.status !== RequestStatus.IN_PROGRESS
  ) {
    await ctx.reply(
      `⚠️ Заявку в статусе <b>«${
        STATUS_LABELS[request.status] || request.status
      }»</b> нельзя редактировать.`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  // 1. Choose field to edit
  const fieldKb = new InlineKeyboard()
    .text('✏️ Наименование', 'field_itemName')
    .text('🔢 Количество', 'field_quantity')
    .row()
    .text('💰 Примерная цена', 'field_estPrice')
    .text('⚡ Срочность', 'field_urgency')
    .row()
    .text('🎯 Обоснование', 'field_justification')
    .text('🏢 Пост / Зона', 'field_postName')
    .row()
    .text('❌ Отмена', 'cancel_edit');

  const currentSummary = [
    `✏️ <b>РЕДАКТИРОВАНИЕ ЗАЯВКИ #${request.id}</b>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📦 <b>Товар:</b> <code>${request.itemName}</code>`,
    `🔢 <b>Количество:</b> <b>${request.quantity}</b>`,
    `💰 <b>Прим. цена:</b> ${request.estPrice ? `${request.estPrice} ₾` : 'Не указана'}`,
    `⚡ <b>Срочность:</b> ${URGENCY_LABELS[request.urgency]}`,
    `🎯 <b>Обоснование:</b> ${request.justification}`,
    `🏢 <b>Пост/Зона:</b> ${request.postName || 'Не указан'}`,
    `\n<i>Выберите поле, которое хотите изменить:</i>`,
  ].join('\n');

  await ctx.reply(currentSummary, {
    parse_mode: 'HTML',
    reply_markup: fieldKb,
  });

  const fieldCtx = await conversation.waitForCallbackQuery([
    'field_itemName',
    'field_quantity',
    'field_estPrice',
    'field_urgency',
    'field_justification',
    'field_postName',
    'cancel_edit',
  ]);
  await fieldCtx.answerCallbackQuery();

  const selectedAction = fieldCtx.callbackQuery.data;
  if (selectedAction === 'cancel_edit') {
    await fieldCtx.editMessageText('❌ Редактирование отменено.');
    return;
  }

  const fieldKey = selectedAction.replace('field_', '');
  const updates: any = {};

  // 2. Handle specific field input
  if (fieldKey === 'itemName') {
    await fieldCtx.editMessageText(
      `📦 Текущее наименование: <code>${request.itemName}</code>\n\n✏️ <b>Введите новое наименование товара:</b>`,
      { parse_mode: 'HTML' }
    );
    const inputCtx = await conversation.waitFor(':text');
    if (inputCtx.message?.text === '❌ Отмена') {
      await inputCtx.reply('❌ Редактирование отменено.');
      return;
    }
    updates.itemName = inputCtx.message!.text!.trim();
  } else if (fieldKey === 'quantity') {
    const qtyKb = new InlineKeyboard()
      .text('1 шт', 'eqty_1 шт')
      .text('2 шт', 'eqty_2 шт')
      .text('5 шт', 'eqty_5 шт')
      .row()
      .text('1 баллон', 'eqty_1 баллон')
      .text('1 коробка', 'eqty_1 коробка')
      .text('1 пачка', 'eqty_1 пачка')
      .row()
      .text('✍️ Ввести вручную', 'eqty_custom');

    await fieldCtx.editMessageText(
      `🔢 Текущее количество: <b>${request.quantity}</b>\n\n<b>Выберите или введите новое количество:</b>`,
      { parse_mode: 'HTML', reply_markup: qtyKb }
    );

    const inputQtyCtx = await conversation.waitFor(['callback_query:data', ':text']);
    if (inputQtyCtx.callbackQuery) {
      await inputQtyCtx.answerCallbackQuery();
      const data = inputQtyCtx.callbackQuery.data!;
      if (data === 'eqty_custom') {
        await inputQtyCtx.editMessageText('✍️ <b>Введите количество текстом:</b>', { parse_mode: 'HTML' });
        const customCtx = await conversation.waitFor(':text');
        updates.quantity = customCtx.message!.text!.trim();
      } else {
        updates.quantity = data.replace('eqty_', '');
      }
    } else if (inputQtyCtx.message?.text) {
      updates.quantity = inputQtyCtx.message.text.trim();
    }
  } else if (fieldKey === 'estPrice') {
    await fieldCtx.editMessageText(
      `💰 Текущая цена: <b>${request.estPrice ? `${request.estPrice} ₾` : 'Не указана'}</b>\n\n<b>Введите новую примерную цену (в лари ₾):</b>\n<i>(Или отправьте 0 / "нет", чтобы очистить)</i>`,
      { parse_mode: 'HTML' }
    );
    const inputCtx = await conversation.waitFor(':text');
    const rawPrice = inputCtx.message!.text!.replace(/[^0-9.]/g, '');
    const parsedPrice = parseFloat(rawPrice);
    updates.estPrice = !isNaN(parsedPrice) && parsedPrice > 0 ? parsedPrice : null;
  } else if (fieldKey === 'urgency') {
    const urgKb = new InlineKeyboard()
      .text('🔴 СРОЧНО (Горит пост)', 'eurg_URGENT')
      .row()
      .text('🟡 Планово (В еженедельную закупку)', 'eurg_PLANNED');

    await fieldCtx.editMessageText('⚡ <b>Выберите новый уровень срочности:</b>', {
      parse_mode: 'HTML',
      reply_markup: urgKb,
    });

    const urgCtx = await conversation.waitForCallbackQuery(['eurg_URGENT', 'eurg_PLANNED']);
    await urgCtx.answerCallbackQuery();
    updates.urgency = urgCtx.callbackQuery.data === 'eurg_URGENT' ? Urgency.URGENT : Urgency.PLANNED;
  } else if (fieldKey === 'justification') {
    await fieldCtx.editMessageText(
      `🎯 Текущее обоснование: <i>${request.justification}</i>\n\n<b>Введите новое обоснование закупки:</b>`,
      { parse_mode: 'HTML' }
    );
    const inputCtx = await conversation.waitFor(':text');
    updates.justification = inputCtx.message!.text!.trim();
  } else if (fieldKey === 'postName') {
    const postKb = new InlineKeyboard();
    WORKSHOP_POSTS.forEach((post, idx) => {
      postKb.text(post, `epost_${idx}`);
      if (idx % 2 === 1) postKb.row();
    });

    await fieldCtx.editMessageText('🏢 <b>Выберите новый рабочий пост/зону:</b>', {
      parse_mode: 'HTML',
      reply_markup: postKb,
    });

    const postCtx = await conversation.waitForCallbackQuery(
      WORKSHOP_POSTS.map((_, idx) => `epost_${idx}`)
    );
    await postCtx.answerCallbackQuery();
    const postIdx = parseInt(postCtx.callbackQuery.data.replace('epost_', ''), 10);
    updates.postName = WORKSHOP_POSTS[postIdx];
  }

  // 3. Save to database & Google Sheets
  const updated = await conversation.external(async () => {
    return requestService.updateRequestDetails(requestId, userId, updates);
  });

  const updatedSummary = [
    `✅ <b>Заявка #${updated.id} успешно обновлена!</b>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📦 <b>Товар:</b> <code>${updated.itemName}</code>`,
    `🔢 <b>Количество:</b> <b>${updated.quantity}</b>`,
    `💰 <b>Прим. цена:</b> ${updated.estPrice ? `${updated.estPrice} ₾` : 'Не указана'}`,
    `⚡ <b>Срочность:</b> ${URGENCY_LABELS[updated.urgency]}`,
    `🎯 <b>Обоснование:</b> ${updated.justification}`,
    `🏢 <b>Пост/Зона:</b> ${updated.postName || 'Не указан'}`,
    `\nИзменения сохранены в базе данных и Google Таблице.`,
  ].join('\n');

  await ctx.reply(updatedSummary, { parse_mode: 'HTML' });
}
