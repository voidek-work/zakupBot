import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RequestStatus, Urgency, Prisma } from '@prisma/client';
import { createPrismaMock } from '../mocks/prisma.mock.js';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    $connect: vi.fn().mockResolvedValue(undefined),
    $disconnect: vi.fn().mockResolvedValue(undefined),
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
      count: vi.fn(),
    },
    category: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    request: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    regularItem: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      upsert: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    setting: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn(),
    },
  },
}));

vi.mock('../../src/db/client.js', () => ({
  prisma: prismaMock,
}));

vi.mock('../../src/services/googleSheetsService.js', () => ({
  googleSheetsService: {
    appendRequest: vi.fn().mockResolvedValue(1),
    updateRequest: vi.fn().mockResolvedValue(undefined),
  },
}));

import { RequestService } from '../../src/services/requestService.js';
import { googleSheetsService } from '../../src/services/googleSheetsService.js';

describe('RequestService', () => {
  let requestService: RequestService;

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.request.findMany.mockResolvedValue([]);
    prismaMock.setting.findUnique.mockResolvedValue(null);
    requestService = new RequestService();
  });

  describe('createRequest', () => {
    it('should create a request with status NEW and record an AuditLog entry', async () => {
      const mockCreated = {
        id: 101,
        userId: 123456n,
        categoryId: 2,
        postName: 'Пост 1',
        itemName: 'Очиститель тормозов',
        quantity: '5 баллонов',
        estPrice: new Prisma.Decimal(150),
        urgency: Urgency.URGENT,
        justification: 'Закончился на посту',
        link: 'https://example.com',
        photoFileId: 'file_abc',
        status: RequestStatus.NEW,
        createdAt: new Date(),
        updatedAt: new Date(),
        user: { id: 123456n, fullName: 'Иван Мастер' },
        category: { id: 2, name: 'Химия и масла', icon: '🧴' },
      };

      prismaMock.request.create.mockResolvedValue(mockCreated);
      prismaMock.auditLog.create.mockResolvedValue({ id: 1 });

      const result = await requestService.createRequest({
        userId: 123456n,
        categoryId: 2,
        postName: 'Пост 1',
        itemName: 'Очиститель тормозов',
        quantity: '5 баллонов',
        estPrice: 150,
        urgency: Urgency.URGENT,
        justification: 'Закончился на посту',
        link: 'https://example.com',
        photoFileId: 'file_abc',
      });

      expect(prismaMock.request.create).toHaveBeenCalledWith({
        data: {
          userId: 123456n,
          categoryId: 2,
          postName: 'Пост 1',
          itemName: 'Очиститель тормозов',
          quantity: '5 баллонов',
          estPrice: expect.any(Prisma.Decimal),
          urgency: Urgency.URGENT,
          justification: 'Закончился на посту',
          link: 'https://example.com',
          photoFileId: 'file_abc',
          status: RequestStatus.NEW,
        },
        include: {
          user: true,
          category: true,
        },
      });

      expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          requestId: 101,
          userId: 123456n,
          action: 'CREATE',
          newStatus: RequestStatus.NEW,
        }),
      });

      expect(googleSheetsService.appendRequest).toHaveBeenCalledWith(mockCreated);
      expect(result.id).toBe(101);
    });
  });

  describe('getRequestById & getUserRequests', () => {
    it('should retrieve a single request by ID with relations', async () => {
      const mockReq = { id: 101, itemName: 'Съемник' };
      prismaMock.request.findUnique.mockResolvedValue(mockReq as any);

      const result = await requestService.getRequestById(101);
      expect(prismaMock.request.findUnique).toHaveBeenCalledWith({
        where: { id: 101 },
        include: {
          user: true,
          category: true,
          auditLogs: {
            include: { user: true },
            orderBy: { createdAt: 'desc' },
          },
        },
      });
      expect(result).toEqual(mockReq);
    });

    it('should retrieve user requests ordered by creation date', async () => {
      const mockList = [{ id: 1 }, { id: 2 }];
      prismaMock.request.findMany.mockResolvedValue(mockList as any);

      const result = await requestService.getUserRequests(123456n, 5);
      expect(prismaMock.request.findMany).toHaveBeenCalledWith({
        where: { userId: 123456n },
        include: { category: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });
      expect(result).toEqual(mockList);
    });
  });

  describe('Lifecycle State Transitions', () => {
    it('takeToWork: should change status to IN_PROGRESS and log audit', async () => {
      const mockUpdated = { id: 101, status: RequestStatus.IN_PROGRESS };
      prismaMock.request.update.mockResolvedValue(mockUpdated as any);
      prismaMock.auditLog.create.mockResolvedValue({ id: 2 });

      const result = await requestService.takeToWork(101, 99999n);
      expect(prismaMock.request.update).toHaveBeenCalledWith({
        where: { id: 101 },
        data: { status: RequestStatus.IN_PROGRESS },
        include: { user: true, category: true },
      });
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          requestId: 101,
          userId: 99999n,
          action: 'TAKE_TO_WORK',
          oldStatus: RequestStatus.NEW,
          newStatus: RequestStatus.IN_PROGRESS,
        }),
      });
      expect(result.status).toBe(RequestStatus.IN_PROGRESS);
    });

    it('markAsOrdered: should update price, expected date and status to ORDERED', async () => {
      const mockUpdated = {
        id: 101,
        status: RequestStatus.ORDERED,
        actualPrice: new Prisma.Decimal(120),
      };
      prismaMock.request.update.mockResolvedValue(mockUpdated as any);
      prismaMock.auditLog.create.mockResolvedValue({ id: 3 });

      const expectedDate = new Date('2026-08-20');
      const result = await requestService.markAsOrdered(
        101,
        99999n,
        120,
        expectedDate,
        'receipt_123'
      );

      expect(prismaMock.request.update).toHaveBeenCalledWith({
        where: { id: 101 },
        data: {
          status: RequestStatus.ORDERED,
          actualPrice: expect.any(Prisma.Decimal),
          expectedDate,
          receiptFileId: 'receipt_123',
        },
        include: { user: true, category: true },
      });
      expect(result.status).toBe(RequestStatus.ORDERED);
    });

    it('markAsDelivered: should set deliveredAt timestamp and status to DELIVERED', async () => {
      const mockUpdated = { id: 101, status: RequestStatus.DELIVERED };
      prismaMock.request.update.mockResolvedValue(mockUpdated as any);
      prismaMock.auditLog.create.mockResolvedValue({ id: 4 });

      const result = await requestService.markAsDelivered(101, 99999n);
      expect(prismaMock.request.update).toHaveBeenCalledWith({
        where: { id: 101 },
        data: {
          status: RequestStatus.DELIVERED,
          deliveredAt: expect.any(Date),
        },
        include: { user: true, category: true },
      });
      expect(result.status).toBe(RequestStatus.DELIVERED);
    });

    it('markAsCompleted: should set completedAt timestamp and status to COMPLETED', async () => {
      const mockUpdated = { id: 101, status: RequestStatus.COMPLETED };
      prismaMock.request.update.mockResolvedValue(mockUpdated as any);
      prismaMock.auditLog.create.mockResolvedValue({ id: 5 });

      const result = await requestService.markAsCompleted(101, 123456n);
      expect(prismaMock.request.update).toHaveBeenCalledWith({
        where: { id: 101 },
        data: {
          status: RequestStatus.COMPLETED,
          completedAt: expect.any(Date),
        },
        include: { user: true, category: true },
      });
      expect(result.status).toBe(RequestStatus.COMPLETED);
    });

    it('rejectRequest: should store rejection reason and change status to REJECTED', async () => {
      const mockUpdated = {
        id: 101,
        status: RequestStatus.REJECTED,
        rejectReason: 'Есть в наличии на складе',
      };
      prismaMock.request.update.mockResolvedValue(mockUpdated as any);
      prismaMock.auditLog.create.mockResolvedValue({ id: 6 });

      const result = await requestService.rejectRequest(
        101,
        99999n,
        'Есть в наличии на складе'
      );

      expect(prismaMock.request.update).toHaveBeenCalledWith({
        where: { id: 101 },
        data: {
          status: RequestStatus.REJECTED,
          rejectReason: 'Есть в наличии на складе',
        },
        include: { user: true, category: true },
      });
      expect(result.rejectReason).toBe('Есть в наличии на складе');
    });

    it('cancelRequest: should cancel request, set rejectReason and write CANCEL audit log', async () => {
      const mockReq = { id: 101, status: RequestStatus.NEW, itemName: 'Масло' };
      prismaMock.request.findUnique.mockResolvedValue(mockReq as any);
      prismaMock.request.update.mockResolvedValue({
        ...mockReq,
        status: RequestStatus.REJECTED,
        rejectReason: 'Отменено автором',
      } as any);
      prismaMock.auditLog.create.mockResolvedValue({ id: 7 });

      const result = await requestService.cancelRequest(101, 123456n, 'Отменено автором');

      expect(prismaMock.request.update).toHaveBeenCalledWith({
        where: { id: 101 },
        data: {
          status: RequestStatus.REJECTED,
          rejectReason: 'Отменено автором',
        },
        include: { user: true, category: true },
      });

      expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          requestId: 101,
          userId: 123456n,
          action: 'CANCEL',
          newStatus: RequestStatus.REJECTED,
        }),
      });

      expect(result.status).toBe(RequestStatus.REJECTED);
    });

    it('cancelRequest: should throw error if trying to cancel delivered or completed request', async () => {
      const mockReq = { id: 101, status: RequestStatus.DELIVERED };
      prismaMock.request.findUnique.mockResolvedValue(mockReq as any);

      await expect(requestService.cancelRequest(101, 123456n)).rejects.toThrow(
        'Нельзя отменить уже доставленный или закрытый заказ'
      );
    });

    it('updateRequestDetails: should update allowed fields and write EDIT audit log', async () => {
      const mockReq = {
        id: 101,
        status: RequestStatus.NEW,
        itemName: 'Старое имя',
        quantity: '1 шт',
        estPrice: new Prisma.Decimal(50),
        urgency: Urgency.PLANNED,
        justification: 'Старое обоснование',
        postName: 'Пост 1',
      };
      prismaMock.request.findUnique.mockResolvedValue(mockReq as any);
      prismaMock.request.update.mockResolvedValue({
        ...mockReq,
        itemName: 'Новое имя',
        quantity: '3 шт',
        estPrice: new Prisma.Decimal(100),
      } as any);
      prismaMock.auditLog.create.mockResolvedValue({ id: 8 });

      const result = await requestService.updateRequestDetails(101, 123456n, {
        itemName: 'Новое имя',
        quantity: '3 шт',
        estPrice: 100,
      });

      expect(prismaMock.request.update).toHaveBeenCalledWith({
        where: { id: 101 },
        data: expect.objectContaining({
          itemName: 'Новое имя',
          quantity: '3 шт',
          estPrice: expect.any(Prisma.Decimal),
        }),
        include: { user: true, category: true },
      });

      expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          requestId: 101,
          userId: 123456n,
          action: 'EDIT',
          comment: expect.stringContaining('Редактирование заявки'),
        }),
      });

      expect(result.itemName).toBe('Новое имя');
    });

    it('updateRequestDetails: should throw error if request is in ORDERED or COMPLETED status', async () => {
      const mockReq = { id: 101, status: RequestStatus.ORDERED };
      prismaMock.request.findUnique.mockResolvedValue(mockReq as any);

      await expect(
        requestService.updateRequestDetails(101, 123456n, { itemName: 'Тест' })
      ).rejects.toThrow('Нельзя редактировать уже заказанные или завершенные заявки');
    });
  });

  describe('getPlannedRequestsForDigest', () => {
    it('should query only PLANNED urgency requests in NEW or IN_PROGRESS statuses', async () => {
      prismaMock.request.findMany.mockResolvedValue([]);

      await requestService.getPlannedRequestsForDigest();
      expect(prismaMock.request.findMany).toHaveBeenCalledWith({
        where: {
          urgency: Urgency.PLANNED,
          status: { in: [RequestStatus.NEW, RequestStatus.IN_PROGRESS] },
        },
        include: {
          user: true,
          category: true,
        },
        orderBy: { createdAt: 'asc' },
      });
    });
  });
});
