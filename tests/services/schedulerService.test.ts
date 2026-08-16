import { describe, it, expect, vi, beforeEach } from 'vitest';
import cron from 'node-cron';

vi.mock('node-cron', () => ({
  default: {
    validate: vi.fn().mockReturnValue(true),
    schedule: vi.fn(),
  },
}));

vi.mock('../../src/config/env.js', () => ({
  env: {
    CRON_WEEKLY_DIGEST: '0 10 * * 1',
    CRON_REGULAR_CHECKLIST: '0 16 * * 5',
  },
}));

vi.mock('../../src/services/notificationService.js', () => ({
  notificationService: {
    sendWeeklyPlannedDigest: vi.fn().mockResolvedValue(undefined),
    sendInventoryChecklistPrompt: vi.fn().mockResolvedValue(undefined),
  },
}));

import { setupScheduler } from '../../src/services/schedulerService.js';
import { notificationService } from '../../src/services/notificationService.js';

describe('SchedulerService', () => {
  let botMock: any;

  beforeEach(() => {
    vi.clearAllMocks();
    botMock = { api: {} };
  });

  it('should validate and schedule weekly digest and consumables checklist jobs', () => {
    setupScheduler(botMock);

    expect(cron.validate).toHaveBeenCalledWith('0 10 * * 1');
    expect(cron.validate).toHaveBeenCalledWith('0 16 * * 5');
    expect(cron.schedule).toHaveBeenCalledTimes(2);

    // Test execution of scheduled callback
    const digestCallback = (cron.schedule as any).mock.calls[0][1];
    digestCallback();
    expect(notificationService.sendWeeklyPlannedDigest).toHaveBeenCalledWith(botMock);

    const checklistCallback = (cron.schedule as any).mock.calls[1][1];
    checklistCallback();
    expect(notificationService.sendInventoryChecklistPrompt).toHaveBeenCalledWith(botMock);
  });
});
