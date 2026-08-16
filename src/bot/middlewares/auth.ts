import { NextFunction } from 'grammy';
import { BotContext } from '../context.js';
import { prisma } from '../../db/client.js';
import { env } from '../../config/env.js';
import { Role } from '@prisma/client';

export async function authMiddleware(ctx: BotContext, next: NextFunction) {
  if (!ctx.from) {
    return next();
  }

  const telegramId = BigInt(ctx.from.id);
  const fullName = [ctx.from.first_name, ctx.from.last_name]
    .filter(Boolean)
    .join(' ');
  const username = ctx.from.username || null;

  // Determine role based on .env config if not yet set
  let initialRole: Role = Role.MECHANIC;
  if (env.DIRECTOR_TELEGRAM_IDS.includes(telegramId)) {
    initialRole = Role.DIRECTOR;
  } else if (env.MANAGER_TELEGRAM_IDS.includes(telegramId)) {
    initialRole = Role.MANAGER;
  }

  try {
    let user = await prisma.user.findUnique({
      where: { id: telegramId },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          id: telegramId,
          fullName: fullName || `User_${telegramId}`,
          username,
          role: initialRole,
        },
      });
    } else {
      // If user was configured in .env as manager/director, promote if needed
      if (
        (initialRole === Role.DIRECTOR && user.role !== Role.DIRECTOR) ||
        (initialRole === Role.MANAGER && user.role === Role.MECHANIC)
      ) {
        user = await prisma.user.update({
          where: { id: telegramId },
          data: { role: initialRole },
        });
      }
    }

    ctx.dbUser = user;
    ctx.userRole = user.role;
  } catch (error) {
    console.error('❌ Auth middleware error:', error);
  }

  return next();
}
