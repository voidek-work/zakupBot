import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Urgency } from '@prisma/client';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    category: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock('../../../src/db/client.js', () => ({
  prisma: prismaMock,
}));

vi.mock('../../../src/services/requestService.js', () => ({
  requestService: {
    createRequest: vi.fn().mockResolvedValue({ id: 101 }),
  },
}));

vi.mock('../../../src/services/regularService.js', () => ({
  regularService: {
    getActiveItems: vi.fn().mockResolvedValue([
      { id: 1, name: 'WD-40 400мл', defaultQuantity: '6', unit: 'баллон', category: 'Химия' },
      { id: 2, name: 'Перчатки L', defaultQuantity: '5', unit: 'пачка', category: 'Расходники' },
    ]),
  },
}));

vi.mock('../../../src/services/googleSheetsService.js', () => ({
  googleSheetsService: {
    syncRegularItemsFromSheet: vi.fn().mockResolvedValue(0),
  },
}));

import { regularHandlers } from '../../../src/bot/handlers/regular.js';
import { requestService } from '../../../src/services/requestService.js';

describe('Regular Handlers (Inventory Checklist Flow)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle item ordering during checklist and create planned requests on completion', async () => {
    prismaMock.category.findFirst.mockResolvedValue({ id: 3, name: 'Расходники и крепёж' });

    const middleware = regularHandlers.middleware();

    // Simulate ordering item 1 (WD-40)
    const ctxOrder: any = {
      update: {
        update_id: 1,
        callback_query: {
          id: 'cb_ord_1',
          from: { id: 777777, is_bot: false, first_name: 'Zavhoz' },
          data: 'chk_ord_1',
        },
      },
      callbackQuery: {
        id: 'cb_ord_1',
        from: { id: 777777, is_bot: false, first_name: 'Zavhoz' },
        data: 'chk_ord_1',
      },
      from: { id: 777777, is_bot: false, first_name: 'Zavhoz' },
      session: {
        tempData: {
          checklistItems: [
            { id: 1, name: 'WD-40 400мл', defaultQuantity: '6', unit: 'баллон', category: 'Химия' },
            { id: 2, name: 'Перчатки L', defaultQuantity: '5', unit: 'пачка', category: 'Расходники' },
          ],
          checklistIndex: 0,
          ordersToCreate: [],
        },
      },
      answerCallbackQuery: vi.fn().mockResolvedValue(true),
      editMessageText: vi.fn().mockResolvedValue(true),
    };

    await middleware(ctxOrder, async () => {});

    expect(ctxOrder.session.tempData.ordersToCreate).toHaveLength(1);
    expect(ctxOrder.session.tempData.ordersToCreate[0]).toEqual({
      name: 'WD-40 400мл',
      quantity: '6 баллон',
      category: 'Химия',
    });

    // Simulate finishing checklist
    const ctxFinish: any = {
      update: {
        update_id: 2,
        callback_query: {
          id: 'cb_finish',
          from: { id: 777777, is_bot: false, first_name: 'Zavhoz' },
          data: 'chk_finish',
        },
      },
      callbackQuery: {
        id: 'cb_finish',
        from: { id: 777777, is_bot: false, first_name: 'Zavhoz' },
        data: 'chk_finish',
      },
      from: { id: 777777, is_bot: false, first_name: 'Zavhoz' },
      session: ctxOrder.session,
      answerCallbackQuery: vi.fn().mockResolvedValue(true),
      editMessageText: vi.fn().mockResolvedValue(true),
    };

    await middleware(ctxFinish, async () => {});

    expect(requestService.createRequest).toHaveBeenCalledWith({
      userId: 777777n,
      categoryId: 3,
      postName: 'Склад расходников цеха',
      itemName: 'WD-40 400мл',
      quantity: '6 баллон',
      urgency: Urgency.PLANNED,
      justification: 'Плановое пополнение по итогам инвентаризации',
    });

    expect(ctxFinish.editMessageText).toHaveBeenCalledWith(
      expect.stringContaining('ИНВЕНТАРИЗАЦИЯ УСПЕШНО ЗАВЕРШЕНА'),
      expect.anything()
    );
  });
});
