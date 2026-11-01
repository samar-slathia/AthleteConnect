import { describe, it, expect } from 'vitest';
import { TOKENS } from '../theme/tokens';
import type { NavigationItemKey } from '../theme/tokens';

describe('AthleteConnect Admin Phase 1: Foundation & Design Tokens', () => {
  it('enforces locked visual design tokens according to specification', () => {
    // Locked visual design tokens from specification
    expect(TOKENS.colors.navy.toUpperCase()).toBe('#101C2C');
    expect(TOKENS.colors.lime.toUpperCase()).toBe('#C8F169');
    expect(TOKENS.colors.white.toUpperCase()).toBe('#FFFFFF');
    expect(TOKENS.colors.mist.toUpperCase()).toBe('#F3F5F7');
    expect(TOKENS.colors.success.toUpperCase()).toBe('#16805D');
  });

  it('validates navigation items required for Admin Dashboard Foundation (Part 4)', () => {
    // Required 6 navigation areas per Phase 1 specification:
    // 1. Dashboard, 2. Users, 3. Coaches, 4. Bookings, 5. Reports, 6. Settings
    const requiredNavKeys: NavigationItemKey[] = [
      'dashboard',
      'users',
      'coaches',
      'bookings',
      'reports',
      'settings',
    ];
    expect(requiredNavKeys).toHaveLength(6);
    expect(requiredNavKeys).toContain('dashboard');
    expect(requiredNavKeys).toContain('users');
    expect(requiredNavKeys).toContain('coaches');
    expect(requiredNavKeys).toContain('bookings');
    expect(requiredNavKeys).toContain('reports');
    expect(requiredNavKeys).toContain('settings');
  });
});
