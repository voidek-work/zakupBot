import { InlineKeyboard } from 'grammy';
import { BaseContext, BotConversation } from '../context.js';
import { prisma } from '../../db/client.js';
import { WORKSHOP_POSTS, URGENCY_LABELS } from '../../config/constants.js';
import { requestService } from '../../services/requestService.js';
import { notificationService } from '../../services/notificationService.js';
import { Urgency, RequestStatus } from '@prisma/client';
import { getMainKeyboard } from '../keyboards/main.js';

export async function newRequestConversation(
  conversation: BotConversation,
  ctx: BaseContext
) {
  const userId = BigInt(ctx.from!.id);
  const user = await conversation.external(async () => {
    const u = await prisma.user.findUnique({ where: { id: userId } });
    if (!u) return null;
    return { role: u.role, fullName: u.fullName, postName: u.postName };
  });

  if (!user) {
    await ctx.reply('⚠️ Пожалуйста, перезапустите бота командой /start.');
    return;
  }

  // 1. Choose Category
  const categories = await conversation.external(async () => {
    const list = await prisma.category.findMany({ orderBy: { sortOrder: 'asc' } });
    return list.map((c) => ({ id: c.id, name: c.name, icon: c.icon }));
  });

  const catKeyboard = new InlineKeyboard();
  categories.forEach((cat, idx) => {
    catKeyboard.text(`${cat.icon} ${cat.name}`, `cat_${cat.id}`);
    if (idx % 2 === 1) catKeyboard.row();
  });
  catKeyboard.row().text('❌ Отмена', 'cancel_flow');

  await ctx.reply('📦 <b>Шаг 1 из 8: Выберите категорию закупки:</b>', {
    parse_mode: 'HTML',
    reply_markup: catKeyboard,
  });

  const catCtx = await conversation.waitForCallbackQuery([
    ...categories.map((c) => `cat_${c.id}`),
    'cancel_flow',
  ]);
  await catCtx.answerCallbackQuery();

  if (catCtx.callbackQuery.data === 'cancel_flow') {
    await catCtx.editMessageText('❌ Создание заявки отменено.');
    return;
  }

  const categoryId = parseInt(catCtx.callbackQuery.data.replace('cat_', ''), 10);
  const selectedCategory = categories.find((c) => c.id === categoryId)!;

  // 2. Choose Post / Zone
  const postKeyboard = new InlineKeyboard();
  WORKSHOP_POSTS.forEach((post, idx) => {
    postKeyboard.text(post, `post_${idx}`);
    if (idx % 2 === 1) postKeyboard.row();
  });
  postKeyboard.row().text('❌ Отмена', 'cancel_flow');

  await catCtx.editMessageText(
    `📂 Категория: <b>${selectedCategory.icon} ${selectedCategory.name}</b>\n\n🏢 <b>Шаг 2 из 8: Выберите пост или зону автосервиса:</b>`,
    {
      parse_mode: 'HTML',
      reply_markup: postKeyboard,
    }
  );

  const postCtx = await conversation.waitForCallbackQuery([
    ...WORKSHOP_POSTS.map((_, idx) => `post_${idx}`),
    'cancel_flow',
  ]);
  await postCtx.answerCallbackQuery();

  if (postCtx.callbackQuery.data === 'cancel_flow') {
    await postCtx.editMessageText('❌ Создание заявки отменено.');
    return;
  }

  const postIndex = parseInt(postCtx.callbackQuery.data.replace('post_', ''), 10);
  const selectedPost = WORKSHOP_POSTS[postIndex];

  // 3. Item Name
  await postCtx.editMessageText(
    `🏢 Зона: <b>${selectedPost}</b>\n\n✏️ <b>Шаг 3 из 8: Введите точное наименование товара:</b>\n<i>(Например: "Набор фиксаторов ГРМ VAG 1.4 TSI" или "Очиститель тормозов Wurth")</i>`,
    { parse_mode: 'HTML' }
  );

  const nameCtx = await conversation.waitFor(':text');
  if (nameCtx.message?.text === '❌ Отмена') {
    await nameCtx.reply('❌ Создание заявки отменено.', {
      reply_markup: getMainKeyboard(user.role),
    });
    return;
  }
  const itemName = nameCtx.message!.text!.trim();

  // 4. Quantity
  const qtyKeyboard = new InlineKeyboard()
    .text('1 шт', 'qty_1 шт')
    .text('2 шт', 'qty_2 шт')
    .text('5 шт', 'qty_5 шт')
    .row()
    .text('1 коробка', 'qty_1 коробка')
    .text('1 баллон', 'qty_1 баллон')
    .text('1 пачка', 'qty_1 пачка')
    .row()
    .text('✍️ Ввести вручную', 'qty_custom');

  await nameCtx.reply(
    `📦 Товар: <b>${itemName}</b>\n\n🔢 <b>Шаг 4 из 8: Укажите количество:</b>`,
    {
      parse_mode: 'HTML',
      reply_markup: qtyKeyboard,
    }
  );

  let quantity = '1 шт';
  const qtyCtx = await conversation.waitFor(['callback_query:data', ':text']);

  if (qtyCtx.callbackQuery) {
    await qtyCtx.answerCallbackQuery();
    const data = qtyCtx.callbackQuery.data!;
    if (data === 'qty_custom') {
      await qtyCtx.editMessageText('✍️ <b>Введите количество и единицу измерения:</b>\n<i>(Например: 12 баллонов, 3 пачки, 10 метров)</i>', {
        parse_mode: 'HTML',
      });
      const customQtyCtx = await conversation.waitFor(':text');
      quantity = customQtyCtx.message!.text!.trim();
    } else {
      quantity = data.replace('qty_', '');
      await qtyCtx.editMessageText(`🔢 Количество: <b>${quantity}</b>`, { parse_mode: 'HTML' });
    }
  } else if (qtyCtx.message?.text) {
    quantity = qtyCtx.message.text.trim();
  }

  // 5. Approx Price
  const priceKeyboard = new InlineKeyboard()
    .text('❓ Не знаю', 'price_unknown')
    .row()
    .text('20 ₾', 'price_20')
    .text('50 ₾', 'price_50')
    .text('100 ₾', 'price_100')
    .row()
    .text('200 ₾', 'price_200')
    .text('500 ₾', 'price_500');

  await ctx.reply(
    `💰 <b>Шаг 5 из 8: Укажите примерную стоимость (в лари ₾):</b>\n<i>(Или выберите кнопку ниже / введите число вручную)</i>`,
    {
      parse_mode: 'HTML',
      reply_markup: priceKeyboard,
    }
  );

  let estPrice: number | undefined = undefined;
  const priceCtx = await conversation.waitFor(['callback_query:data', ':text']);

  if (priceCtx.callbackQuery) {
    await priceCtx.answerCallbackQuery();
    const data = priceCtx.callbackQuery.data!;
    if (data !== 'price_unknown') {
      estPrice = parseInt(data.replace('price_', ''), 10);
    }
    await priceCtx.editMessageText(
      `💰 Примерная цена: <b>${estPrice ? `${estPrice} ₾` : 'Не указана'}</b>`,
      { parse_mode: 'HTML' }
    );
  } else if (priceCtx.message?.text) {
    const parsedPrice = parseFloat(priceCtx.message.text.replace(/[^0-9.]/g, ''));
    if (!isNaN(parsedPrice)) {
      estPrice = parsedPrice;
    }
  }

  // 6. Justification / Reason
  const justKeyboard = new InlineKeyboard()
    .text('Сломался старый инструмент', 'just_Сломался старый инструмент')
    .row()
    .text('Под ремонт конкретной машины', 'just_Под ремонт конкретной машины')
    .row()
    .text('Закончился общий запас', 'just_Закончился общий запас')
    .row()
    .text('✍️ Написать свой вариант', 'just_custom');

  await ctx.reply(
    `🎯 <b>Шаг 6 из 8: Укажите обоснование закупки (зачем и куда?):</b>`,
    {
      parse_mode: 'HTML',
      reply_markup: justKeyboard,
    }
  );

  let justification = 'Не указано';
  const justCtx = await conversation.waitFor(['callback_query:data', ':text']);

  if (justCtx.callbackQuery) {
    await justCtx.answerCallbackQuery();
    const data = justCtx.callbackQuery.data!;
    if (data === 'just_custom') {
      await justCtx.editMessageText('✍️ <b>Опишите обоснование текстом:</b>', {
        parse_mode: 'HTML',
      });
      const customJustCtx = await conversation.waitFor(':text');
      justification = customJustCtx.message!.text!.trim();
    } else {
      justification = data.replace('just_', '');
      await justCtx.editMessageText(`🎯 Обоснование: <b>${justification}</b>`, {
        parse_mode: 'HTML',
      });
    }
  } else if (justCtx.message?.text) {
    justification = justCtx.message.text.trim();
  }

  // 7. Link (Optional)
  const linkKeyboard = new InlineKeyboard().text('➡️ Пропустить', 'skip_link');

  await ctx.reply(
    `🔗 <b>Шаг 7 из 8: Отправьте ссылку на товар (Ozon, ВсеИнструменты и т.д.):</b>\n<i>(Или нажмите «Пропустить»)</i>`,
    {
      parse_mode: 'HTML',
      reply_markup: linkKeyboard,
    }
  );

  let link: string | undefined = undefined;
  const linkCtx = await conversation.waitFor(['callback_query:data', ':text']);

  if (linkCtx.callbackQuery) {
    await linkCtx.answerCallbackQuery();
    await linkCtx.editMessageText('🔗 Ссылка: <i>Пропущено</i>', { parse_mode: 'HTML' });
  } else if (linkCtx.message?.text) {
    link = linkCtx.message.text.trim();
  }

  // 8. Photo (Optional)
  const photoKeyboard = new InlineKeyboard().text('➡️ Пропустить', 'skip_photo');

  await ctx.reply(
    `📸 <b>Шаг 8 из 8: Отправьте фото поломки / этикетки / образца:</b>\n<i>(Или нажмите «Пропустить»)</i>`,
    {
      parse_mode: 'HTML',
      reply_markup: photoKeyboard,
    }
  );

  let photoFileId: string | undefined = undefined;
  const photoCtx = await conversation.waitFor(['callback_query:data', ':photo']);

  if (photoCtx.callbackQuery) {
    await photoCtx.answerCallbackQuery();
    await photoCtx.editMessageText('📸 Фото: <i>Пропущено</i>', { parse_mode: 'HTML' });
  } else if (photoCtx.message?.photo) {
    // Get highest resolution photo
    const photos = photoCtx.message.photo;
    photoFileId = photos[photos.length - 1].file_id;
  }

  // 9. Urgency Selection
  const urgencyKeyboard = new InlineKeyboard()
    .text('🔴 СРОЧНО (Горит пост)', 'urg_URGENT')
    .row()
    .text('🟡 Планово (В еженедельную закупку)', 'urg_PLANNED');

  await ctx.reply('⚡ <b>Выберите срочность заявки:</b>', {
    parse_mode: 'HTML',
    reply_markup: urgencyKeyboard,
  });

  const urgCtx = await conversation.waitForCallbackQuery(['urg_URGENT', 'urg_PLANNED']);
  await urgCtx.answerCallbackQuery();

  const urgency = urgCtx.callbackQuery.data === 'urg_URGENT' ? Urgency.URGENT : Urgency.PLANNED;

  // 10. Confirmation Card
  const confirmKeyboard = new InlineKeyboard()
    .text('✅ Отправить заявку', 'confirm_send')
    .text('❌ Отменить', 'cancel_send');

  const summaryText = [
    `📝 <b>ПРОВЕРЬТЕ ДАННЫЕ ЗАЯВКИ:</b>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📂 <b>Категория:</b> ${selectedCategory.icon} ${selectedCategory.name}`,
    `🏢 <b>Зона/Пост:</b> ${selectedPost}`,
    `📦 <b>Товар:</b> <code>${itemName}</code>`,
    `🔢 <b>Количество:</b> ${quantity}`,
    `💰 <b>Прим. цена:</b> ${estPrice ? `${estPrice} ₾` : 'Не указана'}`,
    `⚡ <b>Срочность:</b> ${URGENCY_LABELS[urgency]}`,
    `🎯 <b>Обоснование:</b> ${justification}`,
    link ? `🔗 <b>Ссылка:</b> ${link}` : '',
    photoFileId ? `📸 <b>Фото:</b> Прикреплено` : '',
  ]
    .filter(Boolean)
    .join('\n');

  await urgCtx.editMessageText(summaryText, {
    parse_mode: 'HTML',
    reply_markup: confirmKeyboard,
  });

  const finalCtx = await conversation.waitForCallbackQuery(['confirm_send', 'cancel_send']);
  await finalCtx.answerCallbackQuery();

  if (finalCtx.callbackQuery.data === 'cancel_send') {
    await finalCtx.editMessageText('❌ Заявка отменена.');
    return;
  }

  // Save to DB & notify managers / director
  const created = await conversation.external(async () => {
    const req = await requestService.createRequest({
      userId,
      categoryId: selectedCategory.id,
      postName: selectedPost,
      itemName,
      quantity,
      estPrice,
      urgency,
      justification,
      link,
      photoFileId,
    });

    if (req.status === RequestStatus.PENDING_APPROVAL) {
      const monthStats = await requestService.getCurrentMonthExpenses();
      await notificationService
        .notifyDirectorApprovalRequired(ctx.api as any, req as any, monthStats.totalSpent, monthStats.budgetLimit)
        .catch(console.error);
    } else {
      await notificationService.notifyNewRequest(ctx.api as any, req as any).catch(console.error);
    }

    return req;
  });

  if (created.status === RequestStatus.PENDING_APPROVAL) {
    await finalCtx.editMessageText(
      `⏳ <b>Заявка #${created.id} создана и направлена на согласование Директору!</b>\n\n` +
        `ℹ️ Сумма закупки или текущий месячный лимит бюджета (900 ₾) требует одобрения руководства.\n` +
        `Как только директор одобрит закупку, завхоз сразу возьмет её в работу.`,
      { parse_mode: 'HTML' }
    );
  } else {
    await finalCtx.editMessageText(
      `✅ <b>Заявка #${created.id} успешно создана и передана завхозу!</b>\n\n${
        urgency === Urgency.URGENT
          ? '🚨 Завхоз получил мгновенное оповещение со звуком.'
          : '🟡 Заявка добавлена в плановый список закупок на неделю.'
      }\n\nВы получите уведомление в боте, когда статус заявки изменится.`,
      { parse_mode: 'HTML' }
    );
  }
}

