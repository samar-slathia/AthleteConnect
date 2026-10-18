import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';

describe('Server API Endpoints', () => {
  describe('GET /api/health', () => {
    it('returns 200 OK with healthy status payload', async () => {
      const response = await request(app).get('/api/health');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/json/);
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('service', 'athleteconnect-api');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('environment');
      expect(typeof response.body.uptime).toBe('number');
    });
  });

  describe('Undefined Routes (404 Handling)', () => {
    it('returns consistent 404 JSON response for unmapped endpoints', async () => {
      const response = await request(app).get('/api/does-not-exist');

      expect(response.status).toBe(404);
      expect(response.headers['content-type']).toMatch(/json/);
      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Cannot GET /api/does-not-exist — route not found.',
        },
      });
    });

    it('returns consistent 404 JSON for unknown POST routes', async () => {
      const response = await request(app).post('/unmapped-root');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('CORS Headers', () => {
    it('allows requests with origin configured in environment', async () => {
      const response = await request(app)
        .get('/api/health')
        .set('Origin', 'http://localhost:5173');

      expect(response.status).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    });
  });
});
