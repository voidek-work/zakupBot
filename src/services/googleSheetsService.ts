import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { env } from '../config/env.js';
import { Request, User, Category } from '@prisma/client';
import { STATUS_LABELS, URGENCY_LABELS } from '../config/constants.js';
import { prisma } from '../db/client.js';

export const REQUEST_HEADERS = [
  'ID',
  'Дата создания',
  'Мастер',
  'Пост/Зона',
  'Категория',
  'Наименование',
  'Количество',
  'Обоснование',
  'Срочность',
  'Прим. цена (₾)',
  'Факт. цена (₾)',
  'Статус',
  'Срок доставки',
  'Причина отказа',
  'Ссылка',
  'Фото/Чек',
];

export const REGULAR_HEADERS = [
  'ID',
  'Наименование',
  'Категория',
  'Стандартный заказ',
  'Ед. изм.',
  'Мин. остаток',
  'Статус',
];

class GoogleSheetsService {
  private doc: GoogleSpreadsheet | null = null;
  private isInitialized = false;

  async init(): Promise<boolean> {
    const doc = await this.getDoc();
    return !!doc;
  }

  private async getDoc(): Promise<GoogleSpreadsheet | null> {
    if (this.doc && this.isInitialized) {
      return this.doc;
    }

    if (!env.GOOGLE_SPREADSHEET_ID || !env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !env.GOOGLE_PRIVATE_KEY) {
      return null;
    }

    try {
      const serviceAccountAuth = new JWT({
        email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        key: env.GOOGLE_PRIVATE_KEY,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      const doc = new GoogleSpreadsheet(env.GOOGLE_SPREADSHEET_ID, serviceAccountAuth);
      await doc.loadInfo();

      // Ensure sheets exist with proper headers
      await this.ensureSheetStructure(doc);

      this.doc = doc;
      this.isInitialized = true;
      console.log(`📊 Google Sheets connected & structured: "${doc.title}"`);
      return this.doc;
    } catch (error) {
      console.error('❌ Google Sheets connection error:', error);
      return null;
    }
  }

  private async ensureSheetStructure(doc: GoogleSpreadsheet) {
    // 1. Requests Sheet ("Заявки")
    let requestsSheet = doc.sheetsByTitle['Заявки'];

    if (!requestsSheet) {
      // Check if there is an empty default sheet (e.g. Sheet1 / Лист1)
      const firstSheet = doc.sheetsByIndex[0];
      const isDefaultBlank =
        firstSheet &&
        (firstSheet.title === 'Sheet1' ||
          firstSheet.title === 'Лист1' ||
          firstSheet.title === 'Лист 1') &&
        firstSheet.rowCount <= 1000;

      if (isDefaultBlank) {
        await firstSheet.updateProperties({ title: 'Заявки' });
        requestsSheet = firstSheet;
        await requestsSheet.setHeaderRow(REQUEST_HEADERS);
      } else {
        requestsSheet = await doc.addSheet({
          title: 'Заявки',
          headerValues: REQUEST_HEADERS,
        });
      }
    } else {
      // Sheet exists, check if headers need to be created/updated
      try {
        await requestsSheet.loadHeaderRow();
        if (!requestsSheet.headerValues || requestsSheet.headerValues.length === 0) {
          await requestsSheet.setHeaderRow(REQUEST_HEADERS);
        }
      } catch {
        // If row 1 was empty
        await requestsSheet.setHeaderRow(REQUEST_HEADERS);
      }
    }

    // 2. Regular Consumables Sheet ("Регулярные расходники")
    let regularSheet = doc.sheetsByTitle['Регулярные расходники'];
    if (!regularSheet) {
      regularSheet = await doc.addSheet({
        title: 'Регулярные расходники',
        headerValues: REGULAR_HEADERS,
      });
      // Pre-fill regular consumables from database if available
      await this.syncRegularItemsToSheet(regularSheet);
    } else {
      try {
        await regularSheet.loadHeaderRow();
        if (!regularSheet.headerValues || regularSheet.headerValues.length === 0) {
          await regularSheet.setHeaderRow(REGULAR_HEADERS);
        }
      } catch {
        await regularSheet.setHeaderRow(REGULAR_HEADERS);
      }
    }
  }

  /**
   * Sync database regular items to regular sheet
   */
  async syncRegularItemsToSheet(sheet?: any) {
    try {
      const doc = sheet ? null : await this.getDoc();
      const targetSheet = sheet || doc?.sheetsByTitle['Регулярные расходники'];
      if (!targetSheet) return;

      const items = await prisma.regularItem.findMany({
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
      });

      const existingRows = await targetSheet.getRows();
      if (existingRows.length === 0) {
        for (const item of items) {
          await targetSheet.addRow({
            'ID': item.id.toString(),
            'Наименование': item.name,
            'Категория': item.category,
            'Стандартный заказ': item.defaultQuantity,
            'Ед. изм.': item.unit,
            'Мин. остаток': item.minStock.toString(),
            'Статус': item.isActive ? 'Активен' : 'Приостановлен',
          });
        }
      }
    } catch (error) {
      console.error('❌ Failed to sync regular items to Google Sheets:', error);
    }
  }

  /**
   * Import / Sync regular items FROM Google Sheets into Database (Two-way sync)
   */
  async syncRegularItemsFromSheet(): Promise<number> {
    const doc = await this.getDoc();
    if (!doc) return 0;

    const sheet = doc.sheetsByTitle['Регулярные расходники'];
    if (!sheet) return 0;

    try {
      const rows = await sheet.getRows();
      let updatedCount = 0;

      for (const row of rows) {
        const name = row.get('Наименование')?.trim();
        if (!name) continue;

        const category = row.get('Категория')?.trim() || 'Расходники и крепёж';
        const defaultQuantity = row.get('Стандартный заказ')?.trim() || '1';
        const unit = row.get('Ед. изм.')?.trim() || 'шт';
        const minStock = parseInt(row.get('Мин. остаток') || '1', 10) || 1;
        const statusStr = row.get('Статус')?.trim();
        const isActive = statusStr !== 'Приостановлен' && statusStr !== 'Отключен';

        const idStr = row.get('ID')?.trim();
        const id = idStr ? parseInt(idStr, 10) : undefined;

        if (id && !isNaN(id)) {
          await prisma.regularItem.upsert({
            where: { id },
            update: { name, category, defaultQuantity, unit, minStock, isActive },
            create: { name, category, defaultQuantity, unit, minStock, isActive },
          });
        } else {
          const existing = await prisma.regularItem.findFirst({ where: { name } });
          if (existing) {
            await prisma.regularItem.update({
              where: { id: existing.id },
              data: { category, defaultQuantity, unit, minStock, isActive },
            });
            row.set('ID', existing.id.toString());
            await row.save();
          } else {
            const created = await prisma.regularItem.create({
              data: { name, category, defaultQuantity, unit, minStock, isActive },
            });
            row.set('ID', created.id.toString());
            await row.save();
          }
        }
        updatedCount++;
      }

      return updatedCount;
    } catch (error) {
      console.error('❌ Failed to import regular items from Google Sheets:', error);
      return 0;
    }
  }

  /**
   * Append a new request row to Google Sheets
   */
  async appendRequest(
    request: Request & { user: User; category: Category }
  ): Promise<number | null> {
    const doc = await this.getDoc();
    if (!doc) return null;

    try {
      const sheet = doc.sheetsByTitle['Заявки'];
      if (!sheet) return null;

      const dateStr = new Date(request.createdAt).toLocaleString('ru-RU', {
        timeZone: 'Europe/Moscow',
      });

      const row = await sheet.addRow({
        'ID': request.id.toString(),
        'Дата создания': dateStr,
        'Мастер': request.user.fullName,
        'Пост/Зона': request.postName || 'Не указан',
        'Категория': `${request.category.icon} ${request.category.name}`,
        'Наименование': request.itemName,
        'Количество': request.quantity,
        'Обоснование': request.justification,
        'Срочность': URGENCY_LABELS[request.urgency] || request.urgency,
        'Прим. цена (₾)': request.estPrice ? request.estPrice.toString() : '—',
        'Факт. цена (₾)': request.actualPrice ? request.actualPrice.toString() : '—',
        'Статус': STATUS_LABELS[request.status] || request.status,
        'Срок доставки': request.expectedDate
          ? new Date(request.expectedDate).toLocaleDateString('ru-RU')
          : '—',
        'Причина отказа': request.rejectReason || '—',
        'Ссылка': request.link || '—',
        'Фото/Чек': request.photoFileId ? 'Есть фото' : '—',
      });

      return row.rowNumber;
    } catch (error) {
      console.error('❌ Failed to append request to Google Sheets:', error);
      return null;
    }
  }

  /**
   * Update existing request in Google Sheets
   */
  async updateRequest(
    requestId: number,
    updates: {
      status?: string;
      actualPrice?: number | null;
      expectedDate?: Date | null;
      rejectReason?: string | null;
      itemName?: string;
      quantity?: string;
      estPrice?: number | null;
      urgency?: string;
      justification?: string;
      postName?: string;
    }
  ) {
    const doc = await this.getDoc();
    if (!doc) return;

    try {
      const sheet = doc.sheetsByTitle['Заявки'];
      if (!sheet) return;

      const rows = await sheet.getRows();
      const targetRow = rows.find((r) => r.get('ID') === requestId.toString());

      if (targetRow) {
        if (updates.status) {
          targetRow.set('Статус', STATUS_LABELS[updates.status] || updates.status);
        }
        if (updates.actualPrice !== undefined) {
          targetRow.set(
            'Факт. цена (₾)',
            updates.actualPrice !== null ? updates.actualPrice.toString() : '—'
          );
        }
        if (updates.expectedDate !== undefined) {
          targetRow.set(
            'Срок доставки',
            updates.expectedDate
              ? new Date(updates.expectedDate).toLocaleDateString('ru-RU')
              : '—'
          );
        }
        if (updates.rejectReason !== undefined) {
          targetRow.set('Причина отказа', updates.rejectReason || '—');
        }
        if (updates.itemName) {
          targetRow.set('Наименование', updates.itemName);
        }
        if (updates.quantity) {
          targetRow.set('Количество', updates.quantity);
        }
        if (updates.estPrice !== undefined) {
          targetRow.set(
            'Прим. цена (₾)',
            updates.estPrice !== null ? updates.estPrice.toString() : '—'
          );
        }
        if (updates.urgency) {
          targetRow.set('Срочность', URGENCY_LABELS[updates.urgency] || updates.urgency);
        }
        if (updates.justification) {
          targetRow.set('Обоснование', updates.justification);
        }
        if (updates.postName) {
          targetRow.set('Пост/Зона', updates.postName);
        }

        await targetRow.save();
      }
    } catch (error) {
      console.error(`❌ Failed to update request #${requestId} in Google Sheets:`, error);
    }
  }
}

export const googleSheetsService = new GoogleSheetsService();
