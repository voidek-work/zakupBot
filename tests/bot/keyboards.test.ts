import { describe, it, expect } from 'vitest';
import { Role, RequestStatus, Urgency } from '@prisma/client';
import {
  getMainKeyboard,
  getCancelKeyboard,
  getSkipOrCancelKeyboard,
} from '../../src/bot/keyboards/main.js';
import {
  getRegularManagementKeyboard,
  getRegularItemCardKeyboard,
  getInventoryChecklistButtons,
} from '../../src/bot/keyboards/regularItems.js';
import {
  getRequestActionsKeyboard,
  getRejectionReasonsKeyboard,
  getUrgencyKeyboard,
  getCommonQuantityKeyboard,
  getPostsKeyboard,
} from '../../src/bot/keyboards/requestActions.js';

describe('Bot Keyboards', () => {
  describe('getMainKeyboard', () => {
    it('should generate appropriate keyboard buttons for MECHANIC', () => {
      const kb = getMainKeyboard(Role.MECHANIC);
      const textButtons = kb.build().flat().map((btn) => btn.text);

      expect(textButtons).toContain('➕ Новая заявка');
      expect(textButtons).toContain('📋 Мои заявки');
      expect(textButtons).toContain('⚡ Быстрый расходник');
      expect(textButtons).toContain('👤 Профиль / Пост');
      expect(textButtons).not.toContain('🔄 Расходники цеха');
    });

    it('should generate appropriate keyboard buttons for MANAGER', () => {
      const kb = getMainKeyboard(Role.MANAGER);
      const textButtons = kb.build().flat().map((btn) => btn.text);

      expect(textButtons).toContain('➕ Создать заявку');
      expect(textButtons).toContain('📥 Новые заявки');
      expect(textButtons).toContain('⏳ В работе / Заказано');
      expect(textButtons).toContain('🔄 Расходники цеха');
      expect(textButtons).toContain('📋 Все заявки');
    });

    it('should generate appropriate keyboard buttons for DIRECTOR', () => {
      const kb = getMainKeyboard(Role.DIRECTOR);
      const textButtons = kb.build().flat().map((btn) => btn.text);

      expect(textButtons).toContain('📊 Сводка расходов');
      expect(textButtons).toContain('📥 Заявки на согласование');
      expect(textButtons).toContain('📋 Все заявки');
    });
  });

  describe('Control Keyboards', () => {
    it('getCancelKeyboard: should create single Cancel button', () => {
      const kb = getCancelKeyboard();
      const textButtons = kb.build().flat().map((btn) => btn.text);
      expect(textButtons).toEqual(['❌ Отмена']);
    });

    it('getSkipOrCancelKeyboard: should create Skip and Cancel buttons', () => {
      const kb = getSkipOrCancelKeyboard();
      const textButtons = kb.build().flat().map((btn) => btn.text);
      expect(textButtons).toContain('➡️ Пропустить');
      expect(textButtons).toContain('❌ Отмена');
    });
  });

  describe('Regular Items Keyboards', () => {
    it('getRegularManagementKeyboard: should provide checklist and management buttons', () => {
      const kb = getRegularManagementKeyboard();
      const buttons = kb.inline_keyboard.flat().map((b) => b.text);
      expect(buttons).toContain('🚀 Начать чек-лист обхода');
      expect(buttons).toContain('➕ Добавить расходник');
      expect(buttons).toContain('📋 Список позиций');
    });

    it('getRegularItemCardKeyboard: should toggle active button label correctly', () => {
      const activeItem: any = { id: 1, isActive: true };
      const inactiveItem: any = { id: 2, isActive: false };

      const activeKb = getRegularItemCardKeyboard(activeItem);
      const activeButtons = activeKb.inline_keyboard.flat().map((b) => b.text);
      expect(activeButtons).toContain('⏸ Приостановить');

      const inactiveKb = getRegularItemCardKeyboard(inactiveItem);
      const inactiveButtons = inactiveKb.inline_keyboard.flat().map((b) => b.text);
      expect(inactiveButtons).toContain('▶️ Активировать');
    });
  });

  describe('Request Action Keyboards', () => {
    it('should generate manager action buttons according to status', () => {
      const req: any = { id: 10, userId: 123n, status: RequestStatus.NEW };
      const kb = getRequestActionsKeyboard(req, 'MANAGER');
      const buttons = kb.inline_keyboard.flat().map((b) => b.text);

      expect(buttons).toContain('🟢 В работу');
      expect(buttons).toContain('🛒 Заказано');
      expect(buttons).toContain('🔴 Отклонить');
    });

    it('should generate delivered receipt button for mechanic', () => {
      const req: any = { id: 10, userId: 123n, status: RequestStatus.DELIVERED };
      const kb = getRequestActionsKeyboard(req, 'MECHANIC');
      const buttons = kb.inline_keyboard.flat().map((b) => b.text);

      expect(buttons).toContain('✅ Получил на руки');
    });

    it('getRejectionReasonsKeyboard: should list quick rejection reasons', () => {
      const kb = getRejectionReasonsKeyboard(10);
      const buttons = kb.inline_keyboard.flat().map((b) => b.text);
      expect(buttons).toContain('Есть в наличии на складе');
      expect(buttons).toContain('✍️ Ввести свою причину');
    });

    it('getUrgencyKeyboard: should contain urgent and planned options', () => {
      const kb = getUrgencyKeyboard();
      const buttons = kb.inline_keyboard.flat().map((b) => b.text);
      expect(buttons.some((b) => b.includes('СРОЧНО'))).toBe(true);
      expect(buttons.some((b) => b.includes('Планово'))).toBe(true);
    });

    it('getPostsKeyboard: should render all workshop posts', () => {
      const posts = ['Пост 1', 'Пост 2', 'Шиномонтаж'];
      const kb = getPostsKeyboard(posts);
      const buttons = kb.inline_keyboard.flat().map((b) => b.text);
      expect(buttons).toEqual(posts);
    });
  });
});
