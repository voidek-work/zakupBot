import { Composer, InlineKeyboard } from 'grammy';
import { BotContext } from '../context.js';
import { getMainKeyboard } from '../keyboards/main.js';
import { prisma } from '../../db/client.js';
import { WORKSHOP_POSTS } from '../../config/constants.js';

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

commonHandlers.command('help', async (ctx) => {
  const text = [
    `📖 <b>СПРАВКА ПО БОТУ ЗАКУПОК</b>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `<b>Для мастеров и механиков:</b>`,
    `• Нажмите <b>➕ Новая заявка</b>, чтобы заказать инструмент, химию или запчасть.`,
    `• Для горящих ситуаций выбирайте 🔴 <b>СРОЧНО</b> — завхоз получит моментальный пуш.`,
    `• Для плановых потребностей выбирайте 🟡 <b>Планово</b> — они попадут в закупку на неделю.`,
    `• Отслеживайте статусы в <b>📋 Мои заявки</b>.`,
    `\n<b>Для завхоза:</b>`,
    `• Входящие заявки можно принимать в работу, заказывать с указанием цены/срока или отклонять с шаблоном причины.`,
    `• В разделе <b>🔄 Расходники цеха</b> можно настроить постоянные запасы (мыло, WD-40, перчатки) и проходить пятничный чек-лист инвентаризации.`,
  ].join('\n');

  await ctx.reply(text, { parse_mode: 'HTML' });
});
