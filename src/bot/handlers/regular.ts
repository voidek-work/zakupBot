import { Composer, InlineKeyboard } from 'grammy';
import { BotContext } from '../context.js';
import { regularService } from '../../services/regularService.js';
import { getRegularManagementKeyboard } from '../keyboards/regularItems.js';
import { requestService } from '../../services/requestService.js';
import { googleSheetsService } from '../../services/googleSheetsService.js';
import { Urgency } from '@prisma/client';
import { prisma } from '../../db/client.js';

export const regularHandlers = new Composer<BotContext>();

// Main Regular Menu for Manager
regularHandlers.hears('🔄 Расходники цеха', async (ctx) => {
  // Sync latest updates from Google Sheets in background
  googleSheetsService.syncRegularItemsFromSheet().catch(() => {});
  const items = await regularService.getActiveItems();

  const text = [
    `🔄 <b>РЕГУЛЯРНЫЕ ЗАКУПКИ И РАСХОДНИКИ ЦЕХА</b>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `Здесь настраивается постоянный список расходных материалов:`,
    `<i>очистители, смазки, перчатки, ветошь, мыло, кофе, чай.</i>`,
    `\nВ каталоге активных позиций: <b>${items.length} шт</b>.`,
    `\nВыберите необходимое действие:`,
  ].join('\n');

  await ctx.reply(text, {
    parse_mode: 'HTML',
    reply_markup: getRegularManagementKeyboard(),
  });
});

// Add regular item
regularHandlers.callbackQuery('reg_add_item', async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.conversation.enter('addRegularItemConversation');
});

// List all regular items with management buttons
regularHandlers.callbackQuery('reg_list_items', async (ctx) => {
  await ctx.answerCallbackQuery();
  const items = await regularService.getAllItems();

  if (items.length === 0) {
    await ctx.reply('📋 В каталоге регулярных расходников пока пусто.');
    return;
  }

  const text = [
    `📋 <b>КАТАЛОГ РАСХОДНЫХ МАТЕРИАЛОВ (${items.length} шт):</b>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    ...items.map((it, idx) => {
      const statusIcon = it.isActive ? '🟢' : '⏸';
      return (
        `${idx + 1}. ${statusIcon} <b>${it.name}</b>\n` +
        `   Категория: <i>${it.category}</i>\n` +
        `   Стандарт: <b>${it.defaultQuantity} ${it.unit}</b> (Мин. запас: ${it.minStock})\n`
      );
    }),
  ].join('\n');

  // Quick actions keyboard
  const kb = new InlineKeyboard()
    .text('➕ Добавить позицию', 'reg_add_item')
    .row()
    .text('🚀 Начать инвентаризацию', 'reg_start_checklist');

  await ctx.reply(text, {
    parse_mode: 'HTML',
    reply_markup: kb,
  });
});

// Interactive Inventory Checklist Flow (Friday walk)
regularHandlers.callbackQuery('reg_start_checklist', async (ctx) => {
  await ctx.answerCallbackQuery();
  const items = await regularService.getActiveItems();

  if (items.length === 0) {
    await ctx.reply('⚠️ Нет активных позиций для инвентаризации.');
    return;
  }

  // Initialize checklist state in session
  ctx.session.tempData = {
    ...ctx.session.tempData,
    checklistItems: items,
    checklistIndex: 0,
    ordersToCreate: [],
  };

  await sendChecklistStep(ctx, 0);
});

