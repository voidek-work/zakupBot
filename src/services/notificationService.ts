import { Bot, InlineKeyboard } from 'grammy';
import { Request, User, Category, Urgency } from '@prisma/client';
import { prisma } from '../db/client.js';
import { env } from '../config/env.js';
import { STATUS_LABELS, URGENCY_LABELS } from '../config/constants.js';
import { requestService } from './requestService.js';
import { regularService } from './regularService.js';

export class NotificationService {
  /**
   * Get all manager Telegram IDs from DB and .env
   */
  private async getManagerIds(): Promise<bigint[]> {
    const managers = await prisma.user.findMany({
      where: { role: 'MANAGER', isActive: true },
      select: { id: true },
    });

    const ids = new Set<bigint>([
      ...managers.map((m) => m.id),
      ...env.MANAGER_TELEGRAM_IDS,
    ]);

    return Array.from(ids);
  }

  /**
   * Get director Telegram IDs
   */
  private async getDirectorIds(): Promise<bigint[]> {
    const directors = await prisma.user.findMany({
      where: { role: 'DIRECTOR', isActive: true },
      select: { id: true },
    });

    const ids = new Set<bigint>([
      ...directors.map((d) => d.id),
      ...env.DIRECTOR_TELEGRAM_IDS,
    ]);

    return Array.from(ids);
  }

  /**
   * Send notification for a new request (Instant if URGENT, or if created)
   */
  async notifyNewRequest(
    bot: Bot<any>,
    request: Request & { user: User; category: Category }
  ) {
    const isUrgent = request.urgency === Urgency.URGENT;
    const managerIds = await this.getManagerIds();

    if (managerIds.length === 0) {
      console.warn('⚠️ No managers configured to receive request notifications.');
      return;
    }

    const kb = new InlineKeyboard()
      .text('🟢 В работу', `req_take_${request.id}`)
      .text('🛒 Заказано', `req_order_${request.id}`)
      .row()
      .text('🔴 Отклонить', `req_reject_${request.id}`)
      .url('💬 Автор', `tg://user?id=${request.userId}`);

    const header = isUrgent
      ? '🚨 <b>СРОЧНАЯ ЗАЯВКА НА ЗАКУПКУ!</b>'
      : '📝 <b>Новая плановая заявка</b>';

    const text = [
      header,
      `━━━━━━━━━━━━━━━━━━━━`,
      `🏷 <b>Заявка #${request.id}</b>`,
      `👤 <b>Автор:</b> ${request.user.fullName} (${request.postName || 'Цех'})`,
      `📂 <b>Категория:</b> ${request.category.icon} ${request.category.name}`,
      `📦 <b>Товар:</b> <code>${request.itemName}</code>`,
      `🔢 <b>Количество:</b> <b>${request.quantity}</b>`,
      `💰 <b>Прим. цена:</b> ${request.estPrice ? `${request.estPrice} ₾` : 'Не указана'}`,
      `⚡ <b>Срочность:</b> ${URGENCY_LABELS[request.urgency]}`,
      `🎯 <b>Обоснование:</b> ${request.justification}`,
      request.link ? `🔗 <b>Ссылка:</b> <a href="${request.link}">Перейти к товару</a>` : '',
    ]
      .filter(Boolean)
      .join('\n');

    for (const managerId of managerIds) {
      try {
        if (request.photoFileId) {
          await bot.api.sendPhoto(Number(managerId), request.photoFileId, {
            caption: text,
            parse_mode: 'HTML',
            reply_markup: kb,
          });
        } else {
          await bot.api.sendMessage(Number(managerId), text, {
            parse_mode: 'HTML',
            reply_markup: kb,
            link_preview_options: { is_disabled: false },
          });
        }
      } catch (err) {
        console.error(`❌ Failed to send notification to manager ${managerId}:`, err);
      }
    }
  }

