/**
 * AthleteConnect Admin API Service
 * Secure, authenticated HTTP client for administrative operations.
 */

export const TOKEN_STORAGE_KEY = 'athleteconnect_admin_token';
export const USER_STORAGE_KEY = 'athleteconnect_admin_user';

export interface AdminUser {
  id?: string;
  _id?: string;
  email: string;
  name: string;
  role: 'admin';
  isActive: boolean;
}

export interface LoginResponse {
  user: AdminUser;
  token: string;
}

export interface UserMetrics {
  total: number;
  parents: number;
  individuals: number;
  customersJoined?: number;
  activeCustomers?: number;
  coaches: number;
  coachesJoined?: number;
  activeCoaches: number;
  admins: number;
}

export interface BookingMetrics {
  total: number;
  pending: number;
  accepted: number;
  completed: number;
  cancelled: number;
  declined: number;
  cancelledAndDeclined: number;
}

export interface DashboardMetrics {
  users: UserMetrics;
  bookings: BookingMetrics;
}

export interface RecentBookingCustomer {
  id?: string;
  name?: string;
  email?: string;
  role?: string;
}

export interface RecentBookingCoach {
  id?: string;
  name?: string;
  email?: string;
}

export interface RecentBooking {
  _id: string;
  sport: string;
  date: string;
  startTime: string;
  endTime: string;
  venueType: string;
  status: string;
  createdAt?: string;
  customer: RecentBookingCustomer | null;
  coach: RecentBookingCoach | null;
}

export interface RecentCoach {
  _id: string;
  name: string;
  email: string;
  isActive: boolean;
  createdAt?: string;
}

export interface OverviewResponse {
  metrics: DashboardMetrics;
  recentBookings: RecentBooking[];
  recentCoaches: RecentCoach[];
  timestamp: string;
}

