import { describe, expect, it } from 'vitest';
import { shareCurrentLocation } from '../../src/utils/share';

describe('share utilities', () => {
  it('loads the share helper', () => {
    expect(typeof shareCurrentLocation).toBe('function');
  });
});