async function sendChecklistStep(ctx: BotContext, index: number) {
  const items = ctx.session.tempData?.checklistItems || [];
  if (index >= items.length) {
    await finishChecklist(ctx);
    return;
  }

  const item = items[index];
  const total = items.length;

  const text = [
    `📋 <b>ИНВЕНТАРИЗАЦИЯ ЦЕХА: ПОЗИЦИЯ ${index + 1} ИЗ ${total}</b>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📂 <b>Категория:</b> ${item.category}`,
    `📦 <b>Товар:</b> <code>${item.name}</code>`,
    `🔢 <b>Стандартный заказ:</b> ${item.defaultQuantity} ${item.unit}`,
    `⚠️ <b>Минимальный запас:</b> ${item.minStock} ${item.unit}`,
    `\n<i>Посмотрите остаток на складе/постах: нужно ли пополнить?</i>`,
  ].join('\n');

  const kb = new InlineKeyboard()
    .text(`➕ Заказать ${item.defaultQuantity} ${item.unit}`, `chk_ord_${item.id}`)
    .row()
    .text('✅ Хватает (Пропустить)', `chk_skip_${item.id}`)
    .row()
    .text('❌ Завершить обход', 'chk_finish');

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, {
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

// Order item during checklist
regularHandlers.callbackQuery(/^chk_ord_(\d+)$/, async (ctx) => {
  const itemId = parseInt(ctx.match[1], 10);

  if (!ctx.session.tempData) {
    ctx.session.tempData = {};
  }

  const items = ctx.session.tempData.checklistItems || [];
  const item = items.find((i: any) => i.id === itemId);

  if (item) {
    const orders = ctx.session.tempData.ordersToCreate || [];
    orders.push({
      name: item.name,
      quantity: `${item.defaultQuantity} ${item.unit}`,
      category: item.category,
    });
    ctx.session.tempData.ordersToCreate = orders;
    await ctx.answerCallbackQuery({ text: `Добавлено в заказ: ${item.defaultQuantity} ${item.unit}` });
  } else {
    await ctx.answerCallbackQuery({ text: 'Добавлено' });
  }

  const nextIndex = (ctx.session.tempData.checklistIndex || 0) + 1;
  ctx.session.tempData.checklistIndex = nextIndex;
  await sendChecklistStep(ctx, nextIndex);
});

// Skip item during checklist
regularHandlers.callbackQuery(/^chk_skip_(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery({ text: 'Хватает, пропущено' });

  if (!ctx.session.tempData) {
    ctx.session.tempData = {};
  }

  const nextIndex = (ctx.session.tempData.checklistIndex || 0) + 1;
  ctx.session.tempData.checklistIndex = nextIndex;
  await sendChecklistStep(ctx, nextIndex);
});

// Finish checklist
regularHandlers.callbackQuery('chk_finish', async (ctx) => {
  await ctx.answerCallbackQuery();
  await finishChecklist(ctx);
});

async function finishChecklist(ctx: BotContext) {
  const orders = ctx.session.tempData?.ordersToCreate || [];
  const managerId = BigInt(ctx.from!.id);

  if (orders.length === 0) {
    await ctx.editMessageText(
      '🎉 <b>Чек-лист инвентаризации завершен!</b>\nВсех регулярных расходников в цехе достаточно, заказов не создано.',
      { parse_mode: 'HTML' }
    );
    return;
  }

  // Find category for consumables dynamically
  let categoryId = 3;
  const consumableCategory = await prisma.category.findFirst({
    where: {
      OR: [
        { name: { contains: 'Расходники' } },
        { name: { contains: 'Химия' } },
        { name: { contains: 'Хозтовары' } },
      ],
    },
  });
  if (consumableCategory) {
    categoryId = consumableCategory.id;
  } else {
    const firstCat = await prisma.category.findFirst();
    if (firstCat) categoryId = firstCat.id;
  }

  // Create planned requests in DB for all selected items
  for (const ord of orders) {
    await requestService.createRequest({
      userId: managerId,
      categoryId,
      postName: 'Склад расходников цеха',
      itemName: ord.name,
      quantity: ord.quantity,
      urgency: Urgency.PLANNED,
      justification: 'Плановое пополнение по итогам инвентаризации',
    });
  }

  const listText = orders
    .map((o: any, idx: number) => `${idx + 1}. <b>${o.name}</b> — <code>${o.quantity}</code>`)
    .join('\n');

  const text = [
    `🎉 <b>ИНВЕНТАРИЗАЦИЯ УСПЕШНО ЗАВЕРШЕНА!</b>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `Сформирован список регулярных закупок (<b>${orders.length} позиций</b>):`,
    `\n${listText}`,
    `\n✅ Все позиции добавлены в плановые заявки и синхронизированы с Google Таблицей.`,
  ].join('\n');

  await ctx.editMessageText(text, { parse_mode: 'HTML' });

  // Clean session
  ctx.session.tempData = {};
}
