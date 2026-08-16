import { prisma } from '../db/client.js';
import { RequestStatus, Urgency, Prisma } from '@prisma/client';
import { googleSheetsService } from './googleSheetsService.js';
import { env } from '../config/env.js';

export interface CreateRequestInput {
  userId: bigint;
  categoryId: number;
  postName?: string;
  itemName: string;
  quantity: string;
  estPrice?: number;
  urgency: Urgency;
  justification: string;
  link?: string;
  photoFileId?: string;
}

export class RequestService {
  /**
   * Get current dynamic monthly budget limit in GEL (default 900 ₾)
   */
  async getMonthlyBudgetLimit(): Promise<number> {
    try {
      const setting = await prisma.setting.findUnique({
        where: { key: 'monthly_budget_gel' },
      });
      if (setting && setting.value) {
        const val = parseFloat(setting.value);
        if (!isNaN(val) && val > 0) return val;
      }
    } catch {
      // Fallback
    }
    return env.MONTHLY_BUDGET_GEL || 900;
  }

  /**
   * Update monthly budget limit in GEL
   */
  async setMonthlyBudgetLimit(limit: number): Promise<number> {
    await prisma.setting.upsert({
      where: { key: 'monthly_budget_gel' },
      update: { value: limit.toString() },
      create: { key: 'monthly_budget_gel', value: limit.toString() },
    });
    return limit;
  }

