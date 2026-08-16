import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RequestStatus, Urgency, Prisma } from '@prisma/client';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    request: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('../../../src/db/client.js', () => ({
  prisma: prismaMock,
}));

vi.mock('../../../src/services/requestService.js', () => ({
  requestService: {
    getManagerRequests: vi.fn(),
    getCurrentMonthExpenses: vi.fn().mockResolvedValue({
      totalSpent: 400,
      totalEstimated: 100,
      requestsCount: 3,
      budgetLimit: 900,
      remainingBudget: 500,
      isBudgetExceeded: false,
    }),
    getExpensesByPost: vi.fn().mockResolvedValue([
      { postName: 'Слесарный / Подъемник', totalAmount: 400, count: 2 },
    ]),
    setMonthlyBudgetLimit: vi.fn().mockResolvedValue(1200),
    approveRequest: vi.fn().mockResolvedValue({ id: 10, userId: 123456n, itemName: 'Ключ' }),
    takeToWork: vi.fn().mockResolvedValue({ id: 10, userId: 123456n, itemName: 'Ключ динамометрический' }),
    markAsDelivered: vi.fn().mockResolvedValue({ id: 10, itemName: 'Ключ', user: { fullName: 'Мастер' } }),
  },
}));

vi.mock('../../../src/services/notificationService.js', () => ({
  notificationService: {
    notifyAuthorStatusChange: vi.fn().mockResolvedValue(undefined),
  },
}));

import { managerHandlers } from '../../../src/bot/handlers/manager.js';
import { requestService } from '../../../src/services/requestService.js';
import { notificationService } from '../../../src/services/notificationService.js';

describe('Manager & Director Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should calculate and display expense summary for Director', async () => {
    (requestService.getManagerRequests as any).mockImplementation((filter: any) => {
      if (filter.status === RequestStatus.COMPLETED) {
        return Promise.resolve([
          { id: 1, actualPrice: new Prisma.Decimal(150) },
          { id: 2, actualPrice: new Prisma.Decimal(250) },
        ]);
      }
      if (filter.status === RequestStatus.ORDERED) {
        return Promise.resolve([{ id: 3, actualPrice: new Prisma.Decimal(100) }]);
      }
      return Promise.resolve([]);
    });

    const ctx: any = {
      update: {
        update_id: 1,
        message: {
          message_id: 1,
          text: '📊 Сводка расходов',
          from: { id: 999999, is_bot: false, first_name: 'Director' },
          chat: { id: 999999, type: 'private' },
          date: Date.now(),
        },
      },
      message: {
        message_id: 1,
        text: '📊 Сводка расходов',
        from: { id: 999999, is_bot: false, first_name: 'Director' },
        chat: { id: 999999, type: 'private' },
        date: Date.now(),
      },
      from: { id: 999999, is_bot: false, first_name: 'Director' },
      reply: vi.fn().mockResolvedValue(true),
    };

    const middleware = managerHandlers.middleware();
    await middleware(ctx, async () => {});

    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('СВОДКА РАСХОДОВ И БЮДЖЕТА'),
      expect.objectContaining({ parse_mode: 'HTML' })
    );

    const replyText = ctx.reply.mock.calls[0][0];
    expect(replyText).toContain('400 ₾'); // 150 + 250 completed
    expect(replyText).toContain('100 ₾'); // 100 ordered
    expect(replyText).toContain('500 ₾'); // Total turnover
  });

  it('should handle takeToWork action and notify author', async () => {
    const ctx: any = {
      update: {
        update_id: 1,
        callback_query: {
          id: 'cb_take',
          from: { id: 999999, is_bot: false, first_name: 'Zavhoz' },
          data: 'req_take_10',
          message: { text: 'Заявка #10' },
        },
      },
      callbackQuery: {
        id: 'cb_take',
        from: { id: 999999, is_bot: false, first_name: 'Zavhoz' },
        data: 'req_take_10',
        message: { text: 'Заявка #10' },
      },
      from: { id: 999999, is_bot: false, first_name: 'Zavhoz' },
      api: {},
      answerCallbackQuery: vi.fn().mockResolvedValue(true),
      editMessageText: vi.fn().mockResolvedValue(true),
    };

    const middleware = managerHandlers.middleware();
    await middleware(ctx, async () => {});

    expect(requestService.takeToWork).toHaveBeenCalledWith(10, 999999n);
    expect(notificationService.notifyAuthorStatusChange).toHaveBeenCalled();
  });
});
