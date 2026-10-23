import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { register, login, getMe, AuthApiError } from '../authApi';

describe('AuthApi Client', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('register', () => {
    it('sends correct POST request with headers and payload', async () => {
      const mockSuccessResponse = {
        user: {
          _id: 'user_123',
          name: 'Samar S',
          email: 'samar@example.com',
          role: 'parent',
          isActive: true,
        },
        token: 'mock_jwt_token',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockSuccessResponse,
      });

      const payload = {
        name: 'Samar S',
        email: 'samar@example.com',
        password: 'Password123!',
        role: 'parent' as const,
      };

      const result = await register(payload);

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url, options] = (global.fetch as any).mock.calls[0];

      expect(url).toContain('/api/auth/register');
      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(options.headers['Accept']).toBe('application/json');
      expect(JSON.parse(options.body)).toEqual(payload);

      expect(result).toEqual(mockSuccessResponse);
    });

    it('surfaces backend 409 conflict error without leaking database internals', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ error: 'An account with this email address already exists.' }),
      });

      await expect(
        register({
          name: 'Jane Doe',
          email: 'existing@example.com',
          password: 'Password123!',
          role: 'individual',
        })
      ).rejects.toThrow('An account with this email address already exists.');
    });

    it('handles network failure with clear user-friendly message', async () => {
      global.fetch = vi.fn().mockRejectedValue(new TypeError('Network request failed'));

      await expect(
        register({
          name: 'Jane Doe',
          email: 'jane@example.com',
          password: 'Password123!',
          role: 'coach',
        })
      ).rejects.toThrow('Unable to connect to AthleteConnect servers');
    });
  });

  describe('login', () => {
    it('sends correct POST request with credentials', async () => {
      const mockSuccessResponse = {
        user: {
          _id: 'user_456',
          name: 'Jane Trainee',
          email: 'trainee@example.com',
          role: 'individual',
          isActive: true,
        },
        token: 'mock_jwt_token_456',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockSuccessResponse,
      });

      const result = await login({
        email: 'trainee@example.com',
        password: 'Password123!',
      });

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url, options] = (global.fetch as any).mock.calls[0];

      expect(url).toContain('/api/auth/login');
      expect(options.method).toBe('POST');
      expect(JSON.parse(options.body)).toEqual({
        email: 'trainee@example.com',
        password: 'Password123!',
      });
      expect(result).toEqual(mockSuccessResponse);
    });

    it('surfaces generic 401 invalid credentials message', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ error: 'Invalid email or password.' }),
      });

      await expect(
        login({ email: 'wrong@example.com', password: 'WrongPassword!' })
      ).rejects.toThrow('Invalid email or password.');
    });

    it('surfaces 403 deactivated account message', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ error: 'Account has been deactivated. Please contact support.' }),
      });

      await expect(
        login({ email: 'banned@example.com', password: 'Password123!' })
      ).rejects.toThrow('Account has been deactivated. Please contact support.');
    });
  });

  describe('getMe', () => {
    it('rejects immediately when token is empty without issuing network request', async () => {
      global.fetch = vi.fn();

      await expect(getMe('')).rejects.toThrow('Authentication required. Missing token.');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('sends GET request with Bearer token in Authorization header', async () => {
      const mockProfile = {
        _id: 'user_789',
        name: 'Coach Marcus',
        email: 'coach.marcus@example.com',
        role: 'coach',
        isActive: true,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ user: mockProfile }),
      });

      const profile = await getMe('valid_bearer_token_xyz');

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url, options] = (global.fetch as any).mock.calls[0];

      expect(url).toContain('/api/auth/me');
      expect(options.method).toBe('GET');
      expect(options.headers['Authorization']).toBe('Bearer valid_bearer_token_xyz');
      expect(profile).toEqual(mockProfile);
    });

    it('surfaces 401 expired token message', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ error: 'Token has expired. Please log in again.' }),
      });

      await expect(getMe('expired_token')).rejects.toThrow('Token has expired. Please log in again.');
    });
  });
});
