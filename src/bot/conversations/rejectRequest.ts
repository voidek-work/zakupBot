import { InlineKeyboard } from 'grammy';
import { BaseContext, BotConversation } from '../context.js';
import { requestService } from '../../services/requestService.js';
import { notificationService } from '../../services/notificationService.js';
import { REJECTION_REASONS } from '../../config/constants.js';

export async function rejectRequestConversation(
  conversation: BotConversation,
  ctx: BaseContext
) {
  const requestId = ctx.session.tempData?.rejectRequestId;
  if (!requestId) {
    await ctx.reply('⚠️ Ошибка: ID заявки не найден.');
    return;
  }

  const managerId = BigInt(ctx.from!.id);

  const kb = new InlineKeyboard();
  REJECTION_REASONS.forEach((reason, idx) => {
    kb.text(reason, `rej_q_${idx}`).row();
  });
  kb.text('✍️ Написать свой вариант', 'rej_custom').row();
  kb.text('❌ Отмена', 'rej_cancel');

  await ctx.reply(`🔴 <b>Отклонение заявки #${requestId}</b>\n\nВыберите или введите причину отказа:`, {
    parse_mode: 'HTML',
    reply_markup: kb,
  });

  let reason = '';
  const reasonCtx = await conversation.waitFor(['callback_query:data', ':text']);

  if (reasonCtx.callbackQuery) {
    await reasonCtx.answerCallbackQuery();
    const data = reasonCtx.callbackQuery.data!;

    if (data === 'rej_cancel') {
      await reasonCtx.editMessageText('❌ Действие отменено.');
      return;
    } else if (data === 'rej_custom') {
      await reasonCtx.editMessageText('✍️ <b>Введите причину отказа текстом:</b>', {
        parse_mode: 'HTML',
      });
      const customCtx = await conversation.waitFor(':text');
      reason = customCtx.message!.text!.trim();
    } else if (data.startsWith('rej_q_')) {
      const idx = parseInt(data.replace('rej_q_', ''), 10);
      reason = REJECTION_REASONS[idx];
      await reasonCtx.editMessageText(`Причина: <i>${reason}</i>`, { parse_mode: 'HTML' });
    }
  } else if (reasonCtx.message?.text) {
    reason = reasonCtx.message.text.trim();
  }

  // Update DB & notify author
  await conversation.external(async () => {
    const updated = await requestService.rejectRequest(requestId, managerId, reason);
    await notificationService.notifyAuthorStatusChange(
      ctx.api as any,
      updated as any,
      `Заявка отклонена завхозом.`
    ).catch(console.error);
    return true;
  });

  await ctx.reply(`❌ <b>Заявка #${requestId} успешно отклонена.</b>\nАвтор заявки получил уведомление.`, {
    parse_mode: 'HTML',
  });
}
