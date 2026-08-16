import { InlineKeyboard } from 'grammy';
import { BaseContext, BotConversation } from '../context.js';
import { regularService } from '../../services/regularService.js';

export async function addRegularItemConversation(
  conversation: BotConversation,
  ctx: BaseContext
) {
  // 1. Name
  await ctx.reply(
    '➕ <b>Добавление регулярного расходника</b>\n\n' +
      '✏️ <b>Шаг 1 из 4: Введите наименование позиции:</b>\n' +
      '<i>(Например: "Очиститель тормозов 500мл" или "Жидкое мыло 5л")</i>',
    { parse_mode: 'HTML' }
  );

  const nameCtx = await conversation.waitFor(':text');
  if (nameCtx.message?.text === '❌ Отмена') {
    await nameCtx.reply('❌ Добавление отменено.');
    return;
  }
  const name = nameCtx.message!.text!.trim();

  // 2. Category
  const catKb = new InlineKeyboard()
    .text('🧴 Химия и масла', 'rcat_Химия и масла')
    .text('🔩 Расходники и крепёж', 'rcat_Расходники и крепёж')
    .row()
    .text('🧼 Хозтовары и быт', 'rcat_Хозтовары и быт')
    .text('☕ Чай, кофе, вода', 'rcat_Чай, кофе, вода')
    .row()
    .text('❌ Отмена', 'rcat_cancel');

  await nameCtx.reply('📂 <b>Шаг 2 из 4: Выберите категорию расходника:</b>', {
    parse_mode: 'HTML',
    reply_markup: catKb,
  });

  const catCtx = await conversation.waitForCallbackQuery([
    'rcat_Химия и масла',
    'rcat_Расходники и крепёж',
    'rcat_Хозтовары и быт',
    'rcat_Чай, кофе, вода',
    'rcat_cancel',
  ]);
  await catCtx.answerCallbackQuery();

  if (catCtx.callbackQuery.data === 'rcat_cancel') {
    await catCtx.editMessageText('❌ Добавление отменено.');
    return;
  }

  const category = catCtx.callbackQuery.data.replace('rcat_', '');

  // 3. Default order volume & Unit
  await catCtx.editMessageText(
    `📂 Категория: <b>${category}</b>\n\n🔢 <b>Шаг 3 из 4: Введите стандартное количество закупки и ед. изм.:</b>\n<i>(Например: "12 баллонов", "5 пачек", "1 канистра", "2 кг")</i>`,
    { parse_mode: 'HTML' }
  );

  const volCtx = await conversation.waitFor(':text');
  const rawVol = volCtx.message!.text!.trim();
  const parts = rawVol.split(' ');
  const defaultQuantity = parts[0] || '1';
  const unit = parts.slice(1).join(' ') || 'шт';

  // 4. Min stock alert
  await volCtx.reply(
    `📦 Стандартный объем: <b>${defaultQuantity} ${unit}</b>\n\n⚠️ <b>Шаг 4 из 4: Введите минимальный остаток для предупреждения (в ${unit}):</b>\n<i>(Например: 2)</i>`,
    { parse_mode: 'HTML' }
  );

  const stockCtx = await conversation.waitFor(':text');
  const minStock = parseInt(stockCtx.message!.text!.replace(/\D/g, ''), 10) || 1;

  // Save to DB
  const created = await conversation.external(async () => {
    const item = await regularService.createItem({
      name,
      category,
      defaultQuantity,
      unit,
      minStock,
    });
    return {
      name: item.name,
      category: item.category,
      defaultQuantity: item.defaultQuantity,
      unit: item.unit,
      minStock: item.minStock,
    };
  });

  await stockCtx.reply(
    `✅ <b>Позиция «${created.name}» успешно добавлена в каталог регулярных закупок!</b>\n` +
      `• Категория: ${created.category}\n` +
      `• Стандартный заказ: ${created.defaultQuantity} ${created.unit}\n` +
      `• Мин. остаток: ${created.minStock} ${created.unit}\n\n` +
      `Позиция будет включена в еженедельный чек-лист обхода.`,
    { parse_mode: 'HTML' }
  );
}
