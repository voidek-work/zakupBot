import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Urgency, RequestStatus, Prisma } from '@prisma/client';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    user: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('../../src/db/client.js', () => ({
  prisma: prismaMock,
}));

vi.mock('../../src/config/env.js', () => ({
  env: {
    MANAGER_TELEGRAM_IDS: [111111n],
    DIRECTOR_TELEGRAM_IDS: [222222n],
  },
}));

vi.mock('../../src/services/requestService.js', () => ({
  requestService: {
    getPlannedRequestsForDigest: vi.fn(),
  },
}));

vi.mock('../../src/services/regularService.js', () => ({
  regularService: {
    getActiveItems: vi.fn(),
  },
}));

import { NotificationService } from '../../src/services/notificationService.js';
import { requestService } from '../../src/services/requestService.js';
import { regularService } from '../../src/services/regularService.js';

describe('NotificationService', () => {
  let notificationService: NotificationService;
  let botMock: any;

  beforeEach(() => {
    vi.clearAllMocks();
    notificationService = new NotificationService();

    botMock = {
      api: {
        sendMessage: vi.fn().mockResolvedValue({ message_id: 1 }),
        sendPhoto: vi.fn().mockResolvedValue({ message_id: 2 }),
      },
    };
  });

  describe('notifyNewRequest', () => {
    it('should send urgent alert with buttons to all configured managers', async () => {
      prismaMock.user.findMany.mockResolvedValue([{ id: 333333n }] as any);

      const request: any = {
        id: 42,
        userId: 123456n,
        postName: 'Пост 1',
        itemName: 'Диагностический кабель OBD',
        quantity: '1 шт',
        estPrice: new Prisma.Decimal(250),
        urgency: Urgency.URGENT,
        justification: 'Срочно для машины на подъемнике',
        link: 'https://example.com/item',
        photoFileId: null,
        status: RequestStatus.NEW,
        user: { fullName: 'Алексей Механик' },
        category: { name: 'Специнструмент', icon: '🔧' },
      };

      await notificationService.notifyNewRequest(botMock, request);

      // Managers are 333333n (DB) and 111111n (ENV)
      expect(botMock.api.sendMessage).toHaveBeenCalledTimes(2);
      const call = botMock.api.sendMessage.mock.calls[0];
      expect(call[1]).toContain('СРОЧНАЯ ЗАЯВКА НА ЗАКУПКУ');
      expect(call[1]).toContain('Диагностический кабель OBD');
      expect(call[1]).toContain('Алексей Механик');
      expect(call[2].reply_markup).toBeDefined();
    });

    it('should send photo message if photoFileId is attached', async () => {
      prismaMock.user.findMany.mockResolvedValue([]);

      const request: any = {
        id: 43,
        userId: 123456n,
        postName: 'Пост 2',
        itemName: 'Сломанная насадка',
        quantity: '1 шт',
        estPrice: null,
        urgency: Urgency.PLANNED,
        justification: 'Треснула головка на 17',
        link: null,
        photoFileId: 'photo_file_123',
        status: RequestStatus.NEW,
        user: { fullName: 'Сергей' },
        category: { name: 'Специнструмент', icon: '🔧' },
      };

      await notificationService.notifyNewRequest(botMock, request);

      expect(botMock.api.sendPhoto).toHaveBeenCalledTimes(1);
      expect(botMock.api.sendPhoto).toHaveBeenCalledWith(
        111111,
        'photo_file_123',
        expect.objectContaining({
          caption: expect.stringContaining('Новая плановая заявка'),
          parse_mode: 'HTML',
        })
      );
    });
  });

  describe('notifyAuthorStatusChange', () => {
    it('should notify author when request status is DELIVERED and include receipt confirmation button', async () => {
      const request: any = {
        id: 42,
        userId: 123456n,
        itemName: 'WD-40',
        quantity: '2 шт',
        status: RequestStatus.DELIVERED,
      };

      await notificationService.notifyAuthorStatusChange(botMock, request);

      expect(botMock.api.sendMessage).toHaveBeenCalledWith(
        123456,
        expect.stringContaining('Товар доставлен на склад автосервиса'),
        expect.objectContaining({
          reply_markup: expect.anything(),
        })
      );
    });

    it('should notify author with rejection reason when request is REJECTED', async () => {
      const request: any = {
        id: 42,
        userId: 123456n,
        itemName: 'Дорогой гайковерт',
        quantity: '1 шт',
        status: RequestStatus.REJECTED,
        rejectReason: 'Слишком дорого / Не согласовано',
      };

      await notificationService.notifyAuthorStatusChange(botMock, request);

      expect(botMock.api.sendMessage).toHaveBeenCalledWith(
        123456,
        expect.stringContaining('Слишком дорого / Не согласовано'),
        expect.anything()
      );
    });
  });

  describe('sendWeeklyPlannedDigest', () => {
    it('should compile planned requests and total sum into digest for managers', async () => {
      prismaMock.user.findMany.mockResolvedValue([]);

      const mockPlanned = [
        {
          id: 1,
          itemName: 'Герметик Victor Reinz',
          quantity: '3 шт',
          estPrice: new Prisma.Decimal(90),
          postName: 'Пост 1',
          user: { fullName: 'Иван' },
        },
        {
          id: 2,
          itemName: 'Очиститель карбюратора',
          quantity: '2 шт',
          estPrice: new Prisma.Decimal(40),
          postName: 'Агрегатка',
          user: { fullName: 'Олег' },
        },
      ];

      (requestService.getPlannedRequestsForDigest as any).mockResolvedValue(mockPlanned);

      await notificationService.sendWeeklyPlannedDigest(botMock);

      expect(botMock.api.sendMessage).toHaveBeenCalledTimes(1);
      const messageText = botMock.api.sendMessage.mock.calls[0][1];
      expect(messageText).toContain('ЕЖЕНЕДЕЛЬНЫЙ ДАЙДЖЕСТ ПЛАНОВЫХ ЗАКУПОК');
      expect(messageText).toContain('Всего заявок в пуле: <b>2 шт</b>');
      expect(messageText).toContain('130 ₾');
      expect(messageText).toContain('Герметик Victor Reinz');
    });
  });

  describe('sendInventoryChecklistPrompt', () => {
    it('should send inventory checklist prompt to managers', async () => {
      prismaMock.user.findMany.mockResolvedValue([]);
      (regularService.getActiveItems as any).mockResolvedValue([{ id: 1 }, { id: 2 }]);

      await notificationService.sendInventoryChecklistPrompt(botMock);

      expect(botMock.api.sendMessage).toHaveBeenCalledTimes(1);
      const messageText = botMock.api.sendMessage.mock.calls[0][1];
      expect(messageText).toContain('ПЯТНИЧНЫЙ ОБХОД И ИНВЕНТАРИЗАЦИЯ РАСХОДНИКОВ');
      expect(messageText).toContain('2 шт');
    });
  });
});
