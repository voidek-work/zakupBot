export const ROLES = {
  MECHANIC: 'MECHANIC',
  MANAGER: 'MANAGER',
  DIRECTOR: 'DIRECTOR',
} as const;

export const URGENCIES = {
  URGENT: 'URGENT',
  PLANNED: 'PLANNED',
} as const;

export const REQUEST_STATUSES = {
  NEW: 'NEW',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  IN_PROGRESS: 'IN_PROGRESS',
  ORDERED: 'ORDERED',
  DELIVERED: 'DELIVERED',
  COMPLETED: 'COMPLETED',
  REJECTED: 'REJECTED',
} as const;

export const STATUS_LABELS: Record<string, string> = {
  NEW: '🆕 Новая',
  PENDING_APPROVAL: '⏳ На согласовании',
  IN_PROGRESS: '⚙️ В работе',
  ORDERED: '🛒 Заказано',
  DELIVERED: '📦 Доставлено на склад',
  COMPLETED: '✅ Выдано / Закрыто',
  REJECTED: '❌ Отклонено',
};

export const URGENCY_LABELS: Record<string, string> = {
  URGENT: '🔴 СРОЧНО (Горит пост)',
  PLANNED: '🟡 Планово (В еженедельную закупку)',
};

export const WORKSHOP_POSTS = [
  'Слесарный / Подъемник',
  'Электрика / Диагностика',
  'Агрегатный цех',
  'Склад / Общий цех',
  'Офис',
  'Кухня',
];

export const REJECTION_REASONS = [
  'Есть в наличии на складе',
  'Есть аналог на другом посту',
  'Слишком дорого / Не согласовано',
  'Уточни точные параметры/номер детали',
  'Заказ отложен до следующего месяца',
];
