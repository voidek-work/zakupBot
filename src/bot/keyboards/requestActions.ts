import { InlineKeyboard } from 'grammy';
import { Request, User, Category } from '@prisma/client';
import { REJECTION_REASONS } from '../../config/constants.js';

export function getRequestActionsKeyboard(
  request: Request & { user: User; category: Category },
  viewerRole: 'MECHANIC' | 'MANAGER' | 'DIRECTOR'
): InlineKeyboard {
  const kb = new InlineKeyboard();

  if (viewerRole === 'MANAGER') {
    if (request.status === 'NEW') {
      kb.text('🟢 В работу', `req_take_${request.id}`)
        .text('🛒 Заказано', `req_order_${request.id}`)
        .row()
        .text('🔴 Отклонить', `req_reject_${request.id}`)
        .url('💬 Автор', `tg://user?id=${request.userId}`);
    } else if (request.status === 'IN_PROGRESS') {
      kb.text('🛒 Заказано', `req_order_${request.id}`)
        .text('🔴 Отклонить', `req_reject_${request.id}`)
        .row()
        .url('💬 Автор', `tg://user?id=${request.userId}`);
    } else if (request.status === 'ORDERED') {
      kb.text('📦 Доставлено на склад', `req_deliver_${request.id}`)
        .row()
        .url('💬 Автор', `tg://user?id=${request.userId}`);
    } else if (request.status === 'DELIVERED') {
      kb.text('✅ Выдано мастеру', `req_complete_${request.id}`)
        .row()
        .url('💬 Автор', `tg://user?id=${request.userId}`);
    }
  } else if (viewerRole === 'MECHANIC') {
    if (request.status === 'DELIVERED') {
      kb.text('✅ Получил на руки', `req_complete_${request.id}`);
    }
  }

  return kb;
}

export function getRejectionReasonsKeyboard(requestId: number): InlineKeyboard {
  const kb = new InlineKeyboard();

  REJECTION_REASONS.forEach((reason, index) => {
    kb.text(reason, `reject_quick_${requestId}_${index}`).row();
  });

  kb.text('✍️ Ввести свою причину', `reject_custom_${requestId}`).row();
  kb.text('⬅️ Назад', `req_view_${requestId}`);

  return kb;
}

export function getUrgencyKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('🔴 СРОЧНО (Горит пост)', 'urgency_URGENT')
    .row()
    .text('🟡 Планово (В еженедельную закупку)', 'urgency_PLANNED');
}

export function getCommonQuantityKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('1 шт', 'qty_1 шт')
    .text('2 шт', 'qty_2 шт')
    .text('5 шт', 'qty_5 шт')
    .row()
    .text('1 коробка', 'qty_1 коробка')
    .text('1 баллон', 'qty_1 баллон')
    .text('1 пачка', 'qty_1 пачка')
    .row()
    .text('✍️ Ввести вручную', 'qty_custom');
}

export function getPostsKeyboard(posts: string[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  posts.forEach((post, index) => {
    kb.text(post, `post_${index}`);
    if (index % 2 === 1) kb.row();
  });
  return kb;
}
