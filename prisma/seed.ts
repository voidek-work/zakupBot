import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // 1. Seed Categories
  const categories = [
    { name: 'Специнструмент', icon: '🔧', sortOrder: 1 },
    { name: 'Химия и масла', icon: '🧴', sortOrder: 2 },
    { name: 'Расходники и крепёж', icon: '🔩', sortOrder: 3 },
    { name: 'Хозтовары и гигиена', icon: '🧼', sortOrder: 4 },
    { name: 'Кофе, чай, клиентская зона', icon: '☕', sortOrder: 5 },
    { name: 'Оборудование цеха', icon: '⚙️', sortOrder: 6 },
    { name: 'Прочее', icon: '📦', sortOrder: 7 },
  ];

  for (const cat of categories) {
    await prisma.category.upsert({
      where: { name: cat.name },
      update: { icon: cat.icon, sortOrder: cat.sortOrder },
      create: cat,
    });
  }
  console.log(`✅ Seeded ${categories.length} categories.`);

  // 2. Seed Standard Regular Consumables
  const regularItems = [
    {
      name: 'Очиститель тормозов 500мл',
      category: 'Химия и масла',
      defaultQuantity: '12',
      unit: 'баллон',
      minStock: 6,
    },
    {
      name: 'WD-40 400мл',
      category: 'Химия и масла',
      defaultQuantity: '6',
      unit: 'баллон',
      minStock: 2,
    },
    {
      name: 'Смазка медная аэрозоль',
      category: 'Химия и масла',
      defaultQuantity: '3',
      unit: 'баллон',
      minStock: 1,
    },
    {
      name: 'Смазка силиконовая аэрозоль',
      category: 'Химия и масла',
      defaultQuantity: '3',
      unit: 'баллон',
      minStock: 1,
    },
    {
      name: 'Перчатки нитриловые (L)',
      category: 'Расходники и крепёж',
      defaultQuantity: '5',
      unit: 'пачка (50 пар)',
      minStock: 2,
    },
    {
      name: 'Перчатки нитриловые (XL)',
      category: 'Расходники и крепёж',
      defaultQuantity: '5',
      unit: 'пачка (50 пар)',
      minStock: 2,
    },
    {
      name: 'Перчатки ХБ с ПВХ',
      category: 'Расходники и крепёж',
      defaultQuantity: '30',
      unit: 'пар',
      minStock: 10,
    },
    {
      name: 'Ветошь трикотажная обтирочная',
      category: 'Расходники и крепёж',
      defaultQuantity: '1',
      unit: 'брикет 10 кг',
      minStock: 1,
    },
    {
      name: 'Паста для мытья рук ("Чистик")',
      category: 'Хозтовары и гигиена',
      defaultQuantity: '1',
      unit: 'ведро 5 л',
      minStock: 1,
    },
    {
      name: 'Бумажные полотенца цеховые',
      category: 'Хозтовары и гигиена',
      defaultQuantity: '6',
      unit: 'рулон',
      minStock: 2,
    },
    {
      name: 'Мусорные мешки 120 л (особо прочные)',
      category: 'Хозтовары и гигиена',
      defaultQuantity: '3',
      unit: 'рулон',
      minStock: 1,
    },
    {
      name: 'Жидкое мыло для диспенсеров',
      category: 'Хозтовары и гигиена',
      defaultQuantity: '1',
      unit: 'канистра 5 л',
      minStock: 1,
    },
    {
      name: 'Кофе в зернах (для клиентской зоны)',
      category: 'Кофе, чай, клиентская зона',
      defaultQuantity: '2',
      unit: 'кг',
      minStock: 1,
    },
    {
      name: 'Чай черный листовой/пакетированный',
      category: 'Кофе, чай, клиентская зона',
      defaultQuantity: '1',
      unit: 'пачка (100 шт)',
      minStock: 1,
    },
    {
      name: 'Сахар рафинад',
      category: 'Кофе, чай, клиентская зона',
      defaultQuantity: '2',
      unit: 'пачка 1 кг',
      minStock: 1,
    },
    {
      name: 'Вода питьевая 19 л (кулер)',
      category: 'Кофе, чай, клиентская зона',
      defaultQuantity: '4',
      unit: 'бутыль',
      minStock: 2,
    },
  ];

  for (const item of regularItems) {
    const existing = await prisma.regularItem.findFirst({
      where: { name: item.name },
    });
    if (!existing) {
      await prisma.regularItem.create({ data: item });
    }
  }
  console.log(`✅ Seeded ${regularItems.length} regular consumable items.`);

  console.log('🎉 Seeding finished successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