// Phase 2: Users & Coaches Management Models
export interface CustomerUser {
  _id: string;
  name: string;
  email: string;
  role: 'parent' | 'individual';
  isActive: boolean;
  photoFileId?: string | null;
  photoUpdatedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface CustomerSummary {
  totalCustomers: number;
  parentCount: number;
  individualCount: number;
  activeCount: number;
  inactiveCount: number;
}

export interface UsersListResponse {
  users: CustomerUser[];
  pagination: PaginationMeta;
  summary: CustomerSummary;
}

export interface UserDetailResponse {
  user: CustomerUser;
  bookingCount: number;
}

export interface CoachProfileData {
  bio?: string;
  disciplines: string[];
  specialties: string[];
  sessionFormats: string[];
  venueTypes: string[];
  hourlyRate?: number;
  currency?: string;
  locations: string[];
  isPublished?: boolean;
  isComplete?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CoachUser {
  _id: string;
  name: string;
  email: string;
  role: 'coach';
  isActive: boolean;
  photoFileId?: string | null;
  photoUpdatedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
  profile: CoachProfileData | null;
}

export interface CoachSummary {
  totalCoaches: number;
  activeCoaches: number;
  inactiveCoaches: number;
}

export interface CoachesListResponse {
  coaches: CoachUser[];
  pagination: PaginationMeta;
  summary: CoachSummary;
}

export interface CoachDetailResponse {
  coach: CoachUser;
  profile: CoachProfileData | null;
  bookingCount: number;
}

export interface UpdateStatusResponse {
  user: {
    _id: string;
    name: string;
    email: string;
    role: string;
    isActive: boolean;
    createdAt: string;
    updatedAt?: string;
  };
  message: string;
}

// Phase 3: Bookings Management Models
export interface AdminBookingCustomer {
  id?: string;
  name?: string;
  email?: string;
  role?: 'parent' | 'individual';
  isActive?: boolean;
  customerPhone?: string;
  createdAt?: string;
}

export interface AdminBookingCoachProfile {
  disciplines?: string[];
  specialties?: string[];
  sessionFormats?: string[];
  venueTypes?: string[];
  hourlyRate?: number;
  bio?: string;
  locations?: string[];
}

export interface AdminBookingCoach {
  id?: string;
  name?: string;
  email?: string;
  isActive?: boolean;
  createdAt?: string;
  profile?: AdminBookingCoachProfile | null;
}

export interface AdminBookingItem {
  _id: string;
  sport: string;
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  venueType: string;
  status: 'pending' | 'accepted' | 'completed' | 'cancelled' | 'rejected';
  paymentStatus: 'unpaid' | 'paid' | 'partially_refunded' | 'refunded';
  refundStatus?: 'none' | 'pending' | 'partially_refunded' | 'processed' | 'failed';
  hourlyRateSnapshot?: number;
  rejectionReason?: string;
  cancellationReason?: string;
  cancelledBy?: 'customer' | 'coach';
  createdAt?: string;
  updatedAt?: string;
  customer: AdminBookingCustomer | null;
  coach: AdminBookingCoach | null;
}

export interface AdminBookingDetail extends AdminBookingItem {
  startMinutes?: number;
  endMinutes?: number;
  trainingAddress?: string;
  locationCoordinates?: { latitude: number; longitude: number } | null;
}

export interface BookingSummaryMetrics {
  total: number;
  pending: number;
  accepted: number;
  completed: number;
  cancelled: number;
  declined: number;
}

export interface BookingsListResponse {
  bookings: AdminBookingItem[];
  pagination: PaginationMeta;
  summary: BookingSummaryMetrics;
  filteredCount: number;
}

export interface BookingDetailResponse {
  booking: AdminBookingDetail;
}

export class ApiError extends Error {
  status: number;
  data: any;

  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

// Session storage helpers
export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function getStoredUser(): AdminUser | null {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setStoredSession(token: string, user: AdminUser): void {
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  } catch {
    // Storage quota or private mode fallback
  }
}

export function clearStoredSession(): void {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
  } catch {
    // Ignore error
  }
}

// Global 401 unauthorized handler listener
type UnauthorizedHandler = () => void;
let onUnauthorizedCallback: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  onUnauthorizedCallback = handler;
}

/**
 * Base HTTP request wrapper with Bearer token authentication and error handling.
 */
export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});

  headers.set('Content-Type', 'application/json');
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const baseUrl = import.meta.env.VITE_API_BASE_URL || '';
  const url = `${baseUrl}${endpoint}`;

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
    });
  } catch (error: any) {
    throw new ApiError(
      'Unable to connect to the AthleteConnect server. Please check your network connection.',
      0,
      error
    );
  }

  let data: any = null;
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    if (response.status === 401) {
      clearStoredSession();
      if (onUnauthorizedCallback) {
        onUnauthorizedCallback();
      }
    }

    const errorMessage =
      data?.error ||
      data?.message ||
      `Request failed with status ${response.status} (${response.statusText})`;
    throw new ApiError(errorMessage, response.status, data);
  }

  return data as T;
}

/**
 * Authenticate administrator with email and password.
 */
