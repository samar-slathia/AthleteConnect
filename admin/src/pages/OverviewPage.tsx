import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Users,
  UserCheck,
  Shield,
  ShieldCheck,
  CalendarDays,
  Clock,
  CheckCircle2,
  XCircle,
  RefreshCw,
  AlertCircle,
  Filter,
  Search,
  Activity,
} from 'lucide-react';
import {
  fetchAdminOverview,
  ApiError,
} from '../services/api';
import type { OverviewResponse } from '../services/api';
import { NoticeBanner } from '../components/NoticeBanner';

export const OverviewPage: React.FC = () => {
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Table filter and search states
  const [bookingFilter, setBookingFilter] = useState<string>('all');
  const [bookingSearch, setBookingSearch] = useState<string>('');

  const loadData = useCallback(async () => {
    setIsRefreshing(true);
    setError(null);

    try {
      const response = await fetchAdminOverview();
      setData(response);
      setLastUpdated(new Date(response.timestamp || Date.now()));
    } catch (err: any) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to fetch dashboard metrics. Please try again.');
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    fetchAdminOverview()
      .then((response) => {
        if (active) {
          setData(response);
          setLastUpdated(new Date(response.timestamp || Date.now()));
          setIsLoading(false);
        }
      })
      .catch((err: any) => {
        if (active) {
          if (err instanceof ApiError) {
            setError(err.message);
          } else {
            setError('Failed to fetch dashboard metrics. Please try again.');
          }
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  // Filtered recent bookings
  const recentBookings = data?.recentBookings;
  const filteredBookings = useMemo(() => {
    if (!recentBookings) return [];
    return recentBookings.filter((b) => {
      // Filter by status or sport
      if (bookingFilter !== 'all') {
        if (bookingFilter === 'cancelled_or_declined') {
          if (b.status !== 'cancelled' && b.status !== 'rejected') return false;
        } else if (b.status !== bookingFilter && b.sport !== bookingFilter) {
          return false;
        }
      }
      // Filter by search query
      if (bookingSearch.trim()) {
        const query = bookingSearch.trim().toLowerCase();
        const customerName = b.customer?.name?.toLowerCase() || '';
        const coachName = b.coach?.name?.toLowerCase() || '';
        const sport = b.sport?.toLowerCase() || '';
        const id = b._id?.toLowerCase() || '';
        return (
          customerName.includes(query) ||
          coachName.includes(query) ||
          sport.includes(query) ||
          id.includes(query)
        );
      }
      return true;
    });
  }, [recentBookings, bookingFilter, bookingSearch]);

  // Computed prominent metrics for Customers Joined and Coaches Joined
  const userMetrics = data?.metrics.users;
  const customersJoined = useMemo(() => {
    if (!userMetrics) return 0;
    if (typeof userMetrics.customersJoined === 'number') {
      return userMetrics.customersJoined;
    }
    return (userMetrics.parents || 0) + (userMetrics.individuals || 0);
  }, [userMetrics]);

  const coachesJoined = useMemo(() => {
    if (!userMetrics) return 0;
    if (typeof userMetrics.coachesJoined === 'number') {
      return userMetrics.coachesJoined;
    }
    return userMetrics.coaches || 0;
  }, [userMetrics]);

  const formatStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <span className="badge-status badge-pending">Pending</span>;
      case 'accepted':
        return <span className="badge-status badge-verified">Accepted</span>;
      case 'completed':
        return <span className="badge-status badge-completed">Completed</span>;
      case 'rejected':
        return <span className="badge-status badge-declined">Declined</span>;
      case 'cancelled':
        return <span className="badge-status badge-cancelled">Cancelled</span>;
      default:
        return <span className="badge-status badge-demo">{status}</span>;
    }
  };

  const formatSportLabel = (sport: string) => {
    if (!sport) return 'General';
    return sport.charAt(0).toUpperCase() + sport.slice(1);
  };

  return (
    <div className="overview-container">
      {/* Real-time Header & Refresh Control */}
      <div className="overview-header">
        <div>
          <h2 className="overview-title">Platform Operations Dashboard</h2>
          <p className="overview-subtitle">
            Verifiable database metrics retrieved live from MongoDB collections.
          </p>
        </div>
        <div className="overview-actions">
          {lastUpdated && (
            <span className="last-updated-text">
              Last synced: {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <button
            type="button"
            className="btn-secondary btn-refresh"
            onClick={loadData}
            disabled={isLoading || isRefreshing}
            aria-label="Refresh data"
          >
            <RefreshCw
              size={15}
              className={isRefreshing ? 'spin-icon' : undefined}
            />
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh Data'}</span>
          </button>
        </div>
      </div>

      <NoticeBanner message="Live Operations Feed: All user accounts and session numbers displayed below reflect actual records in the MongoDB database. Financial accounting and settlements are independent and will be integrated in Phase 3." />

      {/* Error Banner with Retry */}
      {error && (
        <div className="error-panel" role="alert">
          <div className="error-panel-content">
            <AlertCircle size={20} className="error-panel-icon" />
            <div>
              <div className="error-panel-title">Data Synchronization Error</div>
              <div className="error-panel-message">{error}</div>
            </div>
          </div>
          <button
            type="button"
            className="btn-secondary btn-retry"
            onClick={loadData}
          >
            Retry Connection
          </button>
        </div>
      )}

      {/* PROMINENT KEY STATISTICS: CUSTOMERS JOINED & COACHES JOINED */}
      <section className="prominent-stats-section" aria-label="Key Platform Community Statistics">
        <div className="prominent-stats-grid">
          {/* Card 1: Customers Joined */}
          <div className="prominent-stat-card card-customers">
            <div className="prominent-card-top">
              <div className="prominent-icon-wrapper icon-customers" aria-hidden="true">
                <Users size={34} strokeWidth={2.2} />
              </div>
              <span className="prominent-card-badge">Community Accounts</span>
            </div>
            <div className="prominent-card-body">
              <span className="prominent-stat-label">Customers Joined</span>
              {isLoading ? (
                <div className="prominent-stat-skeleton"></div>
              ) : (
                <div className="prominent-stat-value">
                  {customersJoined.toLocaleString()}
                </div>
              )}
            </div>
            <div className="prominent-card-footer">
              <div className="prominent-footnote-detail">
                Combined Parents ({data?.metrics.users.parents.toLocaleString() ?? 0}) + Individuals ({data?.metrics.users.individuals.toLocaleString() ?? 0})
              </div>
              <div className="prominent-footnote-status">
                Total registered customer accounts (active and inactive included)
              </div>
            </div>
          </div>

          {/* Card 2: Coaches Joined */}
          <div className="prominent-stat-card card-coaches">
            <div className="prominent-card-top">
              <div className="prominent-icon-wrapper icon-coaches" aria-hidden="true">
                <UserCheck size={34} strokeWidth={2.2} />
              </div>
              <span className="prominent-card-badge">Certified Trainers</span>
            </div>
            <div className="prominent-card-body">
              <span className="prominent-stat-label">Coaches Joined</span>
              {isLoading ? (
                <div className="prominent-stat-skeleton"></div>
              ) : (
                <div className="prominent-stat-value">
                  {coachesJoined.toLocaleString()}
                </div>
              )}
            </div>
            <div className="prominent-card-footer">
              <div className="prominent-footnote-detail">
                {data?.metrics.users.activeCoaches.toLocaleString() ?? 0} Active • {(data ? Math.max(0, data.metrics.users.coaches - data.metrics.users.activeCoaches) : 0).toLocaleString()} Inactive
              </div>
              <div className="prominent-footnote-status">
                Total registered coach accounts (active and inactive included)
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 1: USER ACCOUNTS OVERVIEW */}
      <section className="dashboard-section" aria-label="Registered User Accounts">
        <div className="section-title-row">
          <h3 className="section-title">
            <Users size={18} />
            <span>Registered User Accounts</span>
          </h3>
          <span className="section-badge">Verified DB Counts</span>
        </div>

        <div className="stats-grid">
          {/* Total Registered Users */}
          <div className="stat-card">
            <div className="stat-card-header">
              <span className="stat-label">Total Registered Users</span>
              <span className="stat-icon stat-icon-primary">
                <Users size={20} />
              </span>
            </div>
            {isLoading ? (
              <div className="stat-skeleton"></div>
            ) : (
              <div className="stat-value">
                {data?.metrics.users.total.toLocaleString() ?? 0}
              </div>
            )}
            <div className="stat-footnote">
              <span className="stat-tag tag-green">LIVE</span>
              <span>All registered platform accounts</span>
            </div>
          </div>

          {/* Parent/Guardian Accounts */}
          <div className="stat-card">
            <div className="stat-card-header">
              <span className="stat-label">Parents / Guardians</span>
              <span className="stat-icon">
                <Users size={20} />
              </span>
            </div>
            {isLoading ? (
              <div className="stat-skeleton"></div>
            ) : (
              <div className="stat-value">
                {data?.metrics.users.parents.toLocaleString() ?? 0}
              </div>
            )}
            <div className="stat-footnote">
              <span>Managing minor athlete bookings</span>
            </div>
          </div>

          {/* Individual Customer Accounts */}
          <div className="stat-card">
            <div className="stat-card-header">
              <span className="stat-label">Individual Customers</span>
              <span className="stat-icon">
                <UserCheck size={20} />
              </span>
            </div>
            {isLoading ? (
              <div className="stat-skeleton"></div>
            ) : (
              <div className="stat-value">
                {data?.metrics.users.individuals.toLocaleString() ?? 0}
              </div>
            )}
            <div className="stat-footnote">
              <span>Direct trainees & hobbyists</span>
            </div>
          </div>

          {/* Coaches (Total & Active) */}
          <div className="stat-card">
            <div className="stat-card-header">
              <span className="stat-label">Total Coaches</span>
              <span className="stat-icon">
                <Shield size={20} />
              </span>
            </div>
            {isLoading ? (
              <div className="stat-skeleton"></div>
            ) : (
              <div className="stat-value">
                {data?.metrics.users.coaches.toLocaleString() ?? 0}
              </div>
            )}
            <div className="stat-footnote">
              <span className="stat-tag tag-green">
                {data?.metrics.users.activeCoaches ?? 0} Active
              </span>
              <span>
                {data
                  ? `${Math.max(0, data.metrics.users.coaches - data.metrics.users.activeCoaches)} inactive`
                  : ''}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2: BOOKING OPERATIONS OVERVIEW */}
      <section className="dashboard-section" aria-label="Training Sessions and Bookings">
        <div className="section-title-row">
          <h3 className="section-title">
            <CalendarDays size={18} />
            <span>Training Sessions & Bookings</span>
          </h3>
          <span className="section-badge">Verified DB Counts</span>
        </div>

        <div className="stats-grid">
          {/* Pending Bookings */}
          <div className="stat-card">
            <div className="stat-card-header">
              <span className="stat-label">Pending Bookings</span>
              <span className="stat-icon stat-icon-warning">
                <Clock size={20} />
              </span>
            </div>
            {isLoading ? (
              <div className="stat-skeleton"></div>
            ) : (
              <div className="stat-value">
                {data?.metrics.bookings.pending.toLocaleString() ?? 0}
              </div>
            )}
            <div className="stat-footnote">
              <span className="badge-status badge-pending">Awaiting Coach</span>
              <span>Pending coach response</span>
            </div>
          </div>

          {/* Accepted Bookings */}
          <div className="stat-card">
            <div className="stat-card-header">
              <span className="stat-label">Accepted Bookings</span>
              <span className="stat-icon stat-icon-success">
                <CheckCircle2 size={20} />
              </span>
            </div>
            {isLoading ? (
              <div className="stat-skeleton"></div>
            ) : (
              <div className="stat-value">
                {data?.metrics.bookings.accepted.toLocaleString() ?? 0}
              </div>
            )}
            <div className="stat-footnote">
              <span className="badge-status badge-verified">Confirmed</span>
              <span>Active coaching sessions</span>
            </div>
          </div>

          {/* Completed Bookings */}
          <div className="stat-card">
            <div className="stat-card-header">
              <span className="stat-label">Completed Bookings</span>
              <span className="stat-icon stat-icon-info">
                <Activity size={20} />
              </span>
            </div>
            {isLoading ? (
              <div className="stat-skeleton"></div>
            ) : (
              <div className="stat-value">
                {data?.metrics.bookings.completed.toLocaleString() ?? 0}
              </div>
            )}
            <div className="stat-footnote">
              <span className="badge-status badge-completed">Delivered</span>
              <span>Successfully conducted</span>
            </div>
          </div>

          {/* Cancelled and Declined Bookings */}
          <div className="stat-card">
            <div className="stat-card-header">
              <span className="stat-label">Cancelled / Declined</span>
              <span className="stat-icon stat-icon-danger">
                <XCircle size={20} />
              </span>
            </div>
            {isLoading ? (
              <div className="stat-skeleton"></div>
            ) : (
              <div className="stat-value">
                {data?.metrics.bookings.cancelledAndDeclined.toLocaleString() ?? 0}
              </div>
            )}
            <div className="stat-footnote">
              <span>
                {data?.metrics.bookings.cancelled ?? 0} cancelled •{' '}
                {data?.metrics.bookings.declined ?? 0} declined
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 3: RECENT BOOKINGS TABLE & OPERATIONAL QUEUE */}
      <section className="panel" aria-label="Recent Training Sessions">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">Recent Training Bookings</h3>
            <p className="panel-subtitle">
              Live audit stream of sessions requested through the platform.
            </p>
          </div>
          <div className="panel-filter-controls">
            <div className="search-box">
              <Search size={15} />
              <input
                type="text"
                placeholder="Search athlete, coach, or sport..."
                value={bookingSearch}
                onChange={(e) => setBookingSearch(e.target.value)}
                aria-label="Search bookings"
              />
            </div>
            <div className="filter-select-wrapper">
              <Filter size={14} />
              <select
                value={bookingFilter}
                onChange={(e) => setBookingFilter(e.target.value)}
                aria-label="Filter bookings by status or discipline"
              >
                <option value="all">All Sessions</option>
                <option value="pending">Status: Pending</option>
                <option value="accepted">Status: Accepted</option>
                <option value="completed">Status: Completed</option>
                <option value="cancelled_or_declined">Status: Cancelled / Declined</option>
                <option value="boxing">Discipline: Boxing</option>
                <option value="wushu">Discipline: Wushu</option>
                <option value="kickboxing">Discipline: Kickboxing</option>
              </select>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="table-skeleton-wrapper">
            <div className="skeleton-row"></div>
            <div className="skeleton-row"></div>
            <div className="skeleton-row"></div>
          </div>
        ) : !data?.recentBookings || data.recentBookings.length === 0 ? (
          <div className="honest-empty-state">
            <div className="empty-icon-wrapper">
              <CalendarDays size={32} />
            </div>
            <h4 className="empty-title">No Bookings Recorded Yet</h4>
            <p className="empty-description">
              There are currently zero training bookings in the MongoDB database.
              When athletes request coaching sessions via the mobile application,
              they will appear here in real time.
            </p>
          </div>
        ) : filteredBookings.length === 0 ? (
          <div className="honest-empty-state">
            <div className="empty-icon-wrapper">
              <Filter size={28} />
            </div>
            <h4 className="empty-title">No Bookings Match Filter</h4>
            <p className="empty-description">
              No sessions matched the selected filter or search query.
            </p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="demo-table">
              <thead>
                <tr>
                  <th>Session Date & Time</th>
                  <th>Sport</th>
                  <th>Athlete / Customer</th>
                  <th>Assigned Coach</th>
                  <th>Venue</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredBookings.map((booking) => (
                  <tr key={booking._id}>
                    <td>
                      <strong>{booking.date}</strong>
                      <div className="table-subtext">
                        {booking.startTime} – {booking.endTime}
                      </div>
                    </td>
                    <td>
                      <span className="sport-pill">
                        {formatSportLabel(booking.sport)}
                      </span>
                    </td>
                    <td>
                      <strong>{booking.customer?.name || 'Athletic Member'}</strong>
                      <div className="table-subtext">
                        {booking.customer?.email || 'N/A'}
                      </div>
                    </td>
                    <td>
                      <strong>{booking.coach?.name || 'Assigned Coach'}</strong>
                      <div className="table-subtext">
                        {booking.coach?.email || 'N/A'}
                      </div>
                    </td>
                    <td>
                      <span className="venue-label">
                        {booking.venueType === 'ground'
                          ? 'Ground / Facility'
                          : booking.venueType === 'customer_home'
                          ? "Athlete's Home"
                          : booking.venueType || 'Ground'}
                      </span>
                    </td>
                    <td>{formatStatusBadge(booking.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* SECTION 4: REGISTERED COACHES QUEUE */}
      <section className="panel" aria-label="Registered Coaches Overview">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">Registered Coaches Directory</h3>
            <p className="panel-subtitle">
              Coaches currently registered in the database.
            </p>
          </div>
          <span className="badge-status badge-verified">
            {data?.metrics.users.activeCoaches ?? 0} Active Verified
          </span>
        </div>

        {isLoading ? (
          <div className="table-skeleton-wrapper">
            <div className="skeleton-row"></div>
            <div className="skeleton-row"></div>
          </div>
        ) : !data?.recentCoaches || data.recentCoaches.length === 0 ? (
          <div className="honest-empty-state">
            <div className="empty-icon-wrapper">
              <ShieldCheck size={32} />
            </div>
            <h4 className="empty-title">No Coaches Registered Yet</h4>
            <p className="empty-description">
              There are currently no coach accounts registered in the database.
              When trainers sign up via the mobile app, their accounts will appear here.
            </p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="demo-table">
              <thead>
                <tr>
                  <th>Coach Name</th>
                  <th>Email Address</th>
                  <th>Account Status</th>
                  <th>Registration Date</th>
                </tr>
              </thead>
              <tbody>
                {data.recentCoaches.map((coach) => (
                  <tr key={coach._id}>
                    <td>
                      <strong>{coach.name}</strong>
                    </td>
                    <td>{coach.email}</td>
                    <td>
                      {coach.isActive ? (
                        <span className="badge-status badge-verified">Active</span>
                      ) : (
                        <span className="badge-status badge-declined">Deactivated</span>
                      )}
                    </td>
                    <td>
                      {coach.createdAt
                        ? new Date(coach.createdAt).toLocaleDateString()
                        : 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
