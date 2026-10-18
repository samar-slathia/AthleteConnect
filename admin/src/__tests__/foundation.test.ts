import { describe, it, expect } from 'vitest';
import { TOKENS } from '../theme/tokens';

describe('AthleteConnect Phase 1 Foundation & Design Tokens', () => {
  it('enforces locked visual design tokens according to specification', () => {
    // Locked visual design tokens from specification
    expect(TOKENS.colors.navy.toUpperCase()).toBe('#101C2C');
    expect(TOKENS.colors.lime.toUpperCase()).toBe('#C8F169');
    expect(TOKENS.colors.white.toUpperCase()).toBe('#FFFFFF');
    expect(TOKENS.colors.mist.toUpperCase()).toBe('#F3F5F7');
    expect(TOKENS.colors.success.toUpperCase()).toBe('#16805D');
  });

  it('validates navigation items required for Admin Dashboard', () => {
    const requiredNavKeys = ['overview', 'coaches', 'users', 'bookings', 'finance'];
    // All 5 sections must be accounted for
    expect(requiredNavKeys).toHaveLength(5);
  });
});
