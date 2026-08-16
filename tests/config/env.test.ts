import { describe, it, expect } from 'vitest';
import { parseBigIntIds } from '../../src/config/env.js';
import {
  ROLES,
  URGENCIES,
  REQUEST_STATUSES,
  STATUS_LABELS,
  URGENCY_LABELS,
  WORKSHOP_POSTS,
  REJECTION_REASONS,
} from '../../src/config/constants.js';

describe('Config & Env Validation', () => {
  describe('parseBigIntIds', () => {
    it('should parse valid comma-separated Telegram IDs into BigInt array', () => {
      const input = '123456789, 987654321, 555555';
      const result = parseBigIntIds(input);
      expect(result).toEqual([123456789n, 987654321n, 555555n]);
    });

    it('should handle empty or null inputs gracefully', () => {
      expect(parseBigIntIds('')).toEqual([]);
      expect(parseBigIntIds(null)).toEqual([]);
      expect(parseBigIntIds(undefined)).toEqual([]);
      expect(parseBigIntIds('   ')).toEqual([]);
    });

    it('should filter out invalid non-numeric elements and trailing commas', () => {
      const input = '12345, abc, , 67890, invalid_id, ';
      const result = parseBigIntIds(input);
      expect(result).toEqual([12345n, 67890n]);
    });
  });

  describe('Constants and Labels', () => {
    it('should define all required user roles', () => {
      expect(ROLES.MECHANIC).toBe('MECHANIC');
      expect(ROLES.MANAGER).toBe('MANAGER');
      expect(ROLES.DIRECTOR).toBe('DIRECTOR');
    });

    it('should define all request statuses and have corresponding Russian labels', () => {
      const statuses = Object.values(REQUEST_STATUSES);
      expect(statuses.length).toBeGreaterThanOrEqual(7);

      for (const status of statuses) {
        expect(STATUS_LABELS[status]).toBeDefined();
        expect(typeof STATUS_LABELS[status]).toBe('string');
        expect(STATUS_LABELS[status].length).toBeGreaterThan(0);
      }
    });

    it('should define all urgency levels with labels', () => {
      expect(URGENCIES.URGENT).toBe('URGENT');
      expect(URGENCIES.PLANNED).toBe('PLANNED');
      expect(URGENCY_LABELS.URGENT).toContain('СРОЧНО');
      expect(URGENCY_LABELS.PLANNED).toContain('Планово');
    });

    it('should have standard workshop posts and rejection reasons configured', () => {
      expect(WORKSHOP_POSTS.length).toBeGreaterThanOrEqual(5);
      expect(REJECTION_REASONS.length).toBeGreaterThanOrEqual(4);
    });
  });
});