  /**
   * Calculate current calendar month spending stats
   */
  async getCurrentMonthExpenses(targetDate = new Date()) {
    const startOfMonth = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1, 0, 0, 0);
    const endOfMonth = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0, 23, 59, 59);

    const requests = await prisma.request.findMany({
      where: {
        createdAt: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
        status: {
          not: RequestStatus.REJECTED,
        },
      },
    });

    let totalSpent = 0; // Actual price of ordered + completed
    let totalEstimated = 0; // Estimated price of pending / new / in_progress

    for (const r of requests) {
      if (r.status === RequestStatus.ORDERED || r.status === RequestStatus.COMPLETED || r.status === RequestStatus.DELIVERED) {
        totalSpent += r.actualPrice ? Number(r.actualPrice) : (r.estPrice ? Number(r.estPrice) : 0);
      } else {
        totalEstimated += r.estPrice ? Number(r.estPrice) : 0;
      }
    }

    const budgetLimit = await this.getMonthlyBudgetLimit();
    const remainingBudget = Math.max(0, budgetLimit - totalSpent);

    return {
      totalSpent,
      totalEstimated,
      requestsCount: requests.length,
      budgetLimit,
      remainingBudget,
      isBudgetExceeded: totalSpent > budgetLimit,
    };
  }

  /**
   * Get expense breakdown aggregated by workshop post/zone
   */
  async getExpensesByPost(targetDate = new Date()) {
    const startOfMonth = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1, 0, 0, 0);
    const endOfMonth = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0, 23, 59, 59);

    const requests = await prisma.request.findMany({
      where: {
        createdAt: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
        status: {
          not: RequestStatus.REJECTED,
        },
      },
    });

    const postStats: Record<string, { totalAmount: number; count: number }> = {};

    for (const r of requests) {
      const post = r.postName || 'Общий цех';
      const amount = r.actualPrice ? Number(r.actualPrice) : (r.estPrice ? Number(r.estPrice) : 0);

      if (!postStats[post]) {
        postStats[post] = { totalAmount: 0, count: 0 };
      }
      postStats[post].totalAmount += amount;
      postStats[post].count += 1;
    }

    return Object.entries(postStats)
      .map(([postName, data]) => ({
        postName,
        totalAmount: data.totalAmount,
        count: data.count,
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount);
  }

  /**
   * Search requests by ID, keyword, item name or post
   */
  async searchRequests(query: string, take = 10) {
    const cleanQuery = query.trim().replace(/^#/, '');
    const numId = parseInt(cleanQuery, 10);

    if (!isNaN(numId) && numId > 0 && cleanQuery === numId.toString()) {
      const req = await this.getRequestById(numId);
      return req ? [req] : [];
    }

    return prisma.request.findMany({
      where: {
        OR: [
          { itemName: { contains: query, mode: 'insensitive' } },
          { justification: { contains: query, mode: 'insensitive' } },
          { postName: { contains: query, mode: 'insensitive' } },
        ],
      },
      include: {
        user: true,
        category: true,
      },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  /**
   * Get orders due today or overdue
   */
  async getOverdueAndDueTodayOrders() {
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    return prisma.request.findMany({
      where: {
        status: RequestStatus.ORDERED,
        expectedDate: {
          lte: endOfToday,
        },
      },
      include: {
        user: true,
        category: true,
      },
      orderBy: { expectedDate: 'asc' },
    });
  }

  /**
   * Approve request from PENDING_APPROVAL by Director
   */
  async approveRequest(requestId: number, directorId: bigint) {
    const updated = await prisma.request.update({
      where: { id: requestId },
      data: { status: RequestStatus.NEW },
      include: { user: true, category: true },
    });

    await prisma.auditLog.create({
      data: {
        requestId,
        userId: directorId,
        action: 'APPROVE',
        oldStatus: RequestStatus.PENDING_APPROVAL,
        newStatus: RequestStatus.NEW,
        comment: 'Заявка одобрена руководителем',
      },
    });

    googleSheetsService
      .updateRequest(requestId, { status: RequestStatus.NEW })
      .catch(console.error);

    return updated;
  }

  /**
   * Create a new purchase request (with budget & approval check)
   */
  async createRequest(data: CreateRequestInput) {
    const budgetLimit = await this.getMonthlyBudgetLimit();
    const monthStats = await this.getCurrentMonthExpenses();
    const estPrice = data.estPrice || 0;

    let initialStatus: RequestStatus = RequestStatus.NEW;
    let auditComment = `Заявка создана. Срочность: ${data.urgency}`;

    if (
      (monthStats.totalSpent + estPrice) > budgetLimit ||
      (estPrice > 0 && estPrice >= (env.APPROVAL_THRESHOLD_GEL || 200))
    ) {
      initialStatus = RequestStatus.PENDING_APPROVAL;
      if ((monthStats.totalSpent + estPrice) > budgetLimit) {
        auditComment = `На согласовании: превышение месячного бюджета (${monthStats.totalSpent + estPrice} ₾ > лимит ${budgetLimit} ₾)`;
      } else {
        auditComment = `На согласовании: сумма (${estPrice} ₾) превышает порог согласования (${env.APPROVAL_THRESHOLD_GEL} ₾)`;
      }
    }

    const request = await prisma.request.create({
      data: {
        userId: data.userId,
        categoryId: data.categoryId,
        postName: data.postName,
        itemName: data.itemName,
        quantity: data.quantity,
        estPrice: data.estPrice ? new Prisma.Decimal(data.estPrice) : null,
        urgency: data.urgency,
        justification: data.justification,
        link: data.link,
        photoFileId: data.photoFileId,
        status: initialStatus,
      },
      include: {
        user: true,
        category: true,
      },
    });

    // Log audit action
    await prisma.auditLog.create({
      data: {
        requestId: request.id,
        userId: data.userId,
        action: 'CREATE',
        newStatus: initialStatus,
        comment: auditComment,
      },
    });

    // Append to Google Sheets asynchronously
    googleSheetsService.appendRequest(request).catch(console.error);

    return request;
  }

  /**
   * Get request by ID with relations
   */
  async getRequestById(id: number) {
    return prisma.request.findUnique({
      where: { id },
      include: {
        user: true,
        category: true,
        auditLogs: {
          include: { user: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  /**
   * Get user requests
   */
  async getUserRequests(userId: bigint, take = 10) {
    return prisma.request.findMany({
      where: { userId },
      include: { category: true },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  /**
   * Get requests for manager by filter
   */
  async getManagerRequests(filter: {
    status?: RequestStatus;
    urgency?: Urgency;
    take?: number;
  }) {
    return prisma.request.findMany({
      where: {
        status: filter.status,
        urgency: filter.urgency,
      },
      include: {
        user: true,
        category: true,
      },
      orderBy: [
        { urgency: 'desc' }, // URGENT first
        { createdAt: 'desc' },
      ],
      take: filter.take || 20,
    });
  }

  /**
   * Change status to IN_PROGRESS (Взять в работу)
   */
  async takeToWork(requestId: number, managerId: bigint) {
    const updated = await prisma.request.update({
      where: { id: requestId },
      data: { status: RequestStatus.IN_PROGRESS },
      include: { user: true, category: true },
    });

    await prisma.auditLog.create({
      data: {
        requestId,
        userId: managerId,
        action: 'TAKE_TO_WORK',
        oldStatus: RequestStatus.NEW,
        newStatus: RequestStatus.IN_PROGRESS,
        comment: 'Заявка взята в работу завхозом',
      },
    });

    googleSheetsService
      .updateRequest(requestId, { status: RequestStatus.IN_PROGRESS })
      .catch(console.error);

    return updated;
  }

  /**
   * Mark request as ORDERED (Заказано)
   */
  async markAsOrdered(
    requestId: number,
    managerId: bigint,
    actualPrice: number,
    expectedDate?: Date,
    receiptFileId?: string
  ) {
    const updated = await prisma.request.update({
      where: { id: requestId },
      data: {
        status: RequestStatus.ORDERED,
        actualPrice: new Prisma.Decimal(actualPrice),
        expectedDate: expectedDate || null,
        receiptFileId: receiptFileId || null,
      },
      include: { user: true, category: true },
    });

    await prisma.auditLog.create({
      data: {
        requestId,
        userId: managerId,
        action: 'ORDER',
        oldStatus: RequestStatus.IN_PROGRESS,
        newStatus: RequestStatus.ORDERED,
        comment: `Заказано. Факт. цена: ${actualPrice} ₾. Срок: ${
          expectedDate ? expectedDate.toLocaleDateString('ru-RU') : 'не указан'
        }`,
      },
    });

    googleSheetsService
      .updateRequest(requestId, {
        status: RequestStatus.ORDERED,
        actualPrice,
        expectedDate,
      })
      .catch(console.error);

    return updated;
  }

  /**
   * Mark request as DELIVERED to workshop warehouse (Доставлено на склад)
   */
  async markAsDelivered(requestId: number, managerId: bigint) {
    const updated = await prisma.request.update({
      where: { id: requestId },
      data: {
        status: RequestStatus.DELIVERED,
        deliveredAt: new Date(),
      },
      include: { user: true, category: true },
    });

    await prisma.auditLog.create({
      data: {
        requestId,
        userId: managerId,
        action: 'DELIVER',
        oldStatus: RequestStatus.ORDERED,
        newStatus: RequestStatus.DELIVERED,
        comment: 'Товар прибыл на склад цеха',
      },
    });

    googleSheetsService
      .updateRequest(requestId, { status: RequestStatus.DELIVERED })
      .catch(console.error);

    return updated;
  }

  /**
   * Mark request as COMPLETED / ISSUED to mechanic (Выдано)
   */
  async markAsCompleted(requestId: number, userId: bigint) {
    const updated = await prisma.request.update({
      where: { id: requestId },
      data: {
        status: RequestStatus.COMPLETED,
        completedAt: new Date(),
      },
      include: { user: true, category: true },
    });

    await prisma.auditLog.create({
      data: {
        requestId,
        userId,
        action: 'COMPLETE',
        oldStatus: RequestStatus.DELIVERED,
        newStatus: RequestStatus.COMPLETED,
        comment: 'Товар получен сотрудником / Заявка закрыта',
      },
    });

    googleSheetsService
      .updateRequest(requestId, { status: RequestStatus.COMPLETED })
      .catch(console.error);

    return updated;
  }

  /**
   * Reject request with reason
   */
  async rejectRequest(requestId: number, managerId: bigint, reason: string) {
    const updated = await prisma.request.update({
      where: { id: requestId },
      data: {
        status: RequestStatus.REJECTED,
        rejectReason: reason,
      },
      include: { user: true, category: true },
    });

    await prisma.auditLog.create({
      data: {
        requestId,
        userId: managerId,
        action: 'REJECT',
        newStatus: RequestStatus.REJECTED,
        comment: `Отклонено: ${reason}`,
      },
    });

    googleSheetsService
      .updateRequest(requestId, {
        status: RequestStatus.REJECTED,
        rejectReason: reason,
      })
      .catch(console.error);

    return updated;
  }

  /**
   * Cancel request by author or manager
   */
  async cancelRequest(requestId: number, userId: bigint, reason = 'Отменено автором') {
    const existing = await this.getRequestById(requestId);
    if (!existing) {
      throw new Error(`Заявка #${requestId} не найдена`);
    }

    if (
      existing.status === RequestStatus.COMPLETED ||
      existing.status === RequestStatus.DELIVERED
    ) {
      throw new Error('Нельзя отменить уже доставленный или закрытый заказ');
    }

    const updated = await prisma.request.update({
      where: { id: requestId },
      data: {
        status: RequestStatus.REJECTED,
        rejectReason: reason,
      },
      include: { user: true, category: true },
    });

    await prisma.auditLog.create({
      data: {
        requestId,
        userId,
        action: 'CANCEL',
        oldStatus: existing.status,
        newStatus: RequestStatus.REJECTED,
        comment: `Заявка отменена: ${reason}`,
      },
    });

    googleSheetsService
      .updateRequest(requestId, {
        status: RequestStatus.REJECTED,
        rejectReason: reason,
      })
      .catch(console.error);

    return updated;
  }

  /**
   * Update request details by author or manager
   */
  async updateRequestDetails(
    requestId: number,
    userId: bigint,
    updates: {
      itemName?: string;
      quantity?: string;
      estPrice?: number | null;
      urgency?: Urgency;
      justification?: string;
      postName?: string;
      categoryId?: number;
      link?: string;
    }
  ) {
    const existing = await this.getRequestById(requestId);
    if (!existing) {
      throw new Error(`Заявка #${requestId} не найдена`);
    }

    if (
      existing.status !== RequestStatus.NEW &&
      existing.status !== RequestStatus.PENDING_APPROVAL &&
      existing.status !== RequestStatus.IN_PROGRESS
    ) {
      throw new Error('Нельзя редактировать уже заказанные или завершенные заявки');
    }

    const dataToUpdate: Prisma.RequestUpdateInput = {};
    const changedFields: string[] = [];

    if (updates.itemName && updates.itemName !== existing.itemName) {
      dataToUpdate.itemName = updates.itemName;
      changedFields.push(`Наименование: "${updates.itemName}"`);
    }
    if (updates.quantity && updates.quantity !== existing.quantity) {
      dataToUpdate.quantity = updates.quantity;
      changedFields.push(`Количество: "${updates.quantity}"`);
    }
    if (updates.estPrice !== undefined) {
      dataToUpdate.estPrice = updates.estPrice !== null ? new Prisma.Decimal(updates.estPrice) : null;
      changedFields.push(`Прим. цена: ${updates.estPrice !== null ? `${updates.estPrice} ₾` : 'Не указана'}`);
    }
    if (updates.urgency && updates.urgency !== existing.urgency) {
      dataToUpdate.urgency = updates.urgency;
      changedFields.push(`Срочность: ${updates.urgency}`);
    }
    if (updates.justification && updates.justification !== existing.justification) {
      dataToUpdate.justification = updates.justification;
      changedFields.push(`Обоснование: "${updates.justification}"`);
    }
    if (updates.postName !== undefined && updates.postName !== existing.postName) {
      dataToUpdate.postName = updates.postName;
      changedFields.push(`Пост: "${updates.postName}"`);
    }
    if (updates.categoryId && updates.categoryId !== existing.categoryId) {
      dataToUpdate.category = { connect: { id: updates.categoryId } };
      changedFields.push(`Категория ID: ${updates.categoryId}`);
    }
    if (updates.link !== undefined) {
      dataToUpdate.link = updates.link;
    }

    const updated = await prisma.request.update({
      where: { id: requestId },
      data: dataToUpdate,
      include: { user: true, category: true },
    });

    if (changedFields.length > 0) {
      await prisma.auditLog.create({
        data: {
          requestId,
          userId,
          action: 'EDIT',
          comment: `Редактирование заявки. Изменено: ${changedFields.join(', ')}`,
        },
      });

      googleSheetsService
        .updateRequest(requestId, {
          itemName: updates.itemName,
          quantity: updates.quantity,
          estPrice: updates.estPrice,
          urgency: updates.urgency,
          justification: updates.justification,
          postName: updates.postName,
        })
        .catch(console.error);
    }

    return updated;
  }

  /**
   * Get active planned requests count & list for weekly digest
   */
  async getPlannedRequestsForDigest() {
    return prisma.request.findMany({
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
  }
}

export const requestService = new RequestService();
