import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

export async function connectDB() {
  try {
    await prisma.$connect();
    console.log('✅ PostgreSQL connected successfully via Prisma');
  } catch (error) {
    console.error('❌ Failed to connect to PostgreSQL:', error);
    console.warn('⚠️ Make sure DATABASE_URL is configured in your .env file.');
  }
}
