import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { Booking } from '../src/models/Booking';
import { CoachProfile } from '../src/models/CoachProfile';
import { hashPassword } from '../src/utils/password';
import { signToken } from '../src/utils/jwt';

describe('Admin Authentication & Dashboard API (Phase 1)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /api/admin/login', () => {
    it('rejects empty or malformed request payload with HTTP 400', async () => {
      const res1 = await request(app).post('/api/admin/login').send({});
      expect(res1.status).toBe(400);
      expect(res1.body.error).toContain('Email and password are required');

      const res2 = await request(app).post('/api/admin/login').send({
        email: 'not-an-email',
        password: 'ValidPassword123!',
      });
      expect(res2.status).toBe(400);
      expect(res2.body.error).toContain('valid email address');
    });

    it('rejects unknown admin email with HTTP 401 generic message', async () => {
      vi.spyOn(User, 'findOne').mockReturnValue({
        select: vi.fn().mockResolvedValue(null),
      } as any);

      const res = await request(app).post('/api/admin/login').send({
        email: 'unknown.admin@athleteconnect.test',
        password: 'SomePassword123!',
      });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid email or password.');
    });

    it('rejects invalid password with HTTP 401 generic message', async () => {
      const realHash = await hashPassword('AdminPassSecret123!');
      const mockAdmin = new User({
        _id: new mongoose.Types.ObjectId(),
        name: 'Master Admin',
        email: 'admin@athleteconnect.test',
        passwordHash: realHash,
        role: 'admin',
        isActive: true,
      });

      vi.spyOn(User, 'findOne').mockReturnValue({
        select: vi.fn().mockResolvedValue(mockAdmin),
      } as any);

      const res = await request(app).post('/api/admin/login').send({
        email: 'admin@athleteconnect.test',
        password: 'WrongPassword456!',
      });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid email or password.');
    });

    it('rejects deactivated admin account with HTTP 403', async () => {
      const realHash = await hashPassword('AdminPassSecret123!');
      const mockAdmin = new User({
        _id: new mongoose.Types.ObjectId(),
        name: 'Deactivated Admin',
        email: 'deactivated.admin@athleteconnect.test',
        passwordHash: realHash,
        role: 'admin',
        isActive: false,
      });

      vi.spyOn(User, 'findOne').mockReturnValue({
        select: vi.fn().mockResolvedValue(mockAdmin),
      } as any);

      const res = await request(app).post('/api/admin/login').send({
        email: 'deactivated.admin@athleteconnect.test',
        password: 'AdminPassSecret123!',
      });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Account has been deactivated');
    });

    it('rejects valid credentials belonging to non-admin roles (parent, individual, coach) with HTTP 403', async () => {
      const nonAdminRoles = ['parent', 'individual', 'coach'] as const;

      for (const role of nonAdminRoles) {
        const plainPassword = 'CustomerPass123!';
        const realHash = await hashPassword(plainPassword);
        const mockUser = new User({
          _id: new mongoose.Types.ObjectId(),
          name: `Sample ${role}`,
          email: `${role}@athleteconnect.test`,
          passwordHash: realHash,
          role,
          isActive: true,
        });

        vi.spyOn(User, 'findOne').mockReturnValue({
          select: vi.fn().mockResolvedValue(mockUser),
        } as any);

        const res = await request(app).post('/api/admin/login').send({
          email: `${role}@athleteconnect.test`,
          password: plainPassword,
        });

        expect(res.status).toBe(403);
        expect(res.body.error).toContain('Administrator account required');
      }
    });

    it('successfully authenticates active admin and returns sanitized user with JWT', async () => {
      const plainPassword = 'SuperAdminSecretPass123!';
      const realHash = await hashPassword(plainPassword);
      const mockAdminId = new mongoose.Types.ObjectId();
      const mockAdmin = new User({
        _id: mockAdminId,
        name: 'Sarah Connor (Admin)',
        email: 'admin.lead@athleteconnect.com',
        passwordHash: realHash,
        role: 'admin',
        isActive: true,
      });

      vi.spyOn(User, 'findOne').mockReturnValue({
        select: vi.fn().mockResolvedValue(mockAdmin),
      } as any);

      const res = await request(app).post('/api/admin/login').send({
        email: 'ADMIN.LEAD@ATHLETECONNECT.COM',
        password: plainPassword,
      });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('user');
      expect(res.body).toHaveProperty('token');
      expect(res.body.user.email).toBe('admin.lead@athleteconnect.com');
      expect(res.body.user.role).toBe('admin');
      expect(res.body.user.name).toBe('Sarah Connor (Admin)');
      expect(res.body.user.passwordHash).toBeUndefined();
      expect(typeof res.body.token).toBe('string');
    });
  });

  describe('GET /api/admin/me', () => {
    it('rejects unauthenticated requests with HTTP 401', async () => {
      const res = await request(app).get('/api/admin/me');
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Authentication required');
    });

    it('rejects expired or malformed JWT with HTTP 401', async () => {
      const res = await request(app)
        .get('/api/admin/me')
        .set('Authorization', 'Bearer invalid.token.payload');
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Invalid or malformed');
    });

    it('rejects authenticated users having non-admin roles with HTTP 403', async () => {
      const nonAdminRoles = ['parent', 'individual', 'coach'] as const;

      for (const role of nonAdminRoles) {
        const userId = new mongoose.Types.ObjectId();
        const token = signToken({
          userId: userId.toString(),
          email: `${role}@athleteconnect.test`,
          role,
        });

        // Backend auth middleware checks database role directly
        const mockUser = new User({
          _id: userId,
          name: `User ${role}`,
          email: `${role}@athleteconnect.test`,
          role,
          isActive: true,
        });
        vi.spyOn(User, 'findById').mockResolvedValue(mockUser);

        const res = await request(app)
          .get('/api/admin/me')
          .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(403);
        expect(res.body.error).toContain('Access forbidden');
      }
    });

    it('returns authenticated admin profile for valid admin token', async () => {
      const adminId = new mongoose.Types.ObjectId();
      const token = signToken({
        userId: adminId.toString(),
        email: 'ops.admin@athleteconnect.com',
        role: 'admin',
      });

      const mockAdmin = new User({
        _id: adminId,
        name: 'Ops Admin Lead',
        email: 'ops.admin@athleteconnect.com',
        role: 'admin',
        isActive: true,
      });
      vi.spyOn(User, 'findById').mockResolvedValue(mockAdmin);

      const res = await request(app)
        .get('/api/admin/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.role).toBe('admin');
      expect(res.body.user.name).toBe('Ops Admin Lead');
    });
  });

  describe('GET /api/admin/overview', () => {
    it('rejects unauthenticated requests with HTTP 401', async () => {
      const res = await request(app).get('/api/admin/overview');
      expect(res.status).toBe(401);
    });

    it('rejects non-admin role users with HTTP 403', async () => {
      const coachId = new mongoose.Types.ObjectId();
      const token = signToken({
        userId: coachId.toString(),
        email: 'coach@athleteconnect.test',
        role: 'coach',
      });

      const mockCoach = new User({
        _id: coachId,
        name: 'Coach User',
        email: 'coach@athleteconnect.test',
        role: 'coach',
        isActive: true,
      });
      vi.spyOn(User, 'findById').mockResolvedValue(mockCoach);

      const res = await request(app)
        .get('/api/admin/overview')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Access forbidden');
    });

    it('returns honest 0 counts and empty arrays when database is empty', async () => {
      const adminId = new mongoose.Types.ObjectId();
      const token = signToken({
        userId: adminId.toString(),
        email: 'admin@athleteconnect.com',
        role: 'admin',
      });

      const mockAdmin = new User({
        _id: adminId,
        name: 'System Admin',
        email: 'admin@athleteconnect.com',
        role: 'admin',
        isActive: true,
      });
      vi.spyOn(User, 'findById').mockResolvedValue(mockAdmin);

      // Spy on countDocuments for User and Booking
      vi.spyOn(User, 'countDocuments').mockResolvedValue(0 as any);
      vi.spyOn(Booking, 'countDocuments').mockResolvedValue(0 as any);

      // Spy on User.find and Booking.find chains
      vi.spyOn(Booking, 'find').mockReturnValue({
        sort: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            populate: vi.fn().mockReturnValue({
              populate: vi.fn().mockReturnValue({
                lean: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
        }),
      } as any);

      vi.spyOn(User, 'find').mockReturnValue({
        sort: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              lean: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      } as any);

      const res = await request(app)
        .get('/api/admin/overview')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.metrics.users).toEqual({
        total: 0,
        parents: 0,
        individuals: 0,
        customersJoined: 0,
        activeCustomers: 0,
        coaches: 0,
        coachesJoined: 0,
        activeCoaches: 0,
        admins: 0,
      });
      expect(res.body.metrics.bookings).toEqual({
        total: 0,
        pending: 0,
        accepted: 0,
        completed: 0,
        cancelled: 0,
        declined: 0,
        cancelledAndDeclined: 0,
      });
      expect(res.body.recentBookings).toEqual([]);
      expect(res.body.recentCoaches).toEqual([]);
      expect(res.body.timestamp).toBeDefined();
    });

    it('returns accurate verifiable database counts and populated records when populated', async () => {
      const adminId = new mongoose.Types.ObjectId();
      const token = signToken({
        userId: adminId.toString(),
        email: 'admin@athleteconnect.com',
        role: 'admin',
      });

      const mockAdmin = new User({
        _id: adminId,
        name: 'System Admin',
        email: 'admin@athleteconnect.com',
        role: 'admin',
        isActive: true,
      });
      vi.spyOn(User, 'findById').mockResolvedValue(mockAdmin);

      // Mock User.countDocuments according to filter
      vi.spyOn(User, 'countDocuments').mockImplementation(((filter: any) => {
        if (!filter || Object.keys(filter).length === 0) return Promise.resolve(45);
        if (filter.role === 'parent') return Promise.resolve(20);
        if (filter.role === 'individual') return Promise.resolve(15);
        if (filter.role?.$in && filter.isActive === true) return Promise.resolve(32);
        if (filter.role === 'coach' && filter.isActive === true) return Promise.resolve(8);
        if (filter.role === 'coach') return Promise.resolve(9);
        if (filter.role === 'admin') return Promise.resolve(1);
        return Promise.resolve(0);
      }) as any);

      // Mock Booking.countDocuments according to filter
      vi.spyOn(Booking, 'countDocuments').mockImplementation(((filter: any) => {
        if (filter?.status === 'pending') return Promise.resolve(4);
        if (filter?.status === 'accepted') return Promise.resolve(7);
        if (filter?.status === 'completed') return Promise.resolve(12);
        if (filter?.status === 'cancelled') return Promise.resolve(2);
        if (filter?.status === 'rejected') return Promise.resolve(1);
        return Promise.resolve(0);
      }) as any);

      const customerId = new mongoose.Types.ObjectId();
      const coachId = new mongoose.Types.ObjectId();
      const bookingId = new mongoose.Types.ObjectId();

      vi.spyOn(Booking, 'find').mockReturnValue({
        sort: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            populate: vi.fn().mockReturnValue({
              populate: vi.fn().mockReturnValue({
                lean: vi.fn().mockResolvedValue([
                  {
                    _id: bookingId,
                    sport: 'boxing',
                    date: '2026-11-05',
                    startTime: '10:00',
                    endTime: '11:00',
                    venueType: 'ground',
                    status: 'pending',
                    createdAt: new Date('2026-11-01T10:00:00Z'),
                    customerId: {
                      _id: customerId,
                      name: 'Athletic Parent',
                      email: 'parent@example.com',
                      role: 'parent',
                    },
                    coachId: {
                      _id: coachId,
                      name: 'Coach Dave',
                      email: 'dave@example.com',
                    },
                  },
                ]),
              }),
            }),
          }),
        }),
      } as any);

      vi.spyOn(User, 'find').mockReturnValue({
        sort: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              lean: vi.fn().mockResolvedValue([
                {
                  _id: coachId,
                  name: 'Coach Dave',
                  email: 'dave@example.com',
                  isActive: true,
                  createdAt: new Date('2026-10-20T10:00:00Z'),
                },
              ]),
            }),
          }),
        }),
      } as any);

      const res = await request(app)
        .get('/api/admin/overview')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.metrics.users).toEqual({
        total: 45,
        parents: 20,
        individuals: 15,
        customersJoined: 35,
        activeCustomers: 32,
        coaches: 9,
        coachesJoined: 9,
        activeCoaches: 8,
        admins: 1,
      });
      expect(res.body.metrics.bookings).toEqual({
        total: 26, // 4 + 7 + 12 + (2 + 1)
        pending: 4,
        accepted: 7,
        completed: 12,
        cancelled: 2,
        declined: 1,
        cancelledAndDeclined: 3,
      });
      expect(res.body.recentBookings).toHaveLength(1);
      expect(res.body.recentBookings[0].sport).toBe('boxing');
      expect(res.body.recentBookings[0].customer.name).toBe('Athletic Parent');
      expect(res.body.recentBookings[0].coach.name).toBe('Coach Dave');
      expect(res.body.recentCoaches).toHaveLength(1);
      expect(res.body.recentCoaches[0].name).toBe('Coach Dave');
    });

    it('accurately calculates Customers Joined (parents + individuals) and Coaches Joined, strictly excluding admin accounts and avoiding double counting', async () => {
      const adminId = new mongoose.Types.ObjectId();
      const token = signToken({
        userId: adminId.toString(),
        email: 'admin@athleteconnect.com',
        role: 'admin',
      });

      const mockAdmin = new User({
        _id: adminId,
        name: 'System Admin',
        email: 'admin@athleteconnect.com',
        role: 'admin',
        isActive: true,
      });
      vi.spyOn(User, 'findById').mockResolvedValue(mockAdmin);

      // Distinct counts: 14 Parents, 16 Individuals, 7 Coaches, 2 Admins (Total: 39)
      vi.spyOn(User, 'countDocuments').mockImplementation(((filter: any) => {
        if (!filter || Object.keys(filter).length === 0) return Promise.resolve(39);
        if (filter.role === 'parent') return Promise.resolve(14);
        if (filter.role === 'individual') return Promise.resolve(16);
        if (filter.role?.$in && filter.isActive === true) return Promise.resolve(28);
        if (filter.role === 'coach' && filter.isActive === true) return Promise.resolve(6);
        if (filter.role === 'coach') return Promise.resolve(7);
        if (filter.role === 'admin') return Promise.resolve(2);
        return Promise.resolve(0);
      }) as any);

      vi.spyOn(Booking, 'countDocuments').mockResolvedValue(0 as any);
      vi.spyOn(Booking, 'find').mockReturnValue({
        sort: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            populate: vi.fn().mockReturnValue({
              populate: vi.fn().mockReturnValue({
                lean: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
        }),
      } as any);

      vi.spyOn(User, 'find').mockReturnValue({
        sort: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              lean: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      } as any);

      const res = await request(app)
        .get('/api/admin/overview')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      // Customers Joined = 14 parents + 16 individuals = 30
      expect(res.body.metrics.users.customersJoined).toBe(30);
      expect(res.body.metrics.users.parents).toBe(14);
      expect(res.body.metrics.users.individuals).toBe(16);

      // Coaches Joined = 7
      expect(res.body.metrics.users.coachesJoined).toBe(7);
      expect(res.body.metrics.users.coaches).toBe(7);
      expect(res.body.metrics.users.activeCoaches).toBe(6);

      // Admins (2) are tracked independently and NOT added to customers or coaches
      expect(res.body.metrics.users.admins).toBe(2);
      expect(
        res.body.metrics.users.customersJoined +
          res.body.metrics.users.coachesJoined +
          res.body.metrics.users.admins
      ).toBe(res.body.metrics.users.total);
    });
  });

  describe('Users Management API (Phase 2)', () => {
    const adminId = new mongoose.Types.ObjectId();
    const adminToken = signToken({
      userId: adminId.toString(),
      email: 'admin@athleteconnect.test',
      role: 'admin',
    });

    const mockAdmin = new User({
      _id: adminId,
      name: 'Super Admin',
      email: 'admin@athleteconnect.test',
      role: 'admin',
      isActive: true,
    });

    describe('GET /api/admin/users', () => {
      it('rejects unauthenticated requests with HTTP 401', async () => {
        const res = await request(app).get('/api/admin/users');
        expect(res.status).toBe(401);
      });

      it('rejects non-admin role users with HTTP 403', async () => {
        const coachId = new mongoose.Types.ObjectId();
        const coachToken = signToken({
          userId: coachId.toString(),
          email: 'coach@athleteconnect.test',
          role: 'coach',
        });
        vi.spyOn(User, 'findById').mockResolvedValue(
          new User({ _id: coachId, role: 'coach', isActive: true })
        );

        const res = await request(app)
          .get('/api/admin/users')
          .set('Authorization', `Bearer ${coachToken}`);
        expect(res.status).toBe(403);
      });

      it('returns paginated customer accounts with summary metrics', async () => {
        vi.spyOn(User, 'findById').mockResolvedValue(mockAdmin);

        const mockUsers = [
          {
            _id: new mongoose.Types.ObjectId(),
            name: 'Parent User',
            email: 'parent@example.com',
            role: 'parent',
            isActive: true,
            createdAt: new Date(),
          },
          {
            _id: new mongoose.Types.ObjectId(),
            name: 'Individual User',
            email: 'indiv@example.com',
            role: 'individual',
            isActive: false,
            createdAt: new Date(),
          },
        ];

        vi.spyOn(User, 'find').mockReturnValue({
          select: vi.fn().mockReturnValue({
            sort: vi.fn().mockReturnValue({
              skip: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  lean: vi.fn().mockResolvedValue(mockUsers),
                }),
              }),
            }),
          }),
        } as any);

        vi.spyOn(User, 'countDocuments').mockImplementation(((filter: any) => {
          if (filter?.role === 'parent') return Promise.resolve(15);
          if (filter?.role === 'individual') return Promise.resolve(10);
          if (filter?.role?.$in && filter?.isActive === true) return Promise.resolve(20);
          if (filter?.role?.$in && filter?.isActive === false) return Promise.resolve(5);
          if (filter?.role?.$in) return Promise.resolve(25);
          return Promise.resolve(25);
        }) as any);

        const res = await request(app)
          .get('/api/admin/users?page=1&limit=10')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.users).toHaveLength(2);
        expect(res.body.users[0].name).toBe('Parent User');
        expect(res.body.users[0].passwordHash).toBeUndefined();
        expect(res.body.pagination).toEqual({
          page: 1,
          limit: 10,
          total: 25,
          totalPages: 3,
        });
        expect(res.body.summary).toEqual({
          totalCustomers: 25,
          parentCount: 15,
          individualCount: 10,
          activeCount: 20,
          inactiveCount: 5,
        });
      });

      it('handles search, role, and status query filters safely', async () => {
        vi.spyOn(User, 'findById').mockResolvedValue(mockAdmin);

        let capturedFilter: any = null;
        vi.spyOn(User, 'find').mockImplementation(((filter: any) => {
          capturedFilter = filter;
          return {
            select: vi.fn().mockReturnValue({
              sort: vi.fn().mockReturnValue({
                skip: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    lean: vi.fn().mockResolvedValue([]),
                  }),
                }),
              }),
            }),
          };
        }) as any);

        vi.spyOn(User, 'countDocuments').mockResolvedValue(0 as any);

        const res = await request(app)
          .get('/api/admin/users?search=john&role=parent&status=active')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(capturedFilter.role).toBe('parent');
        expect(capturedFilter.isActive).toBe(true);
        expect(capturedFilter.$or).toBeDefined();
      });
    });

    describe('GET /api/admin/users/:id', () => {
      it('rejects invalid ObjectId with HTTP 400', async () => {
        vi.spyOn(User, 'findById').mockResolvedValue(mockAdmin);
        const res = await request(app)
          .get('/api/admin/users/invalid-id-format')
          .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(400);
      });

      it('returns 404 if user not found or is not a customer', async () => {
        vi.spyOn(User, 'findById').mockImplementation(((id: any) => {
          if (id.toString() === adminId.toString()) return Promise.resolve(mockAdmin);
          return {
            select: vi.fn().mockResolvedValue(null),
          };
        }) as any);

        const res = await request(app)
          .get(`/api/admin/users/${new mongoose.Types.ObjectId()}`)
          .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(404);
      });

      it('returns customer details with booking count', async () => {
        const customerId = new mongoose.Types.ObjectId();
        const mockCustomer = new User({
          _id: customerId,
          name: 'Sarah Trainee',
          email: 'sarah@example.com',
          role: 'individual',
          isActive: true,
          createdAt: new Date(),
        });

        vi.spyOn(User, 'findById').mockImplementation(((id: any) => {
          if (id.toString() === adminId.toString()) return Promise.resolve(mockAdmin);
          return {
            select: vi.fn().mockResolvedValue(mockCustomer),
          };
        }) as any);

        vi.spyOn(Booking, 'countDocuments').mockResolvedValue(4 as any);

        const res = await request(app)
          .get(`/api/admin/users/${customerId}`)
          .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.user.name).toBe('Sarah Trainee');
        expect(res.body.user.role).toBe('individual');
        expect(res.body.bookingCount).toBe(4);
      });
    });

    describe('PATCH /api/admin/users/:id/status', () => {
      it('rejects non-boolean isActive payload with HTTP 400', async () => {
        vi.spyOn(User, 'findById').mockResolvedValue(mockAdmin);
        const res = await request(app)
          .patch(`/api/admin/users/${new mongoose.Types.ObjectId()}/status`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ isActive: 'invalid' });
        expect(res.status).toBe(400);
      });

      it('forbids modifying administrator accounts with HTTP 403', async () => {
        const otherAdminId = new mongoose.Types.ObjectId();
        const otherAdmin = new User({
          _id: otherAdminId,
          name: 'Other Admin',
          email: 'other@admin.com',
          role: 'admin',
          isActive: true,
        });

        vi.spyOn(User, 'findById').mockImplementation(((id: any) => {
          if (id.toString() === adminId.toString()) return Promise.resolve(mockAdmin);
          return Promise.resolve(otherAdmin);
        }) as any);

        const res = await request(app)
          .patch(`/api/admin/users/${otherAdminId}/status`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ isActive: false });

        expect(res.status).toBe(403);
        expect(res.body.error).toContain('Administrator accounts cannot be modified');
      });

      it('prevents authenticated admin from altering their own account with HTTP 400', async () => {
        vi.spyOn(User, 'findById').mockResolvedValue(mockAdmin);

        const res = await request(app)
          .patch(`/api/admin/users/${adminId}/status`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ isActive: false });

        expect(res.status).toBe(403); // Caught by role === 'admin' guard or self guard
      });

      it('successfully toggles account isActive status', async () => {
        const customerId = new mongoose.Types.ObjectId();
        const customer = new User({
          _id: customerId,
          name: 'John Customer',
          email: 'john@example.com',
          role: 'parent',
          isActive: true,
        });
        vi.spyOn(customer, 'save').mockResolvedValue(customer);

        vi.spyOn(User, 'findById').mockImplementation(((id: any) => {
          if (id.toString() === adminId.toString()) return Promise.resolve(mockAdmin);
          return Promise.resolve(customer);
        }) as any);

        const res = await request(app)
          .patch(`/api/admin/users/${customerId}/status`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ isActive: false });

        expect(res.status).toBe(200);
        expect(customer.isActive).toBe(false);
        expect(res.body.user.isActive).toBe(false);
        expect(res.body.message).toContain('deactivated');
      });
    });
  });

  describe('Coaches Management API (Phase 2)', () => {
    const adminId = new mongoose.Types.ObjectId();
    const adminToken = signToken({
      userId: adminId.toString(),
      email: 'admin@athleteconnect.test',
      role: 'admin',
    });

    const mockAdmin = new User({
      _id: adminId,
      name: 'Super Admin',
      email: 'admin@athleteconnect.test',
      role: 'admin',
      isActive: true,
    });

    describe('GET /api/admin/coaches', () => {
      it('rejects unauthenticated requests with HTTP 401', async () => {
        const res = await request(app).get('/api/admin/coaches');
        expect(res.status).toBe(401);
      });

      it('returns paginated coach records combined with CoachProfile metadata', async () => {
        vi.spyOn(User, 'findById').mockResolvedValue(mockAdmin);

        const coachId = new mongoose.Types.ObjectId();
        const mockCoaches = [
          {
            _id: coachId,
            name: 'Coach Marcus',
            email: 'marcus@coach.com',
            role: 'coach',
            isActive: true,
            createdAt: new Date(),
          },
        ];

        vi.spyOn(User, 'find').mockReturnValue({
          select: vi.fn().mockReturnValue({
            sort: vi.fn().mockReturnValue({
              skip: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  lean: vi.fn().mockResolvedValue(mockCoaches),
                }),
              }),
            }),
          }),
        } as any);

        vi.spyOn(User, 'countDocuments').mockImplementation(((filter: any) => {
          if (filter?.isActive === true) return Promise.resolve(8);
          if (filter?.isActive === false) return Promise.resolve(2);
          return Promise.resolve(10);
        }) as any);

        vi.spyOn(CoachProfile, 'find').mockReturnValue({
          lean: vi.fn().mockResolvedValue([
            {
              userId: coachId,
              bio: 'Experienced kickboxer',
              disciplines: ['kickboxing'],
              hourlyRate: 1500,
              currency: 'INR',
              locations: ['South Ground'],
              sessionFormats: ['one_on_one'],
              venueTypes: ['ground'],
              isPublished: true,
            },
          ]),
        } as any);

        const res = await request(app)
          .get('/api/admin/coaches?page=1&limit=10')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.coaches).toHaveLength(1);
        expect(res.body.coaches[0].name).toBe('Coach Marcus');
        expect(res.body.coaches[0].profile.disciplines).toContain('kickboxing');
        expect(res.body.coaches[0].profile.isComplete).toBe(true);
        expect(res.body.summary).toEqual({
          totalCoaches: 10,
          activeCoaches: 8,
          inactiveCoaches: 2,
        });
      });

      it('filters coaches by discipline safely through CoachProfile lookup', async () => {
        vi.spyOn(User, 'findById').mockResolvedValue(mockAdmin);

        const boxerId = new mongoose.Types.ObjectId();
        vi.spyOn(CoachProfile, 'find').mockImplementation(((filter: any) => {
          if (filter?.disciplines === 'boxing') {
            return {
              select: vi.fn().mockReturnValue({
                lean: vi.fn().mockResolvedValue([{ userId: boxerId }]),
              }),
            };
          }
          return {
            lean: vi.fn().mockResolvedValue([]),
          };
        }) as any);

        let capturedFilter: any = null;
        vi.spyOn(User, 'find').mockImplementation(((filter: any) => {
          capturedFilter = filter;
          return {
            select: vi.fn().mockReturnValue({
              sort: vi.fn().mockReturnValue({
                skip: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    lean: vi.fn().mockResolvedValue([]),
                  }),
                }),
              }),
            }),
          };
        }) as any);

        vi.spyOn(User, 'countDocuments').mockResolvedValue(0 as any);

        const res = await request(app)
          .get('/api/admin/coaches?discipline=boxing')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(capturedFilter._id).toEqual({ $in: [boxerId] });
      });
    });

    describe('GET /api/admin/coaches/:id', () => {
      it('returns 404 for non-existent coach or non-coach user', async () => {
        vi.spyOn(User, 'findById').mockImplementation(((id: any) => {
          if (id.toString() === adminId.toString()) return Promise.resolve(mockAdmin);
          return { select: vi.fn().mockResolvedValue(null) };
        }) as any);

        const res = await request(app)
          .get(`/api/admin/coaches/${new mongoose.Types.ObjectId()}`)
          .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(404);
      });

      it('returns coach profile details and session booking count', async () => {
        const coachId = new mongoose.Types.ObjectId();
        const mockCoach = new User({
          _id: coachId,
          name: 'Coach Jin',
          email: 'jin@coach.test',
          role: 'coach',
          isActive: true,
          createdAt: new Date(),
        });

        vi.spyOn(User, 'findById').mockImplementation(((id: any) => {
          if (id.toString() === adminId.toString()) return Promise.resolve(mockAdmin);
          return { select: vi.fn().mockResolvedValue(mockCoach) };
        }) as any);

        vi.spyOn(CoachProfile, 'findOne').mockReturnValue({
          lean: vi.fn().mockResolvedValue({
            userId: coachId,
            bio: 'Master of Wushu martial arts',
            disciplines: ['wushu'],
            hourlyRate: 2000,
            currency: 'INR',
            locations: ['City Sports Hall'],
            sessionFormats: ['small_group'],
            venueTypes: ['ground'],
            isPublished: true,
          }),
        } as any);

        vi.spyOn(Booking, 'countDocuments').mockResolvedValue(12 as any);

        const res = await request(app)
          .get(`/api/admin/coaches/${coachId}`)
          .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.coach.name).toBe('Coach Jin');
        expect(res.body.profile.bio).toContain('Master of Wushu');
        expect(res.body.bookingCount).toBe(12);
      });
    });

    describe('GET /api/admin/bookings (Phase 3)', () => {
      it('rejects unauthenticated requests with HTTP 401', async () => {
        const res = await request(app).get('/api/admin/bookings');
        expect(res.status).toBe(401);
      });

      it('rejects non-admin role requests with HTTP 403', async () => {
        const nonAdminToken = signToken({
          userId: new mongoose.Types.ObjectId().toString(),
          email: 'coach@athleteconnect.test',
          role: 'coach',
        });

        vi.spyOn(User, 'findById').mockResolvedValue(
          new User({
            _id: new mongoose.Types.ObjectId(),
            name: 'Coach Test',
            email: 'coach@athleteconnect.test',
            role: 'coach',
            isActive: true,
          }) as any
        );

        const res = await request(app)
          .get('/api/admin/bookings')
          .set('Authorization', `Bearer ${nonAdminToken}`);

        expect(res.status).toBe(403);
      });

      it('rejects invalid query parameters with HTTP 400', async () => {
        vi.spyOn(User, 'findById').mockResolvedValue(mockAdmin as any);

        // Invalid status
        const resStatus = await request(app)
          .get('/api/admin/bookings?status=unknown_status')
          .set('Authorization', `Bearer ${adminToken}`);
        expect(resStatus.status).toBe(400);
        expect(resStatus.body.error).toContain('Invalid status');

        // Invalid sport
        const resSport = await request(app)
          .get('/api/admin/bookings?sport=badminton')
          .set('Authorization', `Bearer ${adminToken}`);
        expect(resSport.status).toBe(400);
        expect(resSport.body.error).toContain('Invalid sport');

        // Invalid date format
        const resDate = await request(app)
          .get('/api/admin/bookings?fromDate=15-05-2026')
          .set('Authorization', `Bearer ${adminToken}`);
        expect(resDate.status).toBe(400);
        expect(resDate.body.error).toContain('Invalid fromDate');

        // Invalid customerId
        const resCust = await request(app)
          .get('/api/admin/bookings?customerId=not-a-mongo-id')
          .set('Authorization', `Bearer ${adminToken}`);
        expect(resCust.status).toBe(400);
        expect(resCust.body.error).toContain('Invalid customerId format');
      });

      it('returns paginated bookings, summary metrics, and filteredCount', async () => {
        vi.spyOn(User, 'findById').mockResolvedValue(mockAdmin as any);

        const bookingId = new mongoose.Types.ObjectId();
        const mockCustomer = {
          _id: new mongoose.Types.ObjectId(),
          name: 'Sarah Customer',
          email: 'sarah@customer.test',
          role: 'parent',
          isActive: true,
        };
        const mockCoach = {
          _id: new mongoose.Types.ObjectId(),
          name: 'Coach Marcus',
          email: 'marcus@coach.test',
          isActive: true,
        };

        const mockBookings = [
          {
            _id: bookingId,
            sport: 'boxing',
            date: '2026-11-15',
            startTime: '10:00',
            endTime: '11:00',
            durationMinutes: 60,
            venueType: 'coach_home',
            status: 'accepted',
            paymentStatus: 'paid',
            hourlyRateSnapshot: 1500,
            customerId: mockCustomer,
            coachId: mockCoach,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ];

        // Mock countDocuments for all-time and filtered queries
        vi.spyOn(Booking, 'countDocuments').mockImplementation(((filter: any) => {
          if (!filter || Object.keys(filter).length === 0) return Promise.resolve(50);
          if (filter.status === 'pending') return Promise.resolve(10);
          if (filter.status === 'accepted') return Promise.resolve(20);
          if (filter.status === 'completed') return Promise.resolve(12);
          if (filter.status === 'cancelled') return Promise.resolve(5);
          if (filter.status === 'rejected') return Promise.resolve(3);
          return Promise.resolve(1); // filtered count
        }) as any);

        const mockChain: any = {
          populate: vi.fn().mockReturnThis(),
          sort: vi.fn().mockReturnThis(),
          skip: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          lean: vi.fn().mockResolvedValue(mockBookings),
        };
        vi.spyOn(Booking, 'find').mockReturnValue(mockChain as any);

        const res = await request(app)
          .get('/api/admin/bookings?page=1&limit=10&status=accepted')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.bookings).toHaveLength(1);
        expect(res.body.bookings[0]._id).toBe(bookingId.toString());
        expect(res.body.bookings[0].customer.name).toBe('Sarah Customer');
        expect(res.body.bookings[0].coach.name).toBe('Coach Marcus');
        expect(res.body.summary.total).toBe(50);
        expect(res.body.summary.pending).toBe(10);
        expect(res.body.summary.accepted).toBe(20);
        expect(res.body.summary.completed).toBe(12);
        expect(res.body.summary.cancelled).toBe(5);
        expect(res.body.summary.declined).toBe(3);
        expect(res.body.pagination.total).toBe(20);
        expect(res.body.pagination.page).toBe(1);
      });

      it('maps "status=declined" to "status=rejected" in DB filter', async () => {
        vi.spyOn(User, 'findById').mockResolvedValue(mockAdmin as any);

        let capturedFilter: any = null;
        vi.spyOn(Booking, 'find').mockImplementation(((filter: any) => {
          capturedFilter = filter;
          return {
            populate: vi.fn().mockReturnThis(),
            sort: vi.fn().mockReturnThis(),
            skip: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            lean: vi.fn().mockResolvedValue([]),
          };
        }) as any);

        vi.spyOn(Booking, 'countDocuments').mockResolvedValue(0 as any);

        const res = await request(app)
          .get('/api/admin/bookings?status=declined')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(capturedFilter).not.toBeNull();
        expect(capturedFilter.status).toBe('rejected');
      });

      it('supports server-side search across customer name and coach name', async () => {
        vi.spyOn(User, 'findById').mockResolvedValue(mockAdmin as any);

        const matchedUserId = new mongoose.Types.ObjectId();
        vi.spyOn(User, 'find').mockReturnValue({
          select: vi.fn().mockReturnValue({
            lean: vi.fn().mockResolvedValue([{ _id: matchedUserId }]),
          }),
        } as any);

        let capturedFilter: any = null;
        vi.spyOn(Booking, 'find').mockImplementation(((filter: any) => {
          capturedFilter = filter;
          return {
            populate: vi.fn().mockReturnThis(),
            sort: vi.fn().mockReturnThis(),
            skip: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            lean: vi.fn().mockResolvedValue([]),
          };
        }) as any);

        vi.spyOn(Booking, 'countDocuments').mockResolvedValue(0 as any);

        const res = await request(app)
          .get('/api/admin/bookings?search=Elena')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(capturedFilter).not.toBeNull();
        expect(capturedFilter.$and).toBeDefined();
      });
    });

    describe('GET /api/admin/bookings/:id (Phase 3)', () => {
      it('rejects unauthenticated requests with HTTP 401', async () => {
        const res = await request(app).get(`/api/admin/bookings/${new mongoose.Types.ObjectId()}`);
        expect(res.status).toBe(401);
      });

      it('rejects invalid booking ObjectId with HTTP 400', async () => {
        vi.spyOn(User, 'findById').mockResolvedValue(mockAdmin as any);

        const res = await request(app)
          .get('/api/admin/bookings/not-an-id')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Invalid booking ID format');
      });

      it('returns HTTP 404 when booking does not exist', async () => {
        vi.spyOn(User, 'findById').mockResolvedValue(mockAdmin as any);

        vi.spyOn(Booking, 'findById').mockReturnValue({
          populate: vi.fn().mockReturnThis(),
          lean: vi.fn().mockResolvedValue(null),
        } as any);

        const res = await request(app)
          .get(`/api/admin/bookings/${new mongoose.Types.ObjectId()}`)
          .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(404);
        expect(res.body.error).toContain('Booking not found');
      });

      it('returns comprehensive operational booking details including cancellation metadata and coach profile', async () => {
        vi.spyOn(User, 'findById').mockResolvedValue(mockAdmin as any);

        const bookingId = new mongoose.Types.ObjectId();
        const customerId = new mongoose.Types.ObjectId();
        const coachId = new mongoose.Types.ObjectId();

        const mockBooking = {
          _id: bookingId,
          customerId: {
            _id: customerId,
            name: 'Parent User',
            email: 'parent@example.com',
            role: 'parent',
            isActive: true,
            createdAt: new Date(),
          },
          coachId: {
            _id: coachId,
            name: 'Coach Elena',
            email: 'elena@coach.test',
            isActive: true,
            createdAt: new Date(),
          },
          sport: 'kickboxing',
          date: '2026-11-20',
          startTime: '14:00',
          endTime: '15:30',
          startMinutes: 840,
          endMinutes: 930,
          durationMinutes: 90,
          venueType: 'ground',
          trainingAddress: '123 Sports Complex, Ground B',
          customerPhone: '+919876543210',
          status: 'cancelled',
          paymentStatus: 'unpaid',
          hourlyRateSnapshot: 1800,
          cancellationReason: 'Athlete sustained mild ankle sprain during warm-up.',
          cancelledBy: 'customer',
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        vi.spyOn(Booking, 'findById').mockReturnValue({
          populate: vi.fn().mockReturnThis(),
          lean: vi.fn().mockResolvedValue(mockBooking),
        } as any);

        vi.spyOn(CoachProfile, 'findOne').mockReturnValue({
          select: vi.fn().mockReturnValue({
            lean: vi.fn().mockResolvedValue({
              disciplines: ['kickboxing', 'boxing'],
              specialties: ['Agility', 'Sparring'],
              hourlyRate: 1800,
              bio: 'Former national champion and certified coach.',
              locations: ['Central Sports Complex'],
            }),
          }),
        } as any);

        const res = await request(app)
          .get(`/api/admin/bookings/${bookingId}`)
          .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.booking._id).toBe(bookingId.toString());
        expect(res.body.booking.sport).toBe('kickboxing');
        expect(res.body.booking.customer.name).toBe('Parent User');
        expect(res.body.booking.customer.customerPhone).toBe('+919876543210');
        expect(res.body.booking.coach.name).toBe('Coach Elena');
        expect(res.body.booking.coach.profile.bio).toContain('Former national champion');
        expect(res.body.booking.status).toBe('cancelled');
        expect(res.body.booking.cancelledBy).toBe('customer');
        expect(res.body.booking.cancellationReason).toContain('mild ankle sprain');
        expect(res.body.booking.trainingAddress).toBe('123 Sports Complex, Ground B');
      });
    });

    describe('Reports & Analytics API (Phase 4)', () => {
      describe('GET /api/admin/reports/analytics', () => {
        it('rejects unauthenticated requests with HTTP 401', async () => {
          const res = await request(app).get('/api/admin/reports/analytics');
          expect(res.status).toBe(401);
        });

        it('rejects non-admin role users with HTTP 403', async () => {
          const coachToken = signToken({
            userId: new mongoose.Types.ObjectId().toString(),
            email: 'coach@test.com',
            role: 'coach',
          });

          vi.spyOn(User, 'findById').mockResolvedValue(
            new User({
              _id: new mongoose.Types.ObjectId(),
              name: 'Coach Sarah',
              email: 'coach@test.com',
              role: 'coach',
              isActive: true,
            }) as any
          );

          const res = await request(app)
            .get('/api/admin/reports/analytics')
            .set('Authorization', `Bearer ${coachToken}`);
          expect(res.status).toBe(403);
        });

        it('rejects invalid range parameter with HTTP 400', async () => {
          vi.spyOn(User, 'findById').mockResolvedValue(mockAdmin as any);

          const res = await request(app)
            .get('/api/admin/reports/analytics?range=invalid_range')
            .set('Authorization', `Bearer ${adminToken}`);
          expect(res.status).toBe(400);
          expect(res.body.error).toContain('Invalid range');
        });

        it('rejects custom range without valid startDate/endDate with HTTP 400', async () => {
          vi.spyOn(User, 'findById').mockResolvedValue(mockAdmin as any);

          const res1 = await request(app)
            .get('/api/admin/reports/analytics?range=custom&startDate=bad-date')
            .set('Authorization', `Bearer ${adminToken}`);
          expect(res1.status).toBe(400);

          const res2 = await request(app)
            .get('/api/admin/reports/analytics?range=custom&startDate=2026-10-01&endDate=bad-date')
            .set('Authorization', `Bearer ${adminToken}`);
          expect(res2.status).toBe(400);
        });

        it('returns comprehensive operational analytics and time series payload', async () => {
          vi.spyOn(User, 'findById').mockResolvedValue(mockAdmin as any);

          // Mock User counts
          vi.spyOn(User, 'countDocuments').mockImplementation(((filter: any) => {
            if (filter?.role === 'coach') return Promise.resolve(15);
            return Promise.resolve(45); // customers
          }) as any);

          // Mock Booking counts
          vi.spyOn(Booking, 'countDocuments').mockImplementation(((filter: any) => {
            if (filter?.status === 'completed') return Promise.resolve(20);
            if (filter?.status === 'pending') return Promise.resolve(8);
            if (filter?.status === 'cancelled') return Promise.resolve(5);
            if (filter?.status === 'rejected') return Promise.resolve(3);
            return Promise.resolve(36); // total
          }) as any);

          // Mock User aggregate
          vi.spyOn(User, 'aggregate').mockResolvedValue([
            { _id: { date: '2026-11-01', role: 'parent' }, count: 3 },
            { _id: { date: '2026-11-01', role: 'coach' }, count: 1 },
          ] as any);

          // Mock Booking aggregate
          vi.spyOn(Booking, 'aggregate').mockImplementation(((pipeline: any[]) => {
            // Check what grouping was requested
            const groupStage = pipeline.find((p) => p.$group);
            if (groupStage?.$group?._id?.status) {
              return Promise.resolve([
                { _id: { date: '2026-11-01', status: 'completed' }, count: 2 },
              ]);
            }
            if (groupStage?.$group?._id?.$ifNull) {
              return Promise.resolve([
                { _id: 'boxing', total: 10, completed: 6, accepted: 2, cancelled: 1, declined: 1 },
                { _id: 'kickboxing', total: 8, completed: 4, accepted: 3, cancelled: 1, declined: 0 },
              ]);
            }
            return Promise.resolve([]);
          }) as any);

          vi.spyOn(Booking, 'distinct').mockResolvedValue(['coach1', 'coach2'] as any);

          vi.spyOn(User, 'find').mockReturnValue({
            select: vi.fn().mockReturnValue({
              lean: vi.fn().mockResolvedValue([]),
            }),
          } as any);

          const res = await request(app)
            .get('/api/admin/reports/analytics?range=last30days')
            .set('Authorization', `Bearer ${adminToken}`);

          expect(res.status).toBe(200);
          expect(res.body.range.type).toBe('last30days');
          expect(res.body.summary.allTime.totalCustomers).toBe(45);
          expect(res.body.summary.allTime.totalCoaches).toBe(15);
          expect(res.body.summary.allTime.totalBookings).toBe(36);
          expect(res.body.userGrowth.timeline).toHaveLength(1);
          expect(res.body.userGrowth.timeline[0].parents).toBe(3);
          expect(res.body.sportsPopularity).toHaveLength(2);
          expect(res.body.sportsPopularity[0].sport).toBe('boxing');
          expect(res.body.financialStatus.isAvailable).toBe(false);
          expect(res.body.financialStatus.notice).toContain('Financial reporting will become available');
          expect(res.body.auditTrailStatus.isAvailable).toBe(false);
        });
      });

      describe('GET /api/admin/reports/export', () => {
        it('rejects unauthenticated requests with HTTP 401', async () => {
          const res = await request(app).get('/api/admin/reports/export?reportType=bookings');
          expect(res.status).toBe(401);
        });

        it('rejects non-admin role users with HTTP 403', async () => {
          const individualToken = signToken({
            userId: new mongoose.Types.ObjectId().toString(),
            email: 'user@test.com',
            role: 'individual',
          });

          vi.spyOn(User, 'findById').mockResolvedValue(
            new User({
              _id: new mongoose.Types.ObjectId(),
              name: 'Indiv User',
              email: 'user@test.com',
              role: 'individual',
              isActive: true,
            }) as any
          );

          const res = await request(app)
            .get('/api/admin/reports/export?reportType=bookings')
            .set('Authorization', `Bearer ${individualToken}`);
          expect(res.status).toBe(403);
        });

        it('rejects invalid reportType with HTTP 400', async () => {
          vi.spyOn(User, 'findById').mockResolvedValue(mockAdmin as any);

          const res = await request(app)
            .get('/api/admin/reports/export?reportType=unknown')
            .set('Authorization', `Bearer ${adminToken}`);
          expect(res.status).toBe(400);
          expect(res.body.error).toContain('Invalid reportType');
        });

        it('generates sanitized CSV for bookings report with formula-injection prevention', async () => {
          vi.spyOn(User, 'findById').mockResolvedValue(mockAdmin as any);

          const mockBookings = [
            {
              _id: new mongoose.Types.ObjectId(),
              sport: 'boxing',
              date: '2026-11-20',
              startTime: '10:00',
              endTime: '11:00',
              durationMinutes: 60,
              venueType: 'coach_home',
              status: 'accepted',
              paymentStatus: 'paid',
              customerId: { name: '=cmd|’ /C calc’!A0', role: 'parent' }, // malicious formula string
              coachId: { name: '+123456' }, // starts with +
              createdAt: new Date('2026-11-01T10:00:00Z'),
            },
          ];

          vi.spyOn(Booking, 'find').mockReturnValue({
            populate: vi.fn().mockReturnThis(),
            sort: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            lean: vi.fn().mockResolvedValue(mockBookings),
          } as any);

          const res = await request(app)
            .get('/api/admin/reports/export?reportType=bookings&range=last30days')
            .set('Authorization', `Bearer ${adminToken}`);

          expect(res.status).toBe(200);
          expect(res.headers['content-type']).toContain('text/csv');
          expect(res.headers['content-disposition']).toContain('attachment; filename="athleteconnect-bookings-report-');

          // Verify formula injection protection: starts with ' before = and +
          expect(res.text).toContain("'=cmd|’ /C calc’!A0");
          expect(res.text).toContain("'+123456");
        });

        it('generates CSV for users report successfully', async () => {
          vi.spyOn(User, 'findById').mockImplementation(((id: any) => {
            if (id.toString() === adminId.toString()) return Promise.resolve(mockAdmin);
            return Promise.resolve(null);
          }) as any);

          const mockUsers = [
            {
              _id: new mongoose.Types.ObjectId(),
              name: 'John Customer',
              email: 'john@example.com',
              role: 'parent',
              isActive: true,
              createdAt: new Date('2026-10-15T12:00:00Z'),
            },
          ];

          vi.spyOn(User, 'find').mockReturnValue({
            select: vi.fn().mockReturnThis(),
            sort: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            lean: vi.fn().mockResolvedValue(mockUsers),
          } as any);

          const res = await request(app)
            .get('/api/admin/reports/export?reportType=users')
            .set('Authorization', `Bearer ${adminToken}`);

          expect(res.status).toBe(200);
          expect(res.headers['content-type']).toContain('text/csv');
          expect(res.text).toContain('John Customer');
          expect(res.text).toContain('john@example.com');
          expect(res.text).toContain('parent');
        });
      });
    });
  });
});


