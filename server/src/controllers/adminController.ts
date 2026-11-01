import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { User } from '../models/User';
import { Booking, BOOKING_STATUSES } from '../models/Booking';
import { CoachProfile, calculateProfileCompleteness, COACH_DISCIPLINES } from '../models/CoachProfile';
import { PlatformSettings, DEFAULT_PLATFORM_SETTINGS } from '../models/PlatformSettings';
import { AuditLog, AUDIT_CATEGORIES, AUDIT_EVENT_TYPES } from '../models/AuditLog';
import { config } from '../config/env';
import { comparePassword } from '../utils/password';
import { signToken } from '../utils/jwt';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeRegex(text: string): string {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

/**
 * Admin Login Endpoint
 * POST /api/admin/login
 * Validates credentials, verifies role === 'admin', and issues administrative JWT.
 * Prevents non-admin accounts (parent, individual, coach) from obtaining admin sessions.
 */
export async function adminLogin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  try {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({
        error: 'Invalid request body. JSON payload expected.',
      });
    }

    const { email, password } = req.body;

    if (
      !email ||
      !password ||
      typeof email !== 'string' ||
      typeof password !== 'string'
    ) {
      return res.status(400).json({
        error: 'Email and password are required.',
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      return res.status(400).json({
        error: 'Please provide a valid email address.',
      });
    }

    // Lookup user with passwordHash included for verification
    const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash');
    if (!user) {
      await AuditLog.recordEvent({
        eventType: 'ADMIN_LOGIN',
        action: 'Failed Administrator Sign-In Attempt',
        category: 'AUTH',
        adminEmail: normalizedEmail,
        targetType: 'Session',
        details: { reason: 'User not found' },
        outcome: 'FAILURE',
        ipAddress: (req.headers['x-forwarded-for'] as string) || req.socket?.remoteAddress || '',
      });
      // Constant generic message prevents account enumeration
      return res.status(401).json({
        error: 'Invalid email or password.',
      });
    }

    // Verify account is active
    if (!user.isActive) {
      await AuditLog.recordEvent({
        eventType: 'ADMIN_LOGIN',
        action: 'Deactivated Administrator Sign-In Attempt',
        category: 'AUTH',
        adminId: user._id,
        adminEmail: user.email,
        adminName: user.name,
        targetType: 'Session',
        details: { reason: 'Account deactivated' },
        outcome: 'FAILURE',
        ipAddress: (req.headers['x-forwarded-for'] as string) || req.socket?.remoteAddress || '',
      });
      return res.status(403).json({
        error: 'Account has been deactivated. Please contact support.',
      });
    }

    // Verify password hash
    const isPasswordValid = await comparePassword(password, user.passwordHash);
    if (!isPasswordValid) {
      await AuditLog.recordEvent({
        eventType: 'ADMIN_LOGIN',
        action: 'Failed Administrator Sign-In Attempt',
        category: 'AUTH',
        adminId: user._id,
        adminEmail: user.email,
        adminName: user.name,
        targetType: 'Session',
        details: { reason: 'Invalid password' },
        outcome: 'FAILURE',
        ipAddress: (req.headers['x-forwarded-for'] as string) || req.socket?.remoteAddress || '',
      });
      return res.status(401).json({
        error: 'Invalid email or password.',
      });
    }

    // Enforce strict administrator role check on the backend
    if (user.role !== 'admin') {
      await AuditLog.recordEvent({
        eventType: 'ADMIN_LOGIN',
        action: 'Unauthorized Role Sign-In Attempt',
        category: 'AUTH',
        adminId: user._id,
        adminEmail: user.email,
        adminName: user.name,
        targetType: 'Session',
        details: { reason: 'Non-admin role attempted admin access', role: user.role },
        outcome: 'FAILURE',
        ipAddress: (req.headers['x-forwarded-for'] as string) || req.socket?.remoteAddress || '',
      });
      return res.status(403).json({
        error: 'Access forbidden. Administrator account required.',
      });
    }

    // Issue JWT with explicit admin role
    const token = signToken({
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
    });

    // Record immutable audit event for administrative sign in
    await AuditLog.recordEvent({
      eventType: 'ADMIN_LOGIN',
      action: 'Administrator Sign-In Success',
      category: 'AUTH',
      adminId: user._id,
      adminEmail: user.email,
      adminName: user.name,
      targetType: 'Session',
      details: { role: user.role },
      outcome: 'SUCCESS',
      ipAddress: (req.headers['x-forwarded-for'] as string) || req.socket?.remoteAddress || '',
    });

    return res.status(200).json({
      user: user.toJSON(),
      token,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Admin Identity Verification
 * GET /api/admin/me
 * Returns current authenticated admin profile.
 * Protected by authenticate & requireRole('admin').
 */
export async function getAdminMe(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required.',
      });
    }

    const admin = await User.findById(req.user.id);
    if (!admin || admin.role !== 'admin') {
      return res.status(403).json({
        error: 'Access forbidden. Administrator account required.',
      });
    }

    return res.status(200).json({
      user: admin.toJSON(),
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Admin Dashboard Overview Metrics
 * GET /api/admin/overview
 * Returns verifiable database counts and recent records for platform administration.
 * Efficient aggregation / countDocuments queries without loading entire collections into memory.
 * Protected by authenticate & requireRole('admin').
 */
export async function getAdminOverview(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  try {
    const [
      totalUsers,
      parentUsers,
      individualUsers,
      activeCustomers,
      totalCoaches,
      activeCoaches,
      adminUsers,
      pendingBookings,
      acceptedBookings,
      completedBookings,
      cancelledBookings,
      declinedBookings,
      recentBookings,
      recentCoaches,
    ] = await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ role: 'parent' }),
      User.countDocuments({ role: 'individual' }),
      User.countDocuments({ role: { $in: ['parent', 'individual'] }, isActive: true }),
      User.countDocuments({ role: 'coach' }),
      User.countDocuments({ role: 'coach', isActive: true }),
      User.countDocuments({ role: 'admin' }),
      Booking.countDocuments({ status: 'pending' }),
      Booking.countDocuments({ status: 'accepted' }),
      Booking.countDocuments({ status: 'completed' }),
      Booking.countDocuments({ status: 'cancelled' }),
      Booking.countDocuments({ status: 'rejected' }),
      Booking.find()
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('customerId', 'name email role')
        .populate('coachId', 'name email')
        .lean(),
      User.find({ role: 'coach' })
        .sort({ createdAt: -1 })
        .limit(10)
        .select('name email isActive createdAt')
        .lean(),
    ]);

    const customersJoined = parentUsers + individualUsers;
    const coachesJoined = totalCoaches;
    const cancelledAndDeclinedBookings = cancelledBookings + declinedBookings;
    const totalBookings =
      pendingBookings +
      acceptedBookings +
      completedBookings +
      cancelledAndDeclinedBookings;

    return res.status(200).json({
      metrics: {
        users: {
          total: totalUsers,
          parents: parentUsers,
          individuals: individualUsers,
          customersJoined,
          activeCustomers,
          coaches: totalCoaches,
          coachesJoined,
          activeCoaches,
          admins: adminUsers,
        },
        bookings: {
          total: totalBookings,
          pending: pendingBookings,
          accepted: acceptedBookings,
          completed: completedBookings,
          cancelled: cancelledBookings,
          declined: declinedBookings,
          cancelledAndDeclined: cancelledAndDeclinedBookings,
        },
      },
      recentBookings: recentBookings.map((b) => ({
        _id: b._id.toString(),
        sport: b.sport,
        date: b.date,
        startTime: b.startTime,
        endTime: b.endTime,
        venueType: b.venueType,
        status: b.status,
        createdAt: b.createdAt,
        customer: b.customerId
          ? {
              id: (b.customerId as any)._id?.toString(),
              name: (b.customerId as any).name,
              email: (b.customerId as any).email,
              role: (b.customerId as any).role,
            }
          : null,
        coach: b.coachId
          ? {
              id: (b.coachId as any)._id?.toString(),
              name: (b.coachId as any).name,
              email: (b.coachId as any).email,
            }
          : null,
      })),
      recentCoaches: recentCoaches.map((c) => ({
        _id: c._id.toString(),
        name: c.name,
        email: c.email,
        isActive: c.isActive,
        createdAt: c.createdAt,
      })),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Users Management: List Customers (Parents & Individuals)
 * GET /api/admin/users
 * Supports pagination, search by name/email, and filtering by role/status.
 * Protected by authenticate & requireRole('admin').
 */
export async function getAdminUsers(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit || '10'), 10) || 10));
    const skip = (page - 1) * limit;

    const roleParam = typeof req.query.role === 'string' ? req.query.role.trim().toLowerCase() : 'all';
    const statusParam = typeof req.query.status === 'string' ? req.query.status.trim().toLowerCase() : 'all';
    const searchParam = typeof req.query.search === 'string' ? req.query.search.trim() : '';

    const filter: any = {};

    // Filter by customer roles (parent / individual)
    if (roleParam === 'parent' || roleParam === 'individual') {
      filter.role = roleParam;
    } else {
      filter.role = { $in: ['parent', 'individual'] };
    }

    // Filter by status
    if (statusParam === 'active') {
      filter.isActive = true;
    } else if (statusParam === 'inactive') {
      filter.isActive = false;
    }

    // Filter by search query (name or email)
    if (searchParam) {
      const escaped = escapeRegex(searchParam);
      filter.$or = [
        { name: { $regex: escaped, $options: 'i' } },
        { email: { $regex: escaped, $options: 'i' } },
      ];
    }

    const [users, total, totalCustomers, parentCount, individualCount, activeCount, inactiveCount] =
      await Promise.all([
        User.find(filter)
          .select('-passwordHash -__v')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        User.countDocuments(filter),
        User.countDocuments({ role: { $in: ['parent', 'individual'] } }),
        User.countDocuments({ role: 'parent' }),
        User.countDocuments({ role: 'individual' }),
        User.countDocuments({ role: { $in: ['parent', 'individual'] }, isActive: true }),
        User.countDocuments({ role: { $in: ['parent', 'individual'] }, isActive: false }),
      ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return res.status(200).json({
      users: users.map((u) => ({
        _id: u._id.toString(),
        name: u.name,
        email: u.email,
        role: u.role,
        isActive: u.isActive,
        photoFileId: u.photoFileId ? u.photoFileId.toString() : null,
        photoUpdatedAt: u.photoUpdatedAt,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
      summary: {
        totalCustomers,
        parentCount,
        individualCount,
        activeCount,
        inactiveCount,
      },
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Users Management: Get Customer Detail
 * GET /api/admin/users/:id
 * Protected by authenticate & requireRole('admin').
 */
export async function getAdminUserDetail(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  try {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        error: 'Invalid user ID format.',
      });
    }

    const user = await User.findById(id).select('-passwordHash -__v');
    if (!user) {
      return res.status(404).json({
        error: 'User account not found.',
      });
    }

    // Only allow customer accounts via this endpoint
    if (user.role !== 'parent' && user.role !== 'individual') {
      return res.status(404).json({
        error: 'Customer account not found.',
      });
    }

    const bookingCount = await Booking.countDocuments({ customerId: user._id });

    return res.status(200).json({
      user: {
        _id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        photoFileId: user.photoFileId ? user.photoFileId.toString() : null,
        photoUpdatedAt: user.photoUpdatedAt,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      bookingCount,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Account Activation Management
 * PATCH /api/admin/users/:id/status
 * Activates or deactivates a customer or coach account.
 * Protected by authenticate & requireRole('admin').
 */
export async function updateAdminUserStatus(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  try {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        error: 'Invalid user ID format.',
      });
    }

    if (!req.body || typeof req.body.isActive !== 'boolean') {
      return res.status(400).json({
        error: 'Request body must contain boolean "isActive" field.',
      });
    }

    const targetUser = await User.findById(id);
    if (!targetUser) {
      return res.status(404).json({
        error: 'User account not found.',
      });
    }

    // Protection 1: Prevent altering any administrator account through customer/coach management
    if (targetUser.role === 'admin') {
      return res.status(403).json({
        error: 'Action forbidden. Administrator accounts cannot be modified through this interface.',
      });
    }

    // Protection 2: Prevent the authenticated admin from modifying their own account
    if (req.user && targetUser._id.toString() === req.user.id) {
      return res.status(400).json({
        error: 'You cannot alter the status of your own administrator account.',
      });
    }

    targetUser.isActive = req.body.isActive;
    await targetUser.save();

    // Record immutable audit event for account status mutation
    await AuditLog.recordEvent({
      eventType: targetUser.role === 'coach' ? 'COACH_STATUS_CHANGE' : 'USER_STATUS_CHANGE',
      action: `${targetUser.isActive ? 'Activated' : 'Deactivated'} ${targetUser.role === 'coach' ? 'Coach' : 'Customer'} Account`,
      category: 'USER_MANAGEMENT',
      adminId: (req.user as any)?._id || (req.user as any)?.id,
      adminEmail: (req.user as any)?.email || 'admin@athleteconnect.test',
      adminName: (req.user as any)?.name || 'Administrator',
      targetType: targetUser.role === 'coach' ? 'Coach' : 'User',
      targetId: targetUser._id.toString(),
      details: {
        targetName: targetUser.name,
        targetEmail: targetUser.email,
        targetRole: targetUser.role,
        newStatus: targetUser.isActive,
      },
      outcome: 'SUCCESS',
      ipAddress: (req.headers['x-forwarded-for'] as string) || req.socket?.remoteAddress || '',
    });

    return res.status(200).json({
      user: {
        _id: targetUser._id.toString(),
        name: targetUser.name,
        email: targetUser.email,
        role: targetUser.role,
        isActive: targetUser.isActive,
        createdAt: targetUser.createdAt,
        updatedAt: targetUser.updatedAt,
      },
      message: `Account for ${targetUser.name} has been ${targetUser.isActive ? 'activated' : 'deactivated'} successfully.`,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Coaches Management: List Coaches
 * GET /api/admin/coaches
 * Supports pagination, search by name/email, and filtering by status/discipline.
 * Protected by authenticate & requireRole('admin').
 */
export async function getAdminCoaches(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit || '10'), 10) || 10));
    const skip = (page - 1) * limit;

    const statusParam = typeof req.query.status === 'string' ? req.query.status.trim().toLowerCase() : 'all';
    const disciplineParam = typeof req.query.discipline === 'string' ? req.query.discipline.trim().toLowerCase() : 'all';
    const searchParam = typeof req.query.search === 'string' ? req.query.search.trim() : '';

    const filter: any = { role: 'coach' };

    if (statusParam === 'active') {
      filter.isActive = true;
    } else if (statusParam === 'inactive') {
      filter.isActive = false;
    }

    if (searchParam) {
      const escaped = escapeRegex(searchParam);
      filter.$or = [
        { name: { $regex: escaped, $options: 'i' } },
        { email: { $regex: escaped, $options: 'i' } },
      ];
    }

    // Filter by sports discipline (boxing, wushu, kickboxing)
    if (disciplineParam && disciplineParam !== 'all') {
      const matchingProfiles = await CoachProfile.find({
        disciplines: disciplineParam,
      })
        .select('userId')
        .lean();
      const matchingUserIds = matchingProfiles.map((p) => p.userId);
      filter._id = { $in: matchingUserIds };
    }

    const [coaches, total, totalCoaches, activeCoaches, inactiveCoaches] =
      await Promise.all([
        User.find(filter)
          .select('-passwordHash -__v')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        User.countDocuments(filter),
        User.countDocuments({ role: 'coach' }),
        User.countDocuments({ role: 'coach', isActive: true }),
        User.countDocuments({ role: 'coach', isActive: false }),
      ]);

    // Fetch corresponding profiles for this page of coaches
    const coachIds = coaches.map((c) => c._id);
    const profiles = await CoachProfile.find({ userId: { $in: coachIds } }).lean();
    const profileMap = new Map<string, any>();
    for (const p of profiles) {
      profileMap.set(p.userId.toString(), p);
    }

    const totalPages = Math.ceil(total / limit) || 1;

    return res.status(200).json({
      coaches: coaches.map((coach) => {
        const idStr = coach._id.toString();
        const profile = profileMap.get(idStr) || null;
        return {
          _id: idStr,
          name: coach.name,
          email: coach.email,
          role: coach.role,
          isActive: coach.isActive,
          photoFileId: coach.photoFileId ? coach.photoFileId.toString() : null,
          photoUpdatedAt: coach.photoUpdatedAt,
          createdAt: coach.createdAt,
          updatedAt: coach.updatedAt,
          profile: profile
            ? {
                bio: profile.bio || '',
                disciplines: profile.disciplines || [],
                specialties: profile.specialties || [],
                sessionFormats: profile.sessionFormats || [],
                venueTypes: profile.venueTypes || [],
                hourlyRate: profile.hourlyRate,
                currency: profile.currency || 'INR',
                locations: profile.locations || [],
                isPublished: !!profile.isPublished,
                isComplete: calculateProfileCompleteness(profile),
              }
            : null,
        };
      }),
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
      summary: {
        totalCoaches,
        activeCoaches,
        inactiveCoaches,
      },
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Coaches Management: Get Coach Detail
 * GET /api/admin/coaches/:id
 * Protected by authenticate & requireRole('admin').
 */
export async function getAdminCoachDetail(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  try {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        error: 'Invalid coach ID format.',
      });
    }

    const coach = await User.findById(id).select('-passwordHash -__v');
    if (!coach || coach.role !== 'coach') {
      return res.status(404).json({
        error: 'Coach account not found.',
      });
    }

    const profile = await CoachProfile.findOne({ userId: coach._id }).lean();
    const bookingCount = await Booking.countDocuments({ coachId: coach._id });

    return res.status(200).json({
      coach: {
        _id: coach._id.toString(),
        name: coach.name,
        email: coach.email,
        role: coach.role,
        isActive: coach.isActive,
        photoFileId: coach.photoFileId ? coach.photoFileId.toString() : null,
        photoUpdatedAt: coach.photoUpdatedAt,
        createdAt: coach.createdAt,
        updatedAt: coach.updatedAt,
      },
      profile: profile
        ? {
            bio: profile.bio || '',
            disciplines: profile.disciplines || [],
            specialties: profile.specialties || [],
            sessionFormats: profile.sessionFormats || [],
            venueTypes: profile.venueTypes || [],
            hourlyRate: profile.hourlyRate,
            currency: profile.currency || 'INR',
            locations: profile.locations || [],
            isPublished: !!profile.isPublished,
            isComplete: calculateProfileCompleteness(profile),
            createdAt: profile.createdAt,
            updatedAt: profile.updatedAt,
          }
        : null,
      bookingCount,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Bookings Management: List Bookings
 * GET /api/admin/bookings
 * Supports pagination, search (customer name, coach name, booking ID, sport),
 * filtering by status, sport, date range (fromDate, toDate), customerId, coachId.
 * Protected by authenticate & requireRole('admin').
 */
export async function getAdminBookings(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit || '10'), 10) || 10));
    const skip = (page - 1) * limit;

    const statusParam = typeof req.query.status === 'string' ? req.query.status.trim().toLowerCase() : 'all';
    const sportParam = typeof req.query.sport === 'string' ? req.query.sport.trim().toLowerCase() : 'all';
    const searchParam = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const fromDateParam = typeof req.query.fromDate === 'string' ? req.query.fromDate.trim() : '';
    const toDateParam = typeof req.query.toDate === 'string' ? req.query.toDate.trim() : '';
    const customerIdParam = typeof req.query.customerId === 'string' ? req.query.customerId.trim() : '';
    const coachIdParam = typeof req.query.coachId === 'string' ? req.query.coachId.trim() : '';

    const filter: any = {};

    // 1. Status Filter
    if (statusParam && statusParam !== 'all') {
      if (statusParam === 'declined') {
        filter.status = 'rejected';
      } else if (BOOKING_STATUSES.includes(statusParam as any)) {
        filter.status = statusParam;
      } else {
        return res.status(400).json({
          error: `Invalid status "${statusParam}". Allowed statuses are: all, pending, accepted, completed, cancelled, declined (rejected).`,
        });
      }
    }

    // 2. Sport Filter
    if (sportParam && sportParam !== 'all') {
      if (COACH_DISCIPLINES.includes(sportParam as any)) {
        filter.sport = sportParam;
      } else {
        return res.status(400).json({
          error: `Invalid sport "${sportParam}". Allowed sports are: all, boxing, wushu, kickboxing.`,
        });
      }
    }

    // 3. Date Range Filter (date format YYYY-MM-DD)
    const DATE_REGEX = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
    if (fromDateParam) {
      if (!DATE_REGEX.test(fromDateParam)) {
        return res.status(400).json({
          error: `Invalid fromDate "${fromDateParam}". Format must be YYYY-MM-DD.`,
        });
      }
      filter.date = filter.date || {};
      filter.date.$gte = fromDateParam;
    }
    if (toDateParam) {
      if (!DATE_REGEX.test(toDateParam)) {
        return res.status(400).json({
          error: `Invalid toDate "${toDateParam}". Format must be YYYY-MM-DD.`,
        });
      }
      filter.date = filter.date || {};
      filter.date.$lte = toDateParam;
    }

    // 4. Customer / Coach ID Filter
    if (customerIdParam) {
      if (!mongoose.Types.ObjectId.isValid(customerIdParam)) {
        return res.status(400).json({ error: 'Invalid customerId format.' });
      }
      filter.customerId = new mongoose.Types.ObjectId(customerIdParam);
    }
    if (coachIdParam) {
      if (!mongoose.Types.ObjectId.isValid(coachIdParam)) {
        return res.status(400).json({ error: 'Invalid coachId format.' });
      }
      filter.coachId = new mongoose.Types.ObjectId(coachIdParam);
    }

    // 5. Search Filter (by customer name, coach name, booking ID, sport, venueType)
    if (searchParam) {
      const escaped = escapeRegex(searchParam);
      const matchingUsers = await User.find({
        $or: [
          { name: { $regex: escaped, $options: 'i' } },
          { email: { $regex: escaped, $options: 'i' } },
        ],
      })
        .select('_id')
        .lean();

      const matchingUserIds = matchingUsers.map((u) => u._id);

      const searchConditions: any[] = [
        { sport: { $regex: escaped, $options: 'i' } },
        { venueType: { $regex: escaped, $options: 'i' } },
      ];

      if (matchingUserIds.length > 0) {
        searchConditions.push(
          { customerId: { $in: matchingUserIds } },
          { coachId: { $in: matchingUserIds } }
        );
      }

      if (/^[0-9a-fA-F]{24}$/.test(searchParam)) {
        searchConditions.push({ _id: new mongoose.Types.ObjectId(searchParam) });
      }

      filter.$and = filter.$and || [];
      filter.$and.push({ $or: searchConditions });
    }

    // Run parallel queries: summary all-time counts + filtered list + filtered count
    const [
      totalAllTime,
      pendingAllTime,
      acceptedAllTime,
      completedAllTime,
      cancelledAllTime,
      declinedAllTime,
      bookings,
      filteredCount,
    ] = await Promise.all([
      Booking.countDocuments({}),
      Booking.countDocuments({ status: 'pending' }),
      Booking.countDocuments({ status: 'accepted' }),
      Booking.countDocuments({ status: 'completed' }),
      Booking.countDocuments({ status: 'cancelled' }),
      Booking.countDocuments({ status: 'rejected' }),
      Booking.find(filter)
        .populate('customerId', 'name email role isActive')
        .populate('coachId', 'name email isActive')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Booking.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(filteredCount / limit) || 1;

    return res.status(200).json({
      bookings: bookings.map((b) => ({
        _id: b._id.toString(),
        sport: b.sport,
        date: b.date,
        startTime: b.startTime,
        endTime: b.endTime,
        durationMinutes: b.durationMinutes,
        venueType: b.venueType,
        status: b.status,
        paymentStatus: b.paymentStatus,
        hourlyRateSnapshot: b.hourlyRateSnapshot,
        rejectionReason: b.rejectionReason,
        cancellationReason: b.cancellationReason,
        cancelledBy: b.cancelledBy,
        createdAt: b.createdAt,
        updatedAt: b.updatedAt,
        customer: b.customerId
          ? {
              id: (b.customerId as any)._id?.toString(),
              name: (b.customerId as any).name,
              email: (b.customerId as any).email,
              role: (b.customerId as any).role,
              isActive: (b.customerId as any).isActive,
            }
          : null,
        coach: b.coachId
          ? {
              id: (b.coachId as any)._id?.toString(),
              name: (b.coachId as any).name,
              email: (b.coachId as any).email,
              isActive: (b.coachId as any).isActive,
            }
          : null,
      })),
      pagination: {
        page,
        limit,
        total: filteredCount,
        totalPages,
      },
      summary: {
        total: totalAllTime,
        pending: pendingAllTime,
        accepted: acceptedAllTime,
        completed: completedAllTime,
        cancelled: cancelledAllTime,
        declined: declinedAllTime,
      },
      filteredCount,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Bookings Management: Fetch single booking details by ID
 * GET /api/admin/bookings/:id
 * Returns complete operational details including customer, coach, session, and cancellation/completion metadata.
 * Protected by authenticate & requireRole('admin').
 */
export async function getAdminBookingDetail(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  try {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        error: 'Invalid booking ID format.',
      });
    }

    const booking = await Booking.findById(id)
      .populate('customerId', 'name email role isActive createdAt photoFileId')
      .populate('coachId', 'name email isActive createdAt photoFileId')
      .lean();

    if (!booking) {
      return res.status(404).json({
        error: 'Booking not found.',
      });
    }

    let coachProfile = null;
    if (booking.coachId) {
      const coachUserId = (booking.coachId as any)._id || booking.coachId;
      coachProfile = await CoachProfile.findOne({ userId: coachUserId })
        .select('disciplines specialties sessionFormats venueTypes hourlyRate locations bio')
        .lean();
    }

    return res.status(200).json({
      booking: {
        _id: booking._id.toString(),
        sport: booking.sport,
        date: booking.date,
        startTime: booking.startTime,
        endTime: booking.endTime,
        startMinutes: booking.startMinutes,
        endMinutes: booking.endMinutes,
        durationMinutes: booking.durationMinutes,
        venueType: booking.venueType,
        trainingAddress: booking.trainingAddress,
        locationCoordinates: booking.locationCoordinates || null,
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        hourlyRateSnapshot: booking.hourlyRateSnapshot,
        rejectionReason: booking.rejectionReason || null,
        cancellationReason: booking.cancellationReason || null,
        cancelledBy: booking.cancelledBy || null,
        createdAt: booking.createdAt,
        updatedAt: booking.updatedAt,
        customer: booking.customerId
          ? {
              id: (booking.customerId as any)._id?.toString(),
              name: (booking.customerId as any).name,
              email: (booking.customerId as any).email,
              role: (booking.customerId as any).role,
              isActive: (booking.customerId as any).isActive,
              customerPhone: (booking as any).customerPhone,
              createdAt: (booking.customerId as any).createdAt,
            }
          : null,
        coach: booking.coachId
          ? {
              id: (booking.coachId as any)._id?.toString(),
              name: (booking.coachId as any).name,
              email: (booking.coachId as any).email,
              isActive: (booking.coachId as any).isActive,
              createdAt: (booking.coachId as any).createdAt,
              profile: coachProfile
                ? {
                    disciplines: coachProfile.disciplines || [],
                    specialties: coachProfile.specialties || [],
                    sessionFormats: coachProfile.sessionFormats || [],
                    venueTypes: coachProfile.venueTypes || [],
                    hourlyRate: coachProfile.hourlyRate,
                    bio: coachProfile.bio,
                    locations: coachProfile.locations || [],
                  }
                : null,
            }
          : null,
      },
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Helper: Parses date range parameters and computes start/end boundary Date objects.
 */
function parseDateRange(
  range: string = 'last30days',
  customStart?: string,
  customEnd?: string
): { start?: Date; end?: Date; label: string } {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  switch (range) {
    case 'today': {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      return { start, end, label: 'Today' };
    }
    case 'last7days': {
      const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      start.setHours(0, 0, 0, 0);
      return { start, end, label: 'Last 7 Days' };
    }
    case 'last30days': {
      const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      start.setHours(0, 0, 0, 0);
      return { start, end, label: 'Last 30 Days' };
    }
    case 'last90days': {
      const start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      start.setHours(0, 0, 0, 0);
      return { start, end, label: 'Last 90 Days' };
    }
    case 'thisMonth': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      return { start, end, label: 'This Month' };
    }
    case 'thisYear': {
      const start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      return { start, end, label: 'This Year' };
    }
    case 'custom': {
      if (customStart && customEnd) {
        const start = new Date(`${customStart}T00:00:00.000Z`);
        const customEndDate = new Date(`${customEnd}T23:59:59.999Z`);
        return { start, end: customEndDate, label: `${customStart} to ${customEnd}` };
      }
      const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { start, end, label: 'Custom' };
    }
    case 'all':
    default: {
      return { label: 'All Time' };
    }
  }
}

/**
 * Helper: Sanitizes a string for CSV cell insertion, preventing spreadsheet formula injection.
 */
function sanitizeCsvValue(val: unknown): string {
  if (val === null || val === undefined) return '""';
  let str = String(val).trim();
  // Formula injection prevention: prefix with ' if starts with trigger characters
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * Reports & Analytics Endpoint
 * GET /api/admin/reports/analytics
 * Computes verifiable aggregations across users and bookings.
 * Protected by authenticate & requireRole('admin').
 */
export async function getAdminAnalytics(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  try {
    const range = (req.query.range as string) || 'last30days';
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const sportFilter = (req.query.sport as string)?.toLowerCase();
    const statusFilter = (req.query.status as string)?.toLowerCase();

    const allowedRanges = ['today', 'last7days', 'last30days', 'last90days', 'thisMonth', 'thisYear', 'custom', 'all'];
    if (!allowedRanges.includes(range)) {
      return res.status(400).json({
        error: `Invalid range "${range}". Allowed ranges are: ${allowedRanges.join(', ')}.`,
      });
    }

    if (range === 'custom') {
      const DATE_REGEX = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
      if (!startDate || !DATE_REGEX.test(startDate)) {
        return res.status(400).json({ error: 'Valid startDate (YYYY-MM-DD) is required for custom range.' });
      }
      if (!endDate || !DATE_REGEX.test(endDate)) {
        return res.status(400).json({ error: 'Valid endDate (YYYY-MM-DD) is required for custom range.' });
      }
    }

    const { start, end, label } = parseDateRange(range, startDate, endDate);

    // Build filters
    const userDateFilter: any = {};
    if (start && end) {
      userDateFilter.createdAt = { $gte: start, $lte: end };
    }

    const bookingFilter: any = {};
    if (start && end) {
      bookingFilter.createdAt = { $gte: start, $lte: end };
    }
    if (sportFilter && sportFilter !== 'all') {
      bookingFilter.sport = sportFilter;
    }
    if (statusFilter && statusFilter !== 'all') {
      bookingFilter.status = statusFilter === 'declined' ? 'rejected' : statusFilter;
    }

    // Run aggregations and counts in parallel
    const [
      totalCustomersAllTime,
      totalCoachesAllTime,
      totalBookingsAllTime,
      completedBookingsAllTime,
      pendingBookingsAllTime,
      cancelledBookingsAllTime,
      declinedBookingsAllTime,
      filteredCustomers,
      filteredCoaches,
      filteredBookings,
      filteredCompleted,
      filteredPending,
      filteredCancelled,
      filteredDeclined,
      userGrowthRaw,
      bookingTrendsRaw,
      sportsAggRaw,
      cancellationAttributionRaw,
      cancellationReasonsRaw,
      rejectionReasonsRaw,
      topCoachesRaw,
      activeCoachesCount,
      coachesWithBookingsCount,
    ] = await Promise.all([
      User.countDocuments({ role: { $in: ['parent', 'individual'] } }),
      User.countDocuments({ role: 'coach' }),
      Booking.countDocuments({}),
      Booking.countDocuments({ status: 'completed' }),
      Booking.countDocuments({ status: 'pending' }),
      Booking.countDocuments({ status: 'cancelled' }),
      Booking.countDocuments({ status: 'rejected' }),

      User.countDocuments({ ...userDateFilter, role: { $in: ['parent', 'individual'] } }),
      User.countDocuments({ ...userDateFilter, role: 'coach' }),
      Booking.countDocuments(bookingFilter),
      Booking.countDocuments({ ...bookingFilter, status: 'completed' }),
      Booking.countDocuments({ ...bookingFilter, status: 'pending' }),
      Booking.countDocuments({ ...bookingFilter, status: 'cancelled' }),
      Booking.countDocuments({ ...bookingFilter, status: 'rejected' }),

      User.aggregate([
        { $match: { ...userDateFilter, role: { $in: ['parent', 'individual', 'coach'] } } },
        {
          $group: {
            _id: {
              date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              role: '$role',
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.date': 1 } },
      ]),

      Booking.aggregate([
        { $match: bookingFilter },
        {
          $group: {
            _id: {
              date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              status: '$status',
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.date': 1 } },
      ]),

      Booking.aggregate([
        { $match: bookingFilter },
        {
          $group: {
            _id: { $ifNull: ['$sport', 'unspecified'] },
            total: { $sum: 1 },
            completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
            accepted: { $sum: { $cond: [{ $eq: ['$status', 'accepted'] }, 1, 0] } },
            cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
            declined: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } },
          },
        },
        { $sort: { total: -1 } },
      ]),

      Booking.aggregate([
        { $match: { ...bookingFilter, status: 'cancelled' } },
        {
          $group: {
            _id: { $ifNull: ['$cancelledBy', 'unspecified'] },
            count: { $sum: 1 },
          },
        },
      ]),

      Booking.aggregate([
        { $match: { ...bookingFilter, status: 'cancelled' } },
        {
          $group: {
            _id: {
              $cond: [
                { $or: [{ $eq: ['$cancellationReason', null] }, { $eq: ['$cancellationReason', ''] }] },
                'No specific reason provided',
                '$cancellationReason',
              ],
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),

      Booking.aggregate([
        { $match: { ...bookingFilter, status: 'rejected' } },
        {
          $group: {
            _id: {
              $cond: [
                { $or: [{ $eq: ['$rejectionReason', null] }, { $eq: ['$rejectionReason', ''] }] },
                'No specific reason provided',
                '$rejectionReason',
              ],
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),

      Booking.aggregate([
        { $match: bookingFilter },
        {
          $group: {
            _id: '$coachId',
            totalBookings: { $sum: 1 },
            completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
            accepted: { $sum: { $cond: [{ $eq: ['$status', 'accepted'] }, 1, 0] } },
            cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
          },
        },
        { $sort: { totalBookings: -1 } },
        { $limit: 10 },
      ]),

      User.countDocuments({ role: 'coach', isActive: true }),
      Booking.distinct('coachId', bookingFilter).then((ids) => ids.length),
    ]);

    // Format User Growth Timeline
    const userGrowthMap = new Map<string, { date: string; parents: number; individuals: number; coaches: number; total: number }>();
    for (const item of userGrowthRaw) {
      const date = item._id.date;
      if (!userGrowthMap.has(date)) {
        userGrowthMap.set(date, { date, parents: 0, individuals: 0, coaches: 0, total: 0 });
      }
      const entry = userGrowthMap.get(date)!;
      if (item._id.role === 'parent') entry.parents += item.count;
      else if (item._id.role === 'individual') entry.individuals += item.count;
      else if (item._id.role === 'coach') entry.coaches += item.count;
      entry.total += item.count;
    }
    const userGrowthTimeline = Array.from(userGrowthMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    // Format Booking Trends Timeline
    const bookingTrendsMap = new Map<string, { date: string; total: number; pending: number; accepted: number; completed: number; cancelled: number; declined: number }>();
    for (const item of bookingTrendsRaw) {
      const date = item._id.date;
      if (!bookingTrendsMap.has(date)) {
        bookingTrendsMap.set(date, { date, total: 0, pending: 0, accepted: 0, completed: 0, cancelled: 0, declined: 0 });
      }
      const entry = bookingTrendsMap.get(date)!;
      entry.total += item.count;
      if (item._id.status === 'pending') entry.pending += item.count;
      else if (item._id.status === 'accepted') entry.accepted += item.count;
      else if (item._id.status === 'completed') entry.completed += item.count;
      else if (item._id.status === 'cancelled') entry.cancelled += item.count;
      else if (item._id.status === 'rejected') entry.declined += item.count;
    }
    const bookingTrendsTimeline = Array.from(bookingTrendsMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    // Populate coach names for top coaches
    const coachIds = topCoachesRaw.map((tc) => tc._id).filter(Boolean);
    let coachesInfo: any[] = [];
    if (coachIds.length > 0) {
      coachesInfo = await User.find({ _id: { $in: coachIds } }).select('name email isActive').lean();
    }
    const coachInfoMap = new Map<string, any>(coachesInfo.map((c) => [c._id.toString(), c]));

    const topCoaches = topCoachesRaw.map((tc) => {
      const coach = tc._id ? coachInfoMap.get(tc._id.toString()) : null;
      return {
        coachId: tc._id ? tc._id.toString() : 'unknown',
        name: coach?.name || 'Unknown Coach',
        email: coach?.email || '—',
        isActive: coach ? coach.isActive : false,
        totalBookings: tc.totalBookings,
        completedSessions: tc.completed,
        acceptedSessions: tc.accepted,
        cancelledSessions: tc.cancelled,
      };
    });

    // Format cancellation attribution
    let cancelledByCustomer = 0;
    let cancelledByCoach = 0;
    let cancelledUnspecified = 0;
    for (const item of cancellationAttributionRaw) {
      if (item._id === 'customer') cancelledByCustomer += item.count;
      else if (item._id === 'coach') cancelledByCoach += item.count;
      else cancelledUnspecified += item.count;
    }

    return res.status(200).json({
      range: {
        type: range,
        label,
        startDate: start ? start.toISOString().split('T')[0] : null,
        endDate: end ? end.toISOString().split('T')[0] : null,
      },
      summary: {
        allTime: {
          totalCustomers: totalCustomersAllTime,
          totalCoaches: totalCoachesAllTime,
          totalBookings: totalBookingsAllTime,
          completedBookings: completedBookingsAllTime,
          pendingBookings: pendingBookingsAllTime,
          cancelledBookings: cancelledBookingsAllTime,
          declinedBookings: declinedBookingsAllTime,
        },
        filtered: {
          totalCustomers: filteredCustomers,
          totalCoaches: filteredCoaches,
          totalBookings: filteredBookings,
          completedBookings: filteredCompleted,
          pendingBookings: filteredPending,
          cancelledBookings: filteredCancelled,
          declinedBookings: filteredDeclined,
        },
      },
      userGrowth: {
        timeline: userGrowthTimeline,
        totalInPeriod: filteredCustomers + filteredCoaches,
      },
      bookingTrends: {
        timeline: bookingTrendsTimeline,
        distribution: {
          total: filteredBookings,
          pending: filteredPending,
          accepted: Math.max(0, filteredBookings - filteredPending - filteredCompleted - filteredCancelled - filteredDeclined),
          completed: filteredCompleted,
          cancelled: filteredCancelled,
          declined: filteredDeclined,
        },
      },
      sportsPopularity: sportsAggRaw.map((s) => ({
        sport: s._id,
        total: s.total,
        completed: s.completed,
        accepted: s.accepted,
        cancelled: s.cancelled,
        declined: s.declined,
        percentage: filteredBookings > 0 ? Math.round((s.total / filteredBookings) * 100) : 0,
      })),
      coachActivity: {
        totalRegistered: totalCoachesAllTime,
        activeCoaches: activeCoachesCount,
        coachesWithBookings: coachesWithBookingsCount,
        topCoaches,
      },
      cancellationAnalysis: {
        totalCancelled: filteredCancelled,
        totalDeclined: filteredDeclined,
        attribution: {
          customer: cancelledByCustomer,
          coach: cancelledByCoach,
          unspecified: cancelledUnspecified,
        },
        reasons: cancellationReasonsRaw.map((r) => ({ reason: r._id, count: r.count })),
        rejectionReasons: rejectionReasonsRaw.map((r) => ({ reason: r._id, count: r.count })),
      },
      financialStatus: {
        isAvailable: false,
        notice: 'Financial reporting will become available after verified payment transaction integration.',
      },
      auditTrailStatus: {
        isAvailable: false,
        notice: 'Platform governance and administrative audit logging will be activated in Admin Phase 5.',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Export Operational Report (CSV)
 * GET /api/admin/reports/export
 * Generates verified CSV export with formula injection prevention.
 * Protected by authenticate & requireRole('admin').
 */
export async function exportAdminReport(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  try {
    const reportType = (req.query.reportType as string) || 'bookings';
    const range = (req.query.range as string) || 'last30days';
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const sportFilter = (req.query.sport as string)?.toLowerCase();
    const statusFilter = (req.query.status as string)?.toLowerCase();

    const allowedTypes = ['bookings', 'users', 'sports', 'cancellations'];
    if (!allowedTypes.includes(reportType)) {
      return res.status(400).json({
        error: `Invalid reportType "${reportType}". Allowed types: ${allowedTypes.join(', ')}.`,
      });
    }

    const { start, end } = parseDateRange(range, startDate, endDate);
    const nowStr = new Date().toISOString().split('T')[0];
    let csvContent = '';

    if (reportType === 'bookings') {
      const filter: any = {};
      if (start && end) filter.createdAt = { $gte: start, $lte: end };
      if (sportFilter && sportFilter !== 'all') filter.sport = sportFilter;
      if (statusFilter && statusFilter !== 'all') {
        filter.status = statusFilter === 'declined' ? 'rejected' : statusFilter;
      }

      const bookings = await Booking.find(filter)
        .populate('customerId', 'name email role')
        .populate('coachId', 'name email')
        .sort({ createdAt: -1 })
        .limit(1000)
        .lean();

      const headers = ['Booking ID', 'Sport', 'Date', 'Start Time', 'End Time', 'Duration (mins)', 'Venue Type', 'Status', 'Payment Status', 'Customer Name', 'Customer Role', 'Coach Name', 'Created At'];
      const rows = bookings.map((b) => [
        b._id.toString(),
        b.sport,
        b.date,
        b.startTime,
        b.endTime,
        b.durationMinutes,
        b.venueType,
        b.status === 'rejected' ? 'declined' : b.status,
        b.paymentStatus,
        (b.customerId as any)?.name || 'Unknown',
        (b.customerId as any)?.role || '—',
        (b.coachId as any)?.name || 'Unknown',
        b.createdAt ? new Date(b.createdAt).toISOString() : '—',
      ]);

      csvContent = [
        headers.map(sanitizeCsvValue).join(','),
        ...rows.map((row) => row.map(sanitizeCsvValue).join(',')),
      ].join('\r\n');
    } else if (reportType === 'users') {
      const filter: any = { role: { $in: ['parent', 'individual', 'coach'] } };
      if (start && end) filter.createdAt = { $gte: start, $lte: end };

      const users = await User.find(filter)
        .select('name email role isActive createdAt')
        .sort({ createdAt: -1 })
        .limit(1000)
        .lean();

      const headers = ['User ID', 'Name', 'Email', 'Role', 'Status', 'Created At'];
      const rows = users.map((u) => [
        u._id.toString(),
        u.name,
        u.email,
        u.role,
        u.isActive ? 'Active' : 'Inactive',
        u.createdAt ? new Date(u.createdAt).toISOString() : '—',
      ]);

      csvContent = [
        headers.map(sanitizeCsvValue).join(','),
        ...rows.map((row) => row.map(sanitizeCsvValue).join(',')),
      ].join('\r\n');
    } else if (reportType === 'sports') {
      const filter: any = {};
      if (start && end) filter.createdAt = { $gte: start, $lte: end };

      const sportsAgg = await Booking.aggregate([
        { $match: filter },
        {
          $group: {
            _id: { $ifNull: ['$sport', 'unspecified'] },
            total: { $sum: 1 },
            completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
            accepted: { $sum: { $cond: [{ $eq: ['$status', 'accepted'] }, 1, 0] } },
            cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
            declined: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } },
          },
        },
        { $sort: { total: -1 } },
      ]);

      const headers = ['Sport', 'Total Bookings', 'Completed Sessions', 'Accepted Sessions', 'Cancelled Sessions', 'Declined Requests'];
      const rows = sportsAgg.map((s) => [
        s._id,
        s.total,
        s.completed,
        s.accepted,
        s.cancelled,
        s.declined,
      ]);

      csvContent = [
        headers.map(sanitizeCsvValue).join(','),
        ...rows.map((row) => row.map(sanitizeCsvValue).join(',')),
      ].join('\r\n');
    } else if (reportType === 'cancellations') {
      const filter: any = { status: { $in: ['cancelled', 'rejected'] } };
      if (start && end) filter.createdAt = { $gte: start, $lte: end };

      const records = await Booking.find(filter)
        .populate('customerId', 'name email')
        .populate('coachId', 'name email')
        .sort({ createdAt: -1 })
        .limit(1000)
        .lean();

      const headers = ['Booking ID', 'Sport', 'Date', 'Status', 'Cancelled By', 'Reason', 'Customer Name', 'Coach Name', 'Updated At'];
      const rows = records.map((b) => [
        b._id.toString(),
        b.sport,
        b.date,
        b.status === 'rejected' ? 'declined' : b.status,
        b.cancelledBy || (b.status === 'rejected' ? 'coach' : 'unspecified'),
        b.status === 'rejected' ? b.rejectionReason || '—' : b.cancellationReason || '—',
        (b.customerId as any)?.name || 'Unknown',
        (b.coachId as any)?.name || 'Unknown',
        b.updatedAt ? new Date(b.updatedAt).toISOString() : '—',
      ]);

      csvContent = [
        headers.map(sanitizeCsvValue).join(','),
        ...rows.map((row) => row.map(sanitizeCsvValue).join(',')),
      ].join('\r\n');
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="athleteconnect-${reportType}-report-${nowStr}.csv"`
    );
    return res.status(200).send(csvContent);
  } catch (error) {
    return next(error);
  }
}

/**
 * Platform Settings & Governance: Get Settings & Platform Information
 * GET /api/admin/settings
 * Protected by authenticate & requireRole('admin').
 */
export async function getAdminSettings(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  try {
    let settings = await PlatformSettings.findOne();
    if (!settings) {
      settings = await PlatformSettings.create(DEFAULT_PLATFORM_SETTINGS);
    }

    const isDbConnected = mongoose.connection.readyState === 1;

    const platformInfo = {
      name: settings.platformName,
      environment: config.NODE_ENV,
      apiVersion: '1.0.0',
      backendStatus: 'connected',
      databaseStatus: isDbConnected ? 'connected' : 'disconnected',
      serverUptimeSeconds: Math.round(process.uptime()),
    };

    const features = {
      customerRegistration: {
        status: 'Available',
        label: 'Customer Registration (Parent / Individual)',
        description: 'Self-service account creation for parents and individual trainees.',
      },
      coachRegistration: {
        status: 'Available',
        label: 'Coach Onboarding & Compliance',
        description: 'Coach profile setup, discipline selection, and verification workflows.',
      },
      coachDiscovery: {
        status: 'Available',
        label: 'Coach Discovery & Discipline Filtering',
        description: 'Customer search by sport, location, and session format.',
      },
      trainingBookings: {
        status: 'Available',
        label: 'Training Session Bookings & Scheduling',
        description: 'End-to-end booking lifecycle, scheduling, acceptance, and cancellations.',
      },
      profilePhotos: {
        status: 'Available',
        label: 'Profile Photo Uploads (GridFS Storage)',
        description: 'Secure, validated binary photo uploads stored in MongoDB GridFS.',
      },
      reporting: {
        status: 'Available',
        label: 'Operational Analytics & CSV Reports',
        description: 'Time-series booking throughput, registration velocity, and exportable datasets.',
      },
      paymentIntegration: {
        status: 'Planned',
        label: 'Payment Gateway Integration (Stripe Planned)',
        description: 'Financial transactions will be integrated following formal merchant gateway compliance (Stripe integration planned).',
      },
    };

    return res.status(200).json({
      settings: {
        platformName: settings.platformName,
        supportEmail: settings.supportEmail,
        supportPhone: settings.supportPhone || '',
        supportedDisciplines: settings.supportedDisciplines,
        cancellationWindowHours: settings.cancellationWindowHours,
        maxAdvanceBookingDays: settings.maxAdvanceBookingDays,
        defaultSessionDurationMinutes: settings.defaultSessionDurationMinutes,
        maintenanceMode: settings.maintenanceMode,
        maintenanceNotice: settings.maintenanceNotice || '',
        updatedAt: settings.updatedAt,
        updatedByEmail: settings.updatedByEmail || null,
      },
      platformInfo,
      features,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return next(error);
  }
}

const ALLOWED_SETTINGS_FIELDS = [
  'platformName',
  'supportEmail',
  'supportPhone',
  'supportedDisciplines',
  'cancellationWindowHours',
  'maxAdvanceBookingDays',
  'defaultSessionDurationMinutes',
  'maintenanceMode',
  'maintenanceNotice',
] as const;

/**
 * Platform Settings & Governance: Update Configuration
 * PATCH /api/admin/settings
 * Protected by authenticate & requireRole('admin').
 * Validates permitted fields, rejects unknown or privileged fields, persists to MongoDB, and logs audit record.
 */
export async function updateAdminSettings(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  try {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({
        error: 'Invalid request body. JSON object expected.',
      });
    }

    const payloadKeys = Object.keys(req.body);
    if (payloadKeys.length === 0) {
      return res.status(400).json({
        error: 'Request body must contain at least one configuration field to update.',
      });
    }

    // Protection: Disallow unknown or privileged fields (e.g. JWT_SECRET, MONGODB_URI, role, password, etc.)
    for (const key of payloadKeys) {
      if (!ALLOWED_SETTINGS_FIELDS.includes(key as any)) {
        return res.status(400).json({
          error: `Unknown or disallowed configuration field: "${key}". Privileged or infrastructure variables cannot be modified.`,
        });
      }
    }

    const {
      platformName,
      supportEmail,
      supportPhone,
      supportedDisciplines,
      cancellationWindowHours,
      maxAdvanceBookingDays,
      defaultSessionDurationMinutes,
      maintenanceMode,
      maintenanceNotice,
    } = req.body;

    // Field validations
    if (platformName !== undefined) {
      if (typeof platformName !== 'string' || platformName.trim().length < 2 || platformName.trim().length > 100) {
        return res.status(400).json({
          error: 'Platform name must be a string between 2 and 100 characters long.',
        });
      }
    }

    if (supportEmail !== undefined) {
      if (typeof supportEmail !== 'string' || !EMAIL_REGEX.test(supportEmail.trim().toLowerCase())) {
        return res.status(400).json({
          error: 'Please provide a valid support email address.',
        });
      }
    }

    if (supportPhone !== undefined) {
      if (typeof supportPhone !== 'string' || supportPhone.trim().length > 50) {
        return res.status(400).json({
          error: 'Support phone must be a string with a maximum of 50 characters.',
        });
      }
    }

    if (supportedDisciplines !== undefined) {
      if (
        !Array.isArray(supportedDisciplines) ||
        supportedDisciplines.length === 0 ||
        !supportedDisciplines.every((d) => typeof d === 'string' && COACH_DISCIPLINES.includes(d as any))
      ) {
        return res.status(400).json({
          error: `Supported disciplines must be a non-empty array containing allowed sports: ${COACH_DISCIPLINES.join(', ')}.`,
        });
      }
    }

    if (cancellationWindowHours !== undefined) {
      const val = Number(cancellationWindowHours);
      if (!Number.isInteger(val) || val < 1 || val > 168) {
        return res.status(400).json({
          error: 'Cancellation window must be an integer between 1 and 168 hours (7 days).',
        });
      }
    }

    if (maxAdvanceBookingDays !== undefined) {
      const val = Number(maxAdvanceBookingDays);
      if (!Number.isInteger(val) || val < 1 || val > 90) {
        return res.status(400).json({
          error: 'Maximum advance booking days must be an integer between 1 and 90 days.',
        });
      }
    }

    if (defaultSessionDurationMinutes !== undefined) {
      const val = Number(defaultSessionDurationMinutes);
      if (!Number.isInteger(val) || val < 15 || val > 240) {
        return res.status(400).json({
          error: 'Default session duration must be an integer between 15 and 240 minutes.',
        });
      }
    }

    if (maintenanceMode !== undefined) {
      if (typeof maintenanceMode !== 'boolean') {
        return res.status(400).json({
          error: 'Maintenance mode must be a boolean value.',
        });
      }
    }

    if (maintenanceNotice !== undefined) {
      if (typeof maintenanceNotice !== 'string' || maintenanceNotice.trim().length > 500) {
        return res.status(400).json({
          error: 'Maintenance notice must be a string with a maximum of 500 characters.',
        });
      }
    }

    let settings = await PlatformSettings.findOne();
    if (!settings) {
      settings = new PlatformSettings(DEFAULT_PLATFORM_SETTINGS);
    }

    if (platformName !== undefined) settings.platformName = platformName.trim();
    if (supportEmail !== undefined) settings.supportEmail = supportEmail.trim().toLowerCase();
    if (supportPhone !== undefined) settings.supportPhone = supportPhone.trim();
    if (supportedDisciplines !== undefined) settings.supportedDisciplines = supportedDisciplines;
    if (cancellationWindowHours !== undefined) settings.cancellationWindowHours = Number(cancellationWindowHours);
    if (maxAdvanceBookingDays !== undefined) settings.maxAdvanceBookingDays = Number(maxAdvanceBookingDays);
    if (defaultSessionDurationMinutes !== undefined) settings.defaultSessionDurationMinutes = Number(defaultSessionDurationMinutes);
    if (maintenanceMode !== undefined) settings.maintenanceMode = maintenanceMode;
    if (maintenanceNotice !== undefined) settings.maintenanceNotice = maintenanceNotice.trim();

    settings.updatedBy = (req.user as any)?._id || (req.user as any)?.id;
    settings.updatedByEmail = (req.user as any)?.email || 'admin@athleteconnect.test';

    await settings.save();

    // Record immutable audit event
    await AuditLog.recordEvent({
      eventType: 'SETTINGS_UPDATE',
      action: 'Updated Platform Settings',
      category: 'SETTINGS',
      adminId: (req.user as any)?._id || (req.user as any)?.id,
      adminEmail: (req.user as any)?.email || 'admin@athleteconnect.test',
      adminName: (req.user as any)?.name || 'Administrator',
      targetType: 'PlatformSettings',
      targetId: settings._id.toString(),
      details: {
        modifiedFields: payloadKeys,
      },
      outcome: 'SUCCESS',
      ipAddress: (req.headers['x-forwarded-for'] as string) || req.socket?.remoteAddress || '',
    });

    return res.status(200).json({
      settings: {
        platformName: settings.platformName,
        supportEmail: settings.supportEmail,
        supportPhone: settings.supportPhone || '',
        supportedDisciplines: settings.supportedDisciplines,
        cancellationWindowHours: settings.cancellationWindowHours,
        maxAdvanceBookingDays: settings.maxAdvanceBookingDays,
        defaultSessionDurationMinutes: settings.defaultSessionDurationMinutes,
        maintenanceMode: settings.maintenanceMode,
        maintenanceNotice: settings.maintenanceNotice || '',
        updatedAt: settings.updatedAt,
        updatedByEmail: settings.updatedByEmail || null,
      },
      message: 'Platform configuration updated successfully.',
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Platform Governance: List Immutable Administrative Audit Logs
 * GET /api/admin/audit-logs
 * Protected by authenticate & requireRole('admin').
 * Supports search, category filter, outcome filter, date range, and pagination.
 */
export async function getAdminAuditLogs(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '20'), 10) || 20));
    const skip = (page - 1) * limit;

    const categoryParam = typeof req.query.category === 'string' ? req.query.category.trim() : 'all';
    const outcomeParam = typeof req.query.outcome === 'string' ? req.query.outcome.trim() : 'all';
    const searchParam = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const startDateParam = typeof req.query.startDate === 'string' ? req.query.startDate.trim() : '';
    const endDateParam = typeof req.query.endDate === 'string' ? req.query.endDate.trim() : '';

    const filter: any = {};

    if (categoryParam !== 'all' && AUDIT_CATEGORIES.includes(categoryParam as any)) {
      filter.category = categoryParam;
    }

    if (outcomeParam !== 'all' && ['SUCCESS', 'FAILURE'].includes(outcomeParam)) {
      filter.outcome = outcomeParam;
    }

    if (searchParam) {
      const escaped = escapeRegex(searchParam);
      filter.$or = [
        { action: { $regex: escaped, $options: 'i' } },
        { adminEmail: { $regex: escaped, $options: 'i' } },
        { adminName: { $regex: escaped, $options: 'i' } },
        { targetType: { $regex: escaped, $options: 'i' } },
        { targetId: { $regex: escaped, $options: 'i' } },
      ];
    }

    if (startDateParam || endDateParam) {
      filter.createdAt = {};
      if (startDateParam) {
        const s = new Date(startDateParam);
        if (!isNaN(s.getTime())) filter.createdAt.$gte = s;
      }
      if (endDateParam) {
        const e = new Date(endDateParam);
        if (!isNaN(e.getTime())) filter.createdAt.$lte = e;
      }
    }

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AuditLog.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return res.status(200).json({
      logs: logs.map((log) => ({
        _id: log._id.toString(),
        eventType: log.eventType,
        action: log.action,
        category: log.category,
        adminId: log.adminId ? log.adminId.toString() : null,
        adminEmail: log.adminEmail,
        adminName: log.adminName || '',
        targetType: log.targetType,
        targetId: log.targetId || null,
        details: log.details || {},
        outcome: log.outcome,
        ipAddress: log.ipAddress || '',
        createdAt: log.createdAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
      categories: AUDIT_CATEGORIES,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Platform Governance: Safe System Health Check
 * GET /api/admin/health
 * Protected by authenticate & requireRole('admin').
 * Strictly returns sanitized health status without leaking database credentials, hostnames, or secrets.
 */
export async function getAdminHealth(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  try {
    let dbLatencyMs = 0;
    let isDbConnected = mongoose.connection.readyState === 1;

    if (isDbConnected && mongoose.connection.db) {
      try {
        const start = Date.now();
        await mongoose.connection.db.admin().ping();
        dbLatencyMs = Date.now() - start;
      } catch {
        isDbConnected = false;
      }
    }

    const memUsage = process.memoryUsage();

    return res.status(200).json({
      status: isDbConnected ? 'healthy' : 'degraded',
      database: {
        status: isDbConnected ? 'connected' : 'disconnected',
        readyState: mongoose.connection.readyState,
        pingLatencyMs: dbLatencyMs,
      },
      server: {
        uptimeSeconds: Math.round(process.uptime()),
        environment: config.NODE_ENV,
        memoryHeapUsedMB: Math.round((memUsage.heapUsed / (1024 * 1024)) * 100) / 100,
        memoryHeapTotalMB: Math.round((memUsage.heapTotal / (1024 * 1024)) * 100) / 100,
      },
      apis: {
        coreApi: 'operational',
        adminApi: 'operational',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return next(error);
  }
}



