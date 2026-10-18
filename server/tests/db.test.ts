import { describe, it, expect } from 'vitest';
import { sanitizeMongoUri } from '../src/config/db';

describe('Database Configuration & Security', () => {
  it('sanitizes password from standard mongodb:// URI for safe logging', () => {
    const raw = 'mongodb://appUser:superSecretPassword123@cluster.example.com:27017/athleteconnect';
    const sanitized = sanitizeMongoUri(raw);

    expect(sanitized).not.toContain('superSecretPassword123');
    expect(sanitized).toContain('appUser:****@');
    expect(sanitized).toContain('athleteconnect');
  });

  it('sanitizes password from mongodb+srv:// URI for safe logging', () => {
    const raw = 'mongodb+srv://dbAdmin:TopSecretPass!@ac-cluster.mongodb.net/prod_db';
    const sanitized = sanitizeMongoUri(raw);

    expect(sanitized).not.toContain('TopSecretPass!');
    expect(sanitized).toContain('dbAdmin:****@');
  });

  it('leaves URI without credentials unchanged', () => {
    const raw = 'mongodb://127.0.0.1:27017/athleteconnect';
    const sanitized = sanitizeMongoUri(raw);

    expect(sanitized).toBe('mongodb://127.0.0.1:27017/athleteconnect');
  });
});