  /**
   * Notify author about status update
   */
  async notifyAuthorStatusChange(
    bot: Bot<any>,
    request: Request & { user: User; category: Category },
    extraMessage?: string
  ) {
    const statusLabel = STATUS_LABELS[request.status] || request.status;

    let text = [
      `🔔 <b>Обновление по заявке #${request.id}</b>`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `📦 <b>Товар:</b> ${request.itemName} (${request.quantity})`,
      `📊 <b>Новый статус:</b> <b>${statusLabel}</b>`,
    ];

    if (request.status === 'ORDERED') {
      text.push(`💰 <b>Факт. цена:</b> ${request.actualPrice} ₾`);
      if (request.expectedDate) {
        text.push(
          `📅 <b>Ожидаемая доставка:</b> ${new Date(
            request.expectedDate
          ).toLocaleDateString('ru-RU')}`
        );
      }
    }

    if (request.status === 'DELIVERED') {
      text.push(
        `\n🎉 <b>Товар доставлен на склад автосервиса!</b>\nПожалуйста, подойдите к завхозу и заберите заказ.`
      );
    }

    if (request.status === 'REJECTED') {
      text.push(`\n❌ <b>Причина отказа:</b> <i>${request.rejectReason || 'Без указания причины'}</i>`);
    }

    if (extraMessage) {
      text.push(`\n💬 <i>${extraMessage}</i>`);
    }

    const kb =
      request.status === 'DELIVERED'
        ? new InlineKeyboard().text('✅ Получил на руки', `req_complete_${request.id}`)
        : undefined;

    try {
      await bot.api.sendMessage(Number(request.userId), text.join('\n'), {
        parse_mode: 'HTML',
        reply_markup: kb,
      });
    } catch (err) {
      console.error(`❌ Failed to notify author ${request.userId}:`, err);
    }
  }

  /**
   * Send Weekly Digest to managers
   */
  async sendWeeklyPlannedDigest(bot: Bot<any>) {
    const plannedRequests = await requestService.getPlannedRequestsForDigest();
    const managerIds = await this.getManagerIds();

    if (managerIds.length === 0 || plannedRequests.length === 0) {
      return;
    }

    let totalEst = 0;
    const itemsText = plannedRequests
      .map((r, i) => {
        const price = r.estPrice ? Number(r.estPrice) : 0;
        totalEst += price;
        return `${i + 1}. <b>#${r.id} ${r.itemName}</b> (${r.quantity}) — ${
          r.estPrice ? `~${r.estPrice} ₾` : 'цена ?'
        } [${r.user.fullName}, ${r.postName || 'Цех'}]`;
      })
      .join('\n');

    const text = [
      `📅 <b>ЕЖЕНЕДЕЛЬНЫЙ ДАЙДЖЕСТ ПЛАНОВЫХ ЗАКУПОК</b>`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `Всего заявок в пуле: <b>${plannedRequests.length} шт</b>`,
      totalEst > 0 ? `Ориентировочная сумма: <b>~${totalEst.toLocaleString('ru-RU')} ₾</b>\n` : '',
      `📋 <b>Список позиций:</b>`,
      itemsText,
      `\n💡 <i>Нажмите «Открыть заявки» для обработки и оформления заказов.</i>`,
    ].join('\n');

    const kb = new InlineKeyboard().text('📥 Открыть список заявок', 'mgr_list_new');

    for (const managerId of managerIds) {
      try {
        await bot.api.sendMessage(Number(managerId), text, {
          parse_mode: 'HTML',
          reply_markup: kb,
        });
      } catch (err) {
        console.error(`❌ Failed to send digest to manager ${managerId}:`, err);
      }
    }
  }

  /**
   * Send Friday Inventory Checklist prompt to managers
   */
  async sendInventoryChecklistPrompt(bot: Bot<any>) {
    const managerIds = await this.getManagerIds();
    if (managerIds.length === 0) return;

    const items = await regularService.getActiveItems();

    const text = [
      `📋 <b>ПЯТНИЧНЫЙ ОБХОД И ИНВЕНТАРИЗАЦИЯ РАСХОДНИКОВ</b>`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `Пора проверить запасы цеха: химия, смазки, перчатки, мыло, кофе.`,
      `В каталоге активных позиций: <b>${items.length} шт</b>.`,
      `\nНажмите кнопку ниже, чтобы пройти быстрый опросник и сформировать заказ на понедельник!`,
    ].join('\n');

    const kb = new InlineKeyboard().text('🚀 Начать чек-лист обхода', 'reg_start_checklist');

    for (const managerId of managerIds) {
      try {
        await bot.api.sendMessage(Number(managerId), text, {
          parse_mode: 'HTML',
          reply_markup: kb,
        });
      } catch (err) {
        console.error(`❌ Failed to send checklist prompt to manager ${managerId}:`, err);
      }
    }
  }
}

export const notificationService = new NotificationService();
