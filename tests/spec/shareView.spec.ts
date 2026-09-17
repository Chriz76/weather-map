import { describe, expect, it } from 'vitest';
import { registerShareView, SHARE_ICON_SVG } from '../../src/views/shareView';

describe('share view', () => {
  it('loads the share control view', () => {
    expect(typeof registerShareView).toBe('function');
    expect(SHARE_ICON_SVG).toContain('<svg');
  });
});
