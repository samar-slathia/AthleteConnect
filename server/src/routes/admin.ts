import { Router } from 'express';
import {
  adminLogin,
  getAdminMe,
  getAdminOverview,
  getAdminUsers,
  getAdminUserDetail,
  updateAdminUserStatus,
  getAdminCoaches,
  getAdminCoachDetail,
  getAdminBookings,
  getAdminBookingDetail,
  getAdminAnalytics,
  exportAdminReport,
  getAdminSettings,
  updateAdminSettings,
  getAdminAuditLogs,
  getAdminHealth,
} from '../controllers/adminController';
import { authenticate, requireRole } from '../middleware/auth';

export const adminRouter = Router();

// Public admin authentication endpoint
adminRouter.post('/login', adminLogin);

// Protected admin-only endpoints
adminRouter.get('/me', authenticate, requireRole('admin'), getAdminMe);
adminRouter.get('/overview', authenticate, requireRole('admin'), getAdminOverview);

// Users Management (Customers: Parents & Individuals)
adminRouter.get('/users', authenticate, requireRole('admin'), getAdminUsers);
adminRouter.get('/users/:id', authenticate, requireRole('admin'), getAdminUserDetail);
adminRouter.patch('/users/:id/status', authenticate, requireRole('admin'), updateAdminUserStatus);

// Coaches Management
adminRouter.get('/coaches', authenticate, requireRole('admin'), getAdminCoaches);
adminRouter.get('/coaches/:id', authenticate, requireRole('admin'), getAdminCoachDetail);

// Bookings Management
adminRouter.get('/bookings', authenticate, requireRole('admin'), getAdminBookings);
adminRouter.get('/bookings/:id', authenticate, requireRole('admin'), getAdminBookingDetail);

// Reports & Analytics (Phase 4)
adminRouter.get('/reports/analytics', authenticate, requireRole('admin'), getAdminAnalytics);
adminRouter.get('/reports/export', authenticate, requireRole('admin'), exportAdminReport);

// Platform Settings & Governance (Phase 5)
adminRouter.get('/settings', authenticate, requireRole('admin'), getAdminSettings);
adminRouter.patch('/settings', authenticate, requireRole('admin'), updateAdminSettings);
adminRouter.get('/audit-logs', authenticate, requireRole('admin'), getAdminAuditLogs);
adminRouter.get('/health', authenticate, requireRole('admin'), getAdminHealth);
