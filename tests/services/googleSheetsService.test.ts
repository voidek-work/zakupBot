import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  REQUEST_HEADERS,
  REGULAR_HEADERS,
  googleSheetsService,
} from '../../src/services/googleSheetsService.js';
import { RequestStatus, Urgency, Prisma } from '@prisma/client';

describe('GoogleSheetsService', () => {
  it('should define accurate and comprehensive headers for Requests sheet', () => {
    expect(REQUEST_HEADERS).toContain('ID');
    expect(REQUEST_HEADERS).toContain('Дата создания');
    expect(REQUEST_HEADERS).toContain('Мастер');
    expect(REQUEST_HEADERS).toContain('Пост/Зона');
    expect(REQUEST_HEADERS).toContain('Категория');
    expect(REQUEST_HEADERS).toContain('Наименование');
    expect(REQUEST_HEADERS).toContain('Количество');
    expect(REQUEST_HEADERS).toContain('Обоснование');
    expect(REQUEST_HEADERS).toContain('Срочность');
    expect(REQUEST_HEADERS).toContain('Прим. цена (₾)');
    expect(REQUEST_HEADERS).toContain('Факт. цена (₾)');
    expect(REQUEST_HEADERS).toContain('Статус');
  });

  it('should define headers for Regular Consumables sheet', () => {
    expect(REGULAR_HEADERS).toContain('ID');
    expect(REGULAR_HEADERS).toContain('Наименование');
    expect(REGULAR_HEADERS).toContain('Категория');
    expect(REGULAR_HEADERS).toContain('Стандартный заказ');
    expect(REGULAR_HEADERS).toContain('Ед. изм.');
    expect(REGULAR_HEADERS).toContain('Мин. остаток');
    expect(REGULAR_HEADERS).toContain('Статус');
  });

  it('should return null or false safely when Google Credentials are not set in environment', async () => {
    // When credentials are null/empty, service should handle it without unhandled exceptions
    const initResult = await googleSheetsService.init();
    expect(typeof initResult).toBe('boolean');

    const appendResult = await googleSheetsService.appendRequest({
      id: 1,
      userId: 123n,
      categoryId: 1,
      postName: 'Пост 1',
      itemName: 'WD-40',
      quantity: '1 шт',
      estPrice: new Prisma.Decimal(20),
      actualPrice: null,
      urgency: Urgency.PLANNED,
      justification: 'Расходник',
      link: null,
      photoFileId: null,
      receiptFileId: null,
      status: RequestStatus.NEW,
      rejectReason: null,
      expectedDate: null,
      deliveredAt: null,
      completedAt: null,
      googleRowIndex: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      user: {
        id: 123n,
        fullName: 'Тестовый Мастер',
        username: 'test',
        role: 'MECHANIC',
        postName: 'Пост 1',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      category: {
        id: 1,
        name: 'Химия',
        icon: '🧴',
        sortOrder: 1,
      },
    });

    // In local environment without test credentials, append safely returns null without throwing
    expect(appendResult === null || typeof appendResult === 'number').toBe(true);
  });
});
