import { Keyboard } from 'grammy';
import { Role } from '@prisma/client';

export function getMainKeyboard(role: Role): Keyboard {
  const kb = new Keyboard().resized();

  if (role === 'MANAGER') {
    kb.text('➕ Создать заявку').text('📥 Новые заявки').row()
      .text('⏳ В работе / Заказано').text('🔄 Расходники цеха').row()
      .text('🔍 Поиск заявки').text('🏢 Расходы по постам').row()
      .text('📋 Все заявки').text('👤 Мой профиль');
  } else if (role === 'DIRECTOR') {
    kb.text('➕ Создать заявку').text('📊 Сводка расходов').row()
      .text('📥 Заявки на согласование').text('🏢 Расходы по постам').row()
      .text('⚙️ Бюджет цеха').text('🔍 Поиск заявки').row()
      .text('📋 Все заявки').text('👤 Мой профиль');
  } else {
    // Mechanic / Master
    kb.text('➕ Новая заявка').text('📋 Мои заявки').row()
      .text('⚡ Быстрый расходник').text('🔍 Поиск заявки').row()
      .text('👤 Профиль / Пост').text('📖 Справка');
  }

  return kb;
}

export function getCancelKeyboard(): Keyboard {
  return new Keyboard().text('❌ Отмена').resized().oneTime();
}

export function getSkipOrCancelKeyboard(): Keyboard {
  return new Keyboard().text('➡️ Пропустить').text('❌ Отмена').resized().oneTime();
}
