import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPrismaMock } from '../../mocks/prisma.mock.js';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    category: {
      findFirst: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('../../../src/db/client.js', () => ({
  prisma: prismaMock,
}));

vi.mock('../../../src/services/requestService.js', () => ({
  requestService: {
    createRequest: vi.fn().mockResolvedValue({ id: 99 }),
  },
}));

import { mechanicHandlers } from '../../../src/bot/handlers/mechanic.js';
import { requestService } from '../../../src/services/requestService.js';

describe('Mechanic Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create quick consumable request and dynamically resolve category', async () => {
    prismaMock.category.findFirst.mockResolvedValue({ id: 22, name: 'Химия и масла' });

    let callbackMatchedHandler: any = null;
    // Inspect composer middleware
    const composer = mechanicHandlers as any;
    
    // Simulate callback context
    const ctx: any = {
      update: {
        update_id: 1,
        callback_query: {
          id: 'cb_123',
          from: { id: 123456, is_bot: false, first_name: 'Test' },
          data: 'quick_req_brake',
        },
      },
      callbackQuery: {
        id: 'cb_123',
        from: { id: 123456, is_bot: false, first_name: 'Test' },
        data: 'quick_req_brake',
      },
      from: { id: 123456, is_bot: false, first_name: 'Test' },
      dbUser: { postName: 'Пост 2' },
      answerCallbackQuery: vi.fn().mockResolvedValue(true),
      editMessageText: vi.fn().mockResolvedValue(true),
    };

    const middleware = mechanicHandlers.middleware();
    await middleware(ctx, async () => {});

    expect(requestService.createRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 123456n,
        categoryId: 22,
        postName: 'Пост 2',
        itemName: 'Очиститель тормозов 500мл',
        quantity: '1 баллон',
        urgency: 'URGENT',
      })
    );
    expect(ctx.editMessageText).toHaveBeenCalledWith(
      expect.stringContaining('Быстрая заявка #99 отправлена завхозу'),
      expect.anything()
    );
  });

  it('should handle cancel confirmation and execute cancelRequest', async () => {
    (requestService as any).cancelRequest = vi.fn().mockResolvedValue({
      id: 42,
      itemName: 'Очиститель тормозов',
    });

    const ctx: any = {
      update: {
        update_id: 2,
        callback_query: {
          id: 'cb_cancel',
          from: { id: 123456, is_bot: false, first_name: 'Test' },
          data: 'req_cancel_yes_42',
        },
      },
      callbackQuery: {
        id: 'cb_cancel',
        from: { id: 123456, is_bot: false, first_name: 'Test' },
        data: 'req_cancel_yes_42',
      },
      from: { id: 123456, is_bot: false, first_name: 'Test' },
      answerCallbackQuery: vi.fn().mockResolvedValue(true),
      editMessageText: vi.fn().mockResolvedValue(true),
    };

    const middleware = mechanicHandlers.middleware();
    await middleware(ctx, async () => {});

    expect((requestService as any).cancelRequest).toHaveBeenCalledWith(
      42,
      123456n,
      'Отменено автором'
    );
    expect(ctx.editMessageText).toHaveBeenCalledWith(
      expect.stringContaining('Заявка #42 (Очиститель тормозов) успешно отменена'),
      expect.anything()
    );
  });

  it('should handle req_edit callback and enter editRequestConversation', async () => {
    const ctx: any = {
      update: {
        update_id: 3,
        callback_query: {
          id: 'cb_edit',
          from: { id: 123456, is_bot: false, first_name: 'Test' },
          data: 'req_edit_42',
        },
      },
      callbackQuery: {
        id: 'cb_edit',
        from: { id: 123456, is_bot: false, first_name: 'Test' },
        data: 'req_edit_42',
      },
      from: { id: 123456, is_bot: false, first_name: 'Test' },
      session: { tempData: {} },
      conversation: {
        enter: vi.fn().mockResolvedValue(undefined),
      },
      answerCallbackQuery: vi.fn().mockResolvedValue(true),
    };

    const middleware = mechanicHandlers.middleware();
    await middleware(ctx, async () => {});

    expect(ctx.session.tempData.editRequestId).toBe(42);
    expect(ctx.conversation.enter).toHaveBeenCalledWith('editRequestConversation');
  });
});
