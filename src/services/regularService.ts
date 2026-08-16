import { prisma } from '../db/client.js';

export interface CreateRegularItemInput {
  name: string;
  category: string;
  defaultQuantity: string;
  unit: string;
  minStock?: number;
}

export class RegularService {
  /**
   * Get all active regular items grouped by category
   */
  async getActiveItems() {
    return prisma.regularItem.findMany({
      where: { isActive: true },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  /**
   * Get all items including inactive
   */
  async getAllItems() {
    return prisma.regularItem.findMany({
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  /**
   * Get regular item by ID
   */
  async getItemById(id: number) {
    return prisma.regularItem.findUnique({
      where: { id },
    });
  }

  /**
   * Create a new regular consumable
   */
  async createItem(data: CreateRegularItemInput) {
    return prisma.regularItem.create({
      data: {
        name: data.name,
        category: data.category,
        defaultQuantity: data.defaultQuantity,
        unit: data.unit,
        minStock: data.minStock || 1,
        isActive: true,
      },
    });
  }

  /**
   * Update item
   */
  async updateItem(
    id: number,
    data: Partial<CreateRegularItemInput & { isActive: boolean }>
  ) {
    return prisma.regularItem.update({
      where: { id },
      data,
    });
  }

  /**
   * Toggle item active status
   */
  async toggleActive(id: number) {
    const item = await this.getItemById(id);
    if (!item) return null;

    return prisma.regularItem.update({
      where: { id },
      data: { isActive: !item.isActive },
    });
  }

  /**
   * Delete item
   */
  async deleteItem(id: number) {
    return prisma.regularItem.delete({
      where: { id },
    });
  }
}

export const regularService = new RegularService();
