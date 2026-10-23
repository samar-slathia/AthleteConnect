import { describe, it, expect } from 'vitest';
import { User, CUSTOMER_ROLES, ALL_ROLES } from '../src/models/User';

describe('User Model Schema & Validation (Isolated In-Memory)', () => {
  const validUserData = {
    name: 'Sarah Connor',
    email: 'Sarah.Connor@example.com',
    passwordHash: '$2b$12$e80Yv8XlU0J5v7N1d7W7aOBXW7u7q9x7U1F1M1L1K1J1H1G1F1E1D',
    role: 'parent' as const,
  };

  it('validates successfully with all customer roles', async () => {
    for (const role of CUSTOMER_ROLES) {
      const user = new User({
        ...validUserData,
        email: `${role}.user@example.com`,
        role,
      });

      const validationError = user.validateSync();
      expect(validationError).toBeUndefined();
      expect(user.role).toBe(role);
    }
  });

  it('validates successfully with internal admin role', () => {
    const adminUser = new User({
      ...validUserData,
      email: 'ops.admin@athleteconnect.com',
      role: 'admin',
    });

    const validationError = adminUser.validateSync();
    expect(validationError).toBeUndefined();
    expect(adminUser.role).toBe('admin');
  });

  it('rejects unapproved or invalid roles', () => {
    const invalidUser = new User({
      ...validUserData,
      role: 'superhero' as any,
    });

    const validationError = invalidUser.validateSync();
    expect(validationError).toBeDefined();
    expect(validationError?.errors.role).toBeDefined();
    expect(validationError?.errors.role.message).toContain('Invalid role');
  });

  it('normalizes email by trimming and converting to lowercase', () => {
    const user = new User({
      ...validUserData,
      email: '   Trainee.User@AthleteConnect.COM   ',
    });

    expect(user.email).toBe('trainee.user@athleteconnect.com');
  });

  it('rejects invalid email formats', () => {
    const invalidEmails = [
      'plainaddress',
      '#@%^%#$@#$@#.com',
      '@example.com',
      'email.example.com',
      'email@example@example.com',
      'email@example',
    ];

    for (const email of invalidEmails) {
      const user = new User({
        ...validUserData,
        email,
      });

      const validationError = user.validateSync();
      expect(validationError?.errors.email).toBeDefined();
    }
  });

  it('enforces required fields', () => {
    const emptyUser = new User({});
    const validationError = emptyUser.validateSync();

    expect(validationError?.errors.name).toBeDefined();
    expect(validationError?.errors.email).toBeDefined();
    expect(validationError?.errors.passwordHash).toBeDefined();
    expect(validationError?.errors.role).toBeDefined();
  });

  it('enforces name length boundaries (2 to 100 characters)', () => {
    const tooShort = new User({ ...validUserData, name: 'A' });
    expect(tooShort.validateSync()?.errors.name).toBeDefined();

    const tooLong = new User({ ...validUserData, name: 'A'.repeat(101) });
    expect(tooLong.validateSync()?.errors.name).toBeDefined();

    const justRight = new User({ ...validUserData, name: 'Bo' });
    expect(justRight.validateSync()).toBeUndefined();
  });

  it('defaults isActive to true', () => {
    const user = new User(validUserData);
    expect(user.isActive).toBe(true);
  });

  it('strictly excludes passwordHash and __v when serialized to JSON', () => {
    const user = new User(validUserData);
    const json = user.toJSON();

    expect(json.passwordHash).toBeUndefined();
    expect(json.__v).toBeUndefined();
    expect(json.name).toBe(validUserData.name);
    expect(json.email).toBe(validUserData.email.toLowerCase());
    expect(json.role).toBe(validUserData.role);
    expect(json.isActive).toBe(true);
  });

  it('strictly excludes passwordHash when converted to plain Object', () => {
    const user = new User(validUserData);
    const obj = user.toObject();

    expect(obj.passwordHash).toBeUndefined();
    expect(obj.__v).toBeUndefined();
  });

  it('maintains distinct CUSTOMER_ROLES list for public role selection', () => {
    expect(CUSTOMER_ROLES).toEqual(['parent', 'individual', 'coach']);
    expect(CUSTOMER_ROLES).not.toContain('admin');
    expect(ALL_ROLES).toEqual(['parent', 'individual', 'coach', 'admin']);
  });
});
