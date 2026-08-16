import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Role } from '@prisma/client';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('../../../src/db/client.js', () => ({
  prisma: prismaMock,
}));

vi.mock('../../../src/config/env.js', () => ({
  env: {
    MANAGER_TELEGRAM_IDS: [111111n],
    DIRECTOR_TELEGRAM_IDS: [222222n],
  },
}));

import { authMiddleware } from '../../../src/bot/middlewares/auth.js';

describe('authMiddleware', () => {
  let nextMock: any;

  beforeEach(() => {
    vi.clearAllMocks();
    nextMock = vi.fn().mockResolvedValue(undefined);
  });

  it('should call next immediately if ctx.from is missing', async () => {
    const ctx: any = {};
    await authMiddleware(ctx, nextMock);
    expect(nextMock).toHaveBeenCalledTimes(1);
    expect(ctx.dbUser).toBeUndefined();
  });

  it('should create new user with role MECHANIC by default', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    const mockCreatedUser = {
      id: 555555n,
      fullName: 'Петр Сидоров',
      username: 'peter',
      role: Role.MECHANIC,
    };
    prismaMock.user.create.mockResolvedValue(mockCreatedUser as any);

    const ctx: any = {
      from: {
        id: 555555,
        first_name: 'Петр',
        last_name: 'Сидоров',
        username: 'peter',
      },
    };

    await authMiddleware(ctx, nextMock);

    expect(prismaMock.user.create).toHaveBeenCalledWith({
      data: {
        id: 555555n,
        fullName: 'Петр Сидоров',
        username: 'peter',
        role: Role.MECHANIC,
      },
    });

    expect(ctx.dbUser).toEqual(mockCreatedUser);
    expect(ctx.userRole).toBe(Role.MECHANIC);
    expect(nextMock).toHaveBeenCalled();
  });

  it('should assign MANAGER role to user listed in MANAGER_TELEGRAM_IDS', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    const mockManager = {
      id: 111111n,
      fullName: 'Завхоз Иван',
      username: 'zavhoz',
      role: Role.MANAGER,
    };
    prismaMock.user.create.mockResolvedValue(mockManager as any);

    const ctx: any = {
      from: {
        id: 111111,
        first_name: 'Завхоз Иван',
        username: 'zavhoz',
      },
    };

    await authMiddleware(ctx, nextMock);

    expect(prismaMock.user.create).toHaveBeenCalledWith({
      data: {
        id: 111111n,
        fullName: 'Завхоз Иван',
        username: 'zavhoz',
        role: Role.MANAGER,
      },
    });

    expect(ctx.userRole).toBe(Role.MANAGER);
  });

  it('should promote existing user to DIRECTOR if added to DIRECTOR_TELEGRAM_IDS', async () => {
    const existingUser = {
      id: 222222n,
      fullName: 'Директор Олег',
      role: Role.MECHANIC,
    };
    const updatedUser = {
      ...existingUser,
      role: Role.DIRECTOR,
    };

    prismaMock.user.findUnique.mockResolvedValue(existingUser as any);
    prismaMock.user.update.mockResolvedValue(updatedUser as any);

    const ctx: any = {
      from: {
        id: 222222,
        first_name: 'Директор Олег',
      },
    };

    await authMiddleware(ctx, nextMock);

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 222222n },
      data: { role: Role.DIRECTOR },
    });

    expect(ctx.dbUser.role).toBe(Role.DIRECTOR);
    expect(ctx.userRole).toBe(Role.DIRECTOR);
  });
});
