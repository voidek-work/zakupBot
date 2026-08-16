import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RequestStatus, Urgency, Prisma } from '@prisma/client';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    setting: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    request: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
}));

vi.mock('../../src/db/client.js', () => ({
  prisma: prismaMock,
}));

vi.mock('../../src/services/googleSheetsService.js', () => ({
  googleSheetsService: {
    appendRequest: vi.fn().mockResolvedValue(true),
    updateRequest: vi.fn().mockResolvedValue(true),
  },
}));

import { requestService } from '../../src/services/requestService.js';

describe('Budget, Analytics, Search & Approvals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Monthly Budget Management', () => {
    it('getMonthlyBudgetLimit: should return DB setting if present', async () => {
      prismaMock.setting.findUnique.mockResolvedValue({ key: 'monthly_budget_gel', value: '1200' });
      const limit = await requestService.getMonthlyBudgetLimit();
      expect(limit).toBe(1200);
    });

    it('getMonthlyBudgetLimit: should fallback to default 900 if setting not set', async () => {
      prismaMock.setting.findUnique.mockResolvedValue(null);
      const limit = await requestService.getMonthlyBudgetLimit();
      expect(limit).toBe(900);
    });

    it('setMonthlyBudgetLimit: should upsert setting in DB', async () => {
      prismaMock.setting.upsert.mockResolvedValue({ key: 'monthly_budget_gel', value: '1500' });
      const res = await requestService.setMonthlyBudgetLimit(1500);
      expect(prismaMock.setting.upsert).toHaveBeenCalledWith({
        where: { key: 'monthly_budget_gel' },
        update: { value: '1500' },
        create: { key: 'monthly_budget_gel', value: '1500' },
      });
      expect(res).toBe(1500);
    });

    it('getCurrentMonthExpenses: should aggregate spent and remaining budget', async () => {
      prismaMock.setting.findUnique.mockResolvedValue({ key: 'monthly_budget_gel', value: '900' });
      prismaMock.request.findMany.mockResolvedValue([
        { status: RequestStatus.COMPLETED, actualPrice: new Prisma.Decimal(300) },
        { status: RequestStatus.ORDERED, actualPrice: new Prisma.Decimal(250) },
        { status: RequestStatus.NEW, estPrice: new Prisma.Decimal(100) },
      ]);

      const stats = await requestService.getCurrentMonthExpenses();
      expect(stats.totalSpent).toBe(550); // 300 + 250
      expect(stats.totalEstimated).toBe(100);
      expect(stats.budgetLimit).toBe(900);
      expect(stats.remainingBudget).toBe(350); // 900 - 550
      expect(stats.isBudgetExceeded).toBe(false);
    });
  });

  describe('Post / Zone Expense Analytics', () => {
    it('getExpensesByPost: should aggregate and sort by post total descending', async () => {
      prismaMock.request.findMany.mockResolvedValue([
        { postName: 'Слесарный / Подъемник', actualPrice: new Prisma.Decimal(200) },
        { postName: 'Слесарный / Подъемник', actualPrice: new Prisma.Decimal(100) },
        { postName: 'Электрика / Диагностика', actualPrice: new Prisma.Decimal(450) },
        { postName: 'Кухня', estPrice: new Prisma.Decimal(50) },
      ]);

      const stats = await requestService.getExpensesByPost();
      expect(stats).toHaveLength(3);
      expect(stats[0].postName).toBe('Электрика / Диагностика');
      expect(stats[0].totalAmount).toBe(450);
      expect(stats[1].postName).toBe('Слесарный / Подъемник');
      expect(stats[1].totalAmount).toBe(300);
      expect(stats[1].count).toBe(2);
      expect(stats[2].postName).toBe('Кухня');
      expect(stats[2].totalAmount).toBe(50);
    });
  });

  describe('Search & Overdue Orders', () => {
    it('searchRequests: should search by ID when #123 is passed', async () => {
      prismaMock.request.findUnique.mockResolvedValue({ id: 123, itemName: 'Ключ' });

      const res = await requestService.searchRequests('#123');
      expect(prismaMock.request.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 123 } })
      );
      expect(res).toHaveLength(1);
    });

    it('searchRequests: should search by text query using contains', async () => {
      prismaMock.request.findMany.mockResolvedValue([{ id: 1, itemName: 'Масло моторное' }]);

      const res = await requestService.searchRequests('масло');
      expect(prismaMock.request.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { itemName: { contains: 'масло', mode: 'insensitive' } },
            ]),
          }),
        })
      );
      expect(res).toHaveLength(1);
    });

    it('getOverdueAndDueTodayOrders: should query orders with status ORDERED and expectedDate <= today', async () => {
      prismaMock.request.findMany.mockResolvedValue([{ id: 10, status: RequestStatus.ORDERED }]);

      const res = await requestService.getOverdueAndDueTodayOrders();
      expect(prismaMock.request.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: RequestStatus.ORDERED,
            expectedDate: expect.any(Object),
          }),
        })
      );
      expect(res).toHaveLength(1);
    });
  });

  describe('Director Approval & Budget Exceeded Flow', () => {
    it('createRequest: should set status to PENDING_APPROVAL if total month spent + estPrice > budgetLimit', async () => {
      prismaMock.setting.findUnique.mockResolvedValue({ key: 'monthly_budget_gel', value: '900' });
      prismaMock.request.findMany.mockResolvedValue([
        { status: RequestStatus.COMPLETED, actualPrice: new Prisma.Decimal(800) },
      ]);
      prismaMock.request.create.mockResolvedValue({
        id: 77,
        status: RequestStatus.PENDING_APPROVAL,
        itemName: 'Дорогой сканер',
      });
      prismaMock.auditLog.create.mockResolvedValue({ id: 1 });

      const res = await requestService.createRequest({
        userId: 123n,
        categoryId: 1,
        itemName: 'Дорогой сканер',
        quantity: '1 шт',
        estPrice: 150, // 800 + 150 = 950 > 900 limit
        urgency: Urgency.PLANNED,
        justification: 'Диагностика',
      });

      expect(prismaMock.request.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: RequestStatus.PENDING_APPROVAL,
          }),
        })
      );
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'CREATE',
            newStatus: RequestStatus.PENDING_APPROVAL,
            comment: expect.stringContaining('превышение месячного бюджета'),
          }),
        })
      );
      expect(res.status).toBe(RequestStatus.PENDING_APPROVAL);
    });

    it('approveRequest: should change status from PENDING_APPROVAL to NEW and log APPROVE audit', async () => {
      prismaMock.request.update.mockResolvedValue({
        id: 77,
        status: RequestStatus.NEW,
        itemName: 'Дорогой сканер',
      });
      prismaMock.auditLog.create.mockResolvedValue({ id: 2 });

      const res = await requestService.approveRequest(77, 999999n);
      expect(prismaMock.request.update).toHaveBeenCalledWith({
        where: { id: 77 },
        data: { status: RequestStatus.NEW },
        include: { user: true, category: true },
      });
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          requestId: 77,
          userId: 999999n,
          action: 'APPROVE',
          oldStatus: RequestStatus.PENDING_APPROVAL,
          newStatus: RequestStatus.NEW,
        }),
      });
      expect(res.status).toBe(RequestStatus.NEW);
    });
  });
});
