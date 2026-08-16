import { describe, it, expect, vi, beforeEach } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    regularItem: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock('../../src/db/client.js', () => ({
  prisma: prismaMock,
}));

import { RegularService } from '../../src/services/regularService.js';

describe('RegularService', () => {
  let regularService: RegularService;

  beforeEach(() => {
    vi.clearAllMocks();
    regularService = new RegularService();
  });

  it('getActiveItems: should query only active items ordered by category and name', async () => {
    const mockItems = [{ id: 1, name: 'WD-40', isActive: true }];
    prismaMock.regularItem.findMany.mockResolvedValue(mockItems as any);

    const result = await regularService.getActiveItems();
    expect(prismaMock.regularItem.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
    expect(result).toEqual(mockItems);
  });

  it('getAllItems: should query all items including inactive', async () => {
    const mockItems = [
      { id: 1, name: 'WD-40', isActive: true },
      { id: 2, name: 'Старый очиститель', isActive: false },
    ];
    prismaMock.regularItem.findMany.mockResolvedValue(mockItems as any);

    const result = await regularService.getAllItems();
    expect(prismaMock.regularItem.findMany).toHaveBeenCalledWith({
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
    expect(result).toHaveLength(2);
  });

  it('createItem: should create a new regular item with default minStock', async () => {
    const input = {
      name: 'Перчатки XL',
      category: 'Расходники',
      defaultQuantity: '5',
      unit: 'пачка',
    };
    prismaMock.regularItem.create.mockResolvedValue({ id: 10, ...input, minStock: 1, isActive: true } as any);

    const result = await regularService.createItem(input);
    expect(prismaMock.regularItem.create).toHaveBeenCalledWith({
      data: {
        name: 'Перчатки XL',
        category: 'Расходники',
        defaultQuantity: '5',
        unit: 'пачка',
        minStock: 1,
        isActive: true,
      },
    });
    expect(result.id).toBe(10);
  });

  it('toggleActive: should invert isActive flag', async () => {
    prismaMock.regularItem.findUnique.mockResolvedValue({ id: 5, isActive: true } as any);
    prismaMock.regularItem.update.mockResolvedValue({ id: 5, isActive: false } as any);

    const result = await regularService.toggleActive(5);
    expect(prismaMock.regularItem.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { isActive: false },
    });
    expect(result?.isActive).toBe(false);
  });

  it('deleteItem: should remove regular item from database', async () => {
    prismaMock.regularItem.delete.mockResolvedValue({ id: 5 } as any);

    const result = await regularService.deleteItem(5);
    expect(prismaMock.regularItem.delete).toHaveBeenCalledWith({
      where: { id: 5 },
    });
    expect(result.id).toBe(5);
  });
});
