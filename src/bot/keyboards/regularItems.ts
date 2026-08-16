import { InlineKeyboard } from 'grammy';
import { RegularItem } from '@prisma/client';

export function getRegularManagementKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('🚀 Начать чек-лист обхода', 'reg_start_checklist')
    .row()
    .text('➕ Добавить расходник', 'reg_add_item')
    .text('📋 Список позиций', 'reg_list_items')
    .row()
    .text('📊 Посмотреть остатки', 'reg_view_stock');
}

export function getRegularItemCardKeyboard(item: RegularItem): InlineKeyboard {
  return new InlineKeyboard()
    .text(item.isActive ? '⏸ Приостановить' : '▶️ Активировать', `reg_toggle_${item.id}`)
    .text('✏️ Редактировать', `reg_edit_${item.id}`)
    .row()
    .text('🗑 Удалить', `reg_delete_${item.id}`)
    .text('⬅️ К списку', 'reg_list_items');
}

export function getInventoryChecklistButtons(
  item: RegularItem,
  currentIndex: number,
  totalCount: number
): InlineKeyboard {
  return new InlineKeyboard()
    .text(`➕ Заказать ${item.defaultQuantity} ${item.unit}`, `chk_order_${item.id}_${item.defaultQuantity}`)
    .row()
    .text('✍️ Указать другое кол-во', `chk_custom_${item.id}`)
    .row()
    .text('✅ Хватает (Пропустить)', `chk_skip_${item.id}`)
    .row()
    .text('❌ Завершить досрочно', 'chk_finish');
}