export async function adminLogin(
  email: string,
  password: string
): Promise<LoginResponse> {
  const data = await apiRequest<LoginResponse>('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

  if (data.user?.role !== 'admin') {
    throw new ApiError(
      'Access forbidden. Only administrator accounts are authorized.',
      403
    );
  }

  setStoredSession(data.token, data.user);
  return data;
}

/**
 * Fetch currently authenticated administrator profile.
 */
export async function fetchAdminMe(): Promise<{ user: AdminUser }> {
  return apiRequest<{ user: AdminUser }>('/api/admin/me', {
    method: 'GET',
  });
}

/**
 * Fetch verified overview metrics and recent operational records.
 */
export async function fetchAdminOverview(): Promise<OverviewResponse> {
  return apiRequest<OverviewResponse>('/api/admin/overview', {
    method: 'GET',
  });
}

/**
 * Users Management: Fetch paginated customer accounts (Parents & Individuals)
 */
export async function fetchAdminUsers(params: {
  page?: number;
  limit?: number;
  search?: string;
  role?: string;
  status?: string;
} = {}): Promise<UsersListResponse> {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  if (params.search) query.set('search', params.search);
  if (params.role && params.role !== 'all') query.set('role', params.role);
  if (params.status && params.status !== 'all') query.set('status', params.status);

  const qs = query.toString();
  return apiRequest<UsersListResponse>(`/api/admin/users${qs ? `?${qs}` : ''}`, {
    method: 'GET',
  });
}

/**
 * Users Management: Fetch customer details by ID
 */
export async function fetchAdminUserDetail(id: string): Promise<UserDetailResponse> {
  return apiRequest<UserDetailResponse>(`/api/admin/users/${id}`, {
    method: 'GET',
  });
}

/**
 * Account Activation Management: Update user active status
 */
export async function updateAdminUserStatus(
  id: string,
  isActive: boolean
): Promise<UpdateStatusResponse> {
  return apiRequest<UpdateStatusResponse>(`/api/admin/users/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ isActive }),
  });
}

/**
 * Coaches Management: Fetch paginated coach accounts
 */
export async function fetchAdminCoaches(params: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  discipline?: string;
} = {}): Promise<CoachesListResponse> {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  if (params.search) query.set('search', params.search);
  if (params.status && params.status !== 'all') query.set('status', params.status);
  if (params.discipline && params.discipline !== 'all') query.set('discipline', params.discipline);

  const qs = query.toString();
  return apiRequest<CoachesListResponse>(`/api/admin/coaches${qs ? `?${qs}` : ''}`, {
    method: 'GET',
  });
}

/**
 * Coaches Management: Fetch coach details by ID
 */
export async function fetchAdminCoachDetail(id: string): Promise<CoachDetailResponse> {
  return apiRequest<CoachDetailResponse>(`/api/admin/coaches/${id}`, {
    method: 'GET',
  });
}

/**
 * Bookings Management: Fetch paginated bookings with filters
 */
export async function fetchAdminBookings(params: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  sport?: string;
  fromDate?: string;
  toDate?: string;
  customerId?: string;
  coachId?: string;
} = {}): Promise<BookingsListResponse> {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  if (params.search) query.set('search', params.search);
  if (params.status && params.status !== 'all') query.set('status', params.status);
  if (params.sport && params.sport !== 'all') query.set('sport', params.sport);
  if (params.fromDate) query.set('fromDate', params.fromDate);
  if (params.toDate) query.set('toDate', params.toDate);
  if (params.customerId) query.set('customerId', params.customerId);
  if (params.coachId) query.set('coachId', params.coachId);

  const qs = query.toString();
  return apiRequest<BookingsListResponse>(`/api/admin/bookings${qs ? `?${qs}` : ''}`, {
    method: 'GET',
  });
}

/**
 * Bookings Management: Fetch single booking details by ID
 */
export async function fetchAdminBookingDetail(id: string): Promise<BookingDetailResponse> {
  return apiRequest<BookingDetailResponse>(`/api/admin/bookings/${id}`, {
    method: 'GET',
  });
}

// Phase 4: Reports & Analytics Models
export interface AnalyticsRangeInfo {
  type: string;
  label: string;
  startDate: string | null;
  endDate: string | null;
}

export interface AnalyticsCounts {
  totalCustomers: number;
  totalCoaches: number;
  totalBookings: number;
  completedBookings: number;
  pendingBookings: number;
  cancelledBookings: number;
  declinedBookings: number;
}

export interface UserGrowthPoint {
  date: string;
  parents: number;
  individuals: number;
  coaches: number;
  total: number;
}

export interface BookingTrendPoint {
  date: string;
  total: number;
  pending: number;
  accepted: number;
  completed: number;
  cancelled: number;
  declined: number;
}

export interface BookingDistribution {
  total: number;
  pending: number;
  accepted: number;
  completed: number;
  cancelled: number;
  declined: number;
}

export interface SportPopularityItem {
  sport: string;
  total: number;
  completed: number;
  accepted: number;
  cancelled: number;
  declined: number;
  percentage: number;
}

export interface TopCoachActivityItem {
  coachId: string;
  name: string;
  email: string;
  isActive: boolean;
  totalBookings: number;
  completedSessions: number;
  acceptedSessions: number;
  cancelledSessions: number;
}

export interface CoachActivityReport {
  totalRegistered: number;
  activeCoaches: number;
  coachesWithBookings: number;
  topCoaches: TopCoachActivityItem[];
}

export interface CancellationReasonItem {
  reason: string;
  count: number;
}

export interface CancellationAnalysisReport {
  totalCancelled: number;
  totalDeclined: number;
  attribution: {
    customer: number;
    coach: number;
    unspecified: number;
  };
  reasons: CancellationReasonItem[];
  rejectionReasons: CancellationReasonItem[];
}

export interface AnalyticsResponse {
  range: AnalyticsRangeInfo;
  summary: {
    allTime: AnalyticsCounts;
    filtered: AnalyticsCounts;
  };
  userGrowth: {
    timeline: UserGrowthPoint[];
    totalInPeriod: number;
  };
  bookingTrends: {
    timeline: BookingTrendPoint[];
    distribution: BookingDistribution;
  };
  sportsPopularity: SportPopularityItem[];
  coachActivity: CoachActivityReport;
  cancellationAnalysis: CancellationAnalysisReport;
  financialStatus: {
    isAvailable: boolean;
    notice: string;
  };
  auditTrailStatus: {
    isAvailable: boolean;
    notice: string;
  };
  timestamp: string;
}

/**
 * Reports & Analytics: Fetch verified analytics payload
 */
export async function fetchAdminAnalytics(params: {
  range?: string;
  startDate?: string;
  endDate?: string;
  sport?: string;
  status?: string;
} = {}): Promise<AnalyticsResponse> {
  const query = new URLSearchParams();
  if (params.range) query.set('range', params.range);
  if (params.startDate) query.set('startDate', params.startDate);
  if (params.endDate) query.set('endDate', params.endDate);
  if (params.sport && params.sport !== 'all') query.set('sport', params.sport);
  if (params.status && params.status !== 'all') query.set('status', params.status);

  const qs = query.toString();
  return apiRequest<AnalyticsResponse>(`/api/admin/reports/analytics${qs ? `?${qs}` : ''}`, {
    method: 'GET',
  });
}

/**
 * Reports & Analytics: Download report CSV securely with Bearer token
 */
export async function downloadAdminReportCsv(
  reportType: 'bookings' | 'users' | 'sports' | 'cancellations',
  params: {
    range?: string;
    startDate?: string;
    endDate?: string;
    sport?: string;
    status?: string;
  } = {}
): Promise<void> {
  const token = getStoredToken();
  const query = new URLSearchParams();
  query.set('reportType', reportType);
  if (params.range) query.set('range', params.range);
  if (params.startDate) query.set('startDate', params.startDate);
  if (params.endDate) query.set('endDate', params.endDate);
  if (params.sport && params.sport !== 'all') query.set('sport', params.sport);
  if (params.status && params.status !== 'all') query.set('status', params.status);

  const baseUrl = import.meta.env.VITE_API_BASE_URL || '';
  const url = `${baseUrl}/api/admin/reports/export?${query.toString()}`;

  const headers: HeadersInit = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, { method: 'GET', headers });
  if (!response.ok) {
    throw new ApiError(`Failed to generate ${reportType} CSV export.`, response.status);
  }

  const blob = await response.blob();
  const nowStr = new Date().toISOString().split('T')[0];
  const filename = `athleteconnect-${reportType}-report-${nowStr}.csv`;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(downloadUrl);
  }
}

// Phase 5: Platform Settings & Governance Models
export interface PlatformConfigSettings {
  platformName: string;
  supportEmail: string;
  supportPhone: string;
  supportedDisciplines: string[];
  cancellationWindowHours: number;
  maxAdvanceBookingDays: number;
  defaultSessionDurationMinutes: number;
  maintenanceMode: boolean;
  maintenanceNotice: string;
  updatedAt?: string;
  updatedByEmail?: string | null;
}

export interface PlatformInfo {
  name: string;
  environment: string;
  apiVersion: string;
  backendStatus: string;
  databaseStatus: string;
  serverUptimeSeconds: number;
}

export interface FeatureItem {
  status: 'Available' | 'Not configured' | 'Planned' | 'Unavailable';
  label: string;
  description: string;
}

export interface PlatformFeatures {
  customerRegistration: FeatureItem;
  coachRegistration: FeatureItem;
  coachDiscovery: FeatureItem;
  trainingBookings: FeatureItem;
  profilePhotos: FeatureItem;
  reporting: FeatureItem;
  paymentIntegration: FeatureItem;
}

export interface SettingsResponse {
  settings: PlatformConfigSettings;
  platformInfo: PlatformInfo;
  features: PlatformFeatures;
  timestamp: string;
}

export interface AuditLogEntry {
  _id: string;
  eventType: string;
  action: string;
  category: 'AUTH' | 'USER_MANAGEMENT' | 'SETTINGS' | 'SECURITY';
  adminId?: string | null;
  adminEmail: string;
  adminName?: string;
  targetType: string;
  targetId?: string | null;
  details: Record<string, unknown>;
  outcome: 'SUCCESS' | 'FAILURE';
  ipAddress?: string;
  createdAt: string;
}

export interface AuditLogsResponse {
  logs: AuditLogEntry[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  categories: string[];
  timestamp: string;
}

export interface SystemHealthResponse {
  status: 'healthy' | 'degraded';
  database: {
    status: 'connected' | 'disconnected';
    readyState: number;
    pingLatencyMs: number;
  };
  server: {
    uptimeSeconds: number;
    environment: string;
    memoryHeapUsedMB: number;
    memoryHeapTotalMB: number;
  };
  apis: {
    coreApi: string;
    adminApi: string;
  };
  timestamp: string;
}

/**
 * Platform Settings: Fetch configuration, system info, and feature statuses
 */
export async function fetchAdminSettings(): Promise<SettingsResponse> {
  return apiRequest<SettingsResponse>('/api/admin/settings', {
    method: 'GET',
  });
}

/**
 * Platform Settings: Update permitted platform configuration
 */
export async function updateAdminSettings(
  patch: Partial<PlatformConfigSettings>
): Promise<{ settings: PlatformConfigSettings; message: string }> {
  return apiRequest<{ settings: PlatformConfigSettings; message: string }>('/api/admin/settings', {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

/**
 * Platform Governance: Fetch paginated, immutable audit logs
 */
export async function fetchAdminAuditLogs(params: {
  page?: number;
  limit?: number;
  category?: string;
  outcome?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
} = {}): Promise<AuditLogsResponse> {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  if (params.category && params.category !== 'all') query.set('category', params.category);
  if (params.outcome && params.outcome !== 'all') query.set('outcome', params.outcome);
  if (params.search && params.search.trim()) query.set('search', params.search.trim());
  if (params.startDate) query.set('startDate', params.startDate);
  if (params.endDate) query.set('endDate', params.endDate);

  const qs = query.toString();
  return apiRequest<AuditLogsResponse>(`/api/admin/audit-logs${qs ? `?${qs}` : ''}`, {
    method: 'GET',
  });
}

/**
 * Platform Governance: Fetch safe system health metrics
 */
export async function fetchAdminSystemHealth(): Promise<SystemHealthResponse> {
  return apiRequest<SystemHealthResponse>('/api/admin/health', {
    method: 'GET',
  });
}

