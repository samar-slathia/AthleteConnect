import React, { useState, useEffect, useCallback, useId } from 'react';
import {
  CalendarDays,
  Clock,
  CheckCircle,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Search,
  Filter,
  RefreshCw,
  AlertCircle,
  Eye,
  ChevronLeft,
  ChevronRight,
  X,
  MapPin,
  User,
  Shield,
  Phone,
  Mail,
  Calendar,
  DollarSign,
} from 'lucide-react';
import {
  fetchAdminBookings,
  fetchAdminBookingDetail,
  ApiError,
} from '../services/api';
import type {
  AdminBookingItem,
  AdminBookingDetail,
  PaginationMeta,
  BookingSummaryMetrics,
} from '../services/api';

export const BookingsPage: React.FC = () => {
  const searchInputId = useId();
  const statusSelectId = useId();
  const sportSelectId = useId();
  const fromDateId = useId();
  const toDateId = useId();

  const [bookings, setBookings] = useState<AdminBookingItem[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });
  const [summary, setSummary] = useState<BookingSummaryMetrics | null>(null);
  const [filteredCount, setFilteredCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters state
  const [search, setSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sportFilter, setSportFilter] = useState<string>('all');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Detail Modal State
  const [selectedBookingDetail, setSelectedBookingDetail] = useState<AdminBookingDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState<boolean>(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const hasActiveFilters = Boolean(
    search.trim() ||
    statusFilter !== 'all' ||
    sportFilter !== 'all' ||
    fromDate ||
    toDate
  );

  const loadBookings = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetchAdminBookings({
        page: currentPage,
        limit: 10,
        search: search.trim() || undefined,
        status: statusFilter,
        sport: sportFilter,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
      });
      setBookings(response.bookings);
      setPagination(response.pagination);
      setSummary(response.summary);
      setFilteredCount(response.filteredCount);
    } catch (err: any) {
      if (err instanceof ApiError) {
        setError(`Failed to load bookings: ${err.message}`);
      } else {
        setError('Network or system error while communicating with AthleteConnect backend.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, search, statusFilter, sportFilter, fromDate, toDate]);

  useEffect(() => {
    let active = true;

    fetchAdminBookings({
      page: currentPage,
      limit: 10,
      search: search.trim() || undefined,
      status: statusFilter,
      sport: sportFilter,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
    })
      .then((response) => {
        if (active) {
          setBookings(response.bookings);
          setPagination(response.pagination);
          setSummary(response.summary);
          setFilteredCount(response.filteredCount);
          setIsLoading(false);
        }
      })
      .catch((err: any) => {
        if (active) {
          if (err instanceof ApiError) {
            setError(`Failed to load bookings: ${err.message}`);
          } else {
            setError('Network or system error while communicating with AthleteConnect backend.');
          }
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [currentPage, search, statusFilter, sportFilter, fromDate, toDate]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setSportFilter('all');
    setFromDate('');
    setToDate('');
    setCurrentPage(1);
  };

  const handleViewDetail = async (id: string) => {
    setIsLoadingDetail(true);
    setDetailError(null);
    setSelectedBookingDetail(null);
    try {
      const response = await fetchAdminBookingDetail(id);
      setSelectedBookingDetail(response.booking);
    } catch (err: any) {
      setDetailError(
        err instanceof ApiError
          ? `Could not retrieve booking details: ${err.message}`
          : 'Failed to retrieve booking information.'
      );
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <span className="badge-status badge-pending">Pending</span>;
      case 'accepted':
        return <span className="badge-status badge-verified">Accepted</span>;
      case 'completed':
        return <span className="badge-status badge-completed">Completed</span>;
      case 'cancelled':
        return <span className="badge-status badge-cancelled">Cancelled</span>;
      case 'rejected':
        return <span className="badge-status badge-declined">Declined</span>;
      default:
        return <span className="badge-status badge-demo">{status}</span>;
    }
  };

  const formatVenueType = (venue: string) => {
    switch (venue) {
      case 'coach_home':
        return 'Coach Location';
      case 'customer_home':
        return 'Customer Home';
      case 'ground':
        return 'Training Ground';
      default:
        return venue ? venue.replace(/_/g, ' ') : '—';
    }
  };

  return (
    <div className="management-page-container">
      {/* Page Header */}
      <div className="management-header">
        <div>
          <h1 className="management-title">Training Sessions &amp; Bookings</h1>
          <p className="management-subtitle">
            Live administrative oversight, scheduling verification, and session status tracking.
          </p>
        </div>
        <div className="management-header-actions">
          <button
            type="button"
            className="btn-management-action"
            onClick={() => loadBookings()}
            disabled={isLoading}
            aria-label="Refresh bookings"
          >
            <RefreshCw size={15} className={isLoading ? 'spin-icon' : undefined} />
            <span>{isLoading ? 'Syncing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* 6 Summary Metric Cards (Actual MongoDB Counts) */}
      <div className="management-stats-grid">
        {/* Total Bookings */}
        <div className="m-stat-card">
          <div className="m-stat-header">
            <span className="m-stat-label">Total Bookings</span>
            <span className="m-stat-icon icon-primary">
              <CalendarDays size={18} />
            </span>
          </div>
          <div className="m-stat-value">
            {isLoading && !summary ? <div className="stat-skeleton" /> : summary?.total.toLocaleString() ?? '—'}
          </div>
          <div className="m-stat-footnote">All-time platform requests</div>
        </div>

        {/* Pending Requests */}
        <div className="m-stat-card">
          <div className="m-stat-header">
            <span className="m-stat-label">Pending Requests</span>
            <span className="m-stat-icon icon-warning">
              <Clock size={18} />
            </span>
          </div>
          <div className="m-stat-value">
            {isLoading && !summary ? <div className="stat-skeleton" /> : summary?.pending.toLocaleString() ?? '—'}
          </div>
          <div className="m-stat-footnote">Awaiting coach response</div>
        </div>

        {/* Accepted Sessions */}
        <div className="m-stat-card">
          <div className="m-stat-header">
            <span className="m-stat-label">Accepted Sessions</span>
            <span className="m-stat-icon icon-info">
              <CheckCircle2 size={18} />
            </span>
          </div>
          <div className="m-stat-value">
            {isLoading && !summary ? <div className="stat-skeleton" /> : summary?.accepted.toLocaleString() ?? '—'}
          </div>
          <div className="m-stat-footnote">Scheduled and confirmed</div>
        </div>

        {/* Completed Sessions */}
        <div className="m-stat-card">
          <div className="m-stat-header">
            <span className="m-stat-label">Completed Sessions</span>
            <span className="m-stat-icon icon-success">
              <CheckCircle size={18} />
            </span>
          </div>
          <div className="m-stat-value">
            {isLoading && !summary ? <div className="stat-skeleton" /> : summary?.completed.toLocaleString() ?? '—'}
          </div>
          <div className="m-stat-footnote">Concluded sessions</div>
        </div>

        {/* Cancelled Sessions */}
        <div className="m-stat-card">
          <div className="m-stat-header">
            <span className="m-stat-label">Cancelled Sessions</span>
            <span className="m-stat-icon icon-neutral">
              <XCircle size={18} />
            </span>
          </div>
          <div className="m-stat-value">
            {isLoading && !summary ? <div className="stat-skeleton" /> : summary?.cancelled.toLocaleString() ?? '—'}
          </div>
          <div className="m-stat-footnote">Cancelled by customer or coach</div>
        </div>

        {/* Declined Requests */}
        <div className="m-stat-card">
          <div className="m-stat-header">
            <span className="m-stat-label">Declined Requests</span>
            <span className="m-stat-icon icon-danger-red">
              <AlertTriangle size={18} />
            </span>
          </div>
          <div className="m-stat-value">
            {isLoading && !summary ? <div className="stat-skeleton" /> : summary?.declined.toLocaleString() ?? '—'}
          </div>
          <div className="m-stat-footnote">Declined before acceptance</div>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="management-alert management-alert-error" role="alert">
          <AlertCircle size={18} />
          <div className="alert-content">
            <strong>Data Fetch Error:</strong> {error}
          </div>
          <button type="button" className="btn-alert-action" onClick={() => loadBookings()}>
            Retry
          </button>
        </div>
      )}

      {/* Filter and Search Toolbar */}
      <section className="panel management-toolbar-panel">
        <form onSubmit={handleSearchSubmit} className="management-toolbar">
          {/* Search Box */}
          <div className="toolbar-search">
            <Search size={16} className="search-icon" />
            <label htmlFor={searchInputId} className="sr-only">
              Search by customer, coach, booking ID, or sport
            </label>
            <input
              id={searchInputId}
              type="text"
              placeholder="Search customer, coach, sport, or ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="search-input"
            />
            {search && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => {
                  setSearch('');
                  setCurrentPage(1);
                }}
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Status Filter */}
          <div className="filter-select-wrapper">
            <Filter size={14} color="var(--color-text-secondary)" />
            <label htmlFor={statusSelectId} className="sr-only">
              Filter by Booking Status
            </label>
            <select
              id={statusSelectId}
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              aria-label="Filter by Booking Status"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="accepted">Accepted</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="declined">Declined</option>
            </select>
          </div>

          {/* Sport Filter */}
          <div className="filter-select-wrapper">
            <label htmlFor={sportSelectId} className="sr-only">
              Filter by Sport
            </label>
            <select
              id={sportSelectId}
              value={sportFilter}
              onChange={(e) => {
                setSportFilter(e.target.value);
                setCurrentPage(1);
              }}
              aria-label="Filter by Sport"
            >
              <option value="all">All Sports</option>
              <option value="boxing">Boxing</option>
              <option value="wushu">Wushu</option>
              <option value="kickboxing">Kickboxing</option>
            </select>
          </div>

          {/* Date Range: From */}
          <div className="date-input-wrapper">
            <span className="date-input-label">From:</span>
            <label htmlFor={fromDateId} className="sr-only">From Date</label>
            <input
              id={fromDateId}
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setCurrentPage(1);
              }}
              aria-label="Filter from date"
            />
          </div>

          {/* Date Range: To */}
          <div className="date-input-wrapper">
            <span className="date-input-label">To:</span>
            <label htmlFor={toDateId} className="sr-only">To Date</label>
            <input
              id={toDateId}
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setCurrentPage(1);
              }}
              aria-label="Filter to date"
            />
          </div>

          {/* Clear Filters Button */}
          {hasActiveFilters && (
            <button
              type="button"
              className="btn-clear-filters"
              onClick={handleClearFilters}
              aria-label="Clear all applied filters"
            >
              <X size={14} />
              <span>Clear Filters</span>
            </button>
          )}
        </form>

        {/* Counter indicator */}
        <div style={{ marginTop: '12px', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
          {hasActiveFilters ? (
            <span>
              Showing <strong>{filteredCount}</strong> filtered session{filteredCount === 1 ? '' : 's'} (out of {summary?.total ?? 0} all-time)
            </span>
          ) : (
            <span>Showing all <strong>{summary?.total ?? 0}</strong> recorded session{summary?.total === 1 ? '' : 's'}</span>
          )}
        </div>
      </section>

      {/* Bookings Table Panel */}
      <section className="panel">
        <div className="table-wrapper">
          {isLoading ? (
            <div className="table-skeleton-wrapper" aria-label="Loading bookings data">
              <div className="skeleton-row" />
              <div className="skeleton-row" />
              <div className="skeleton-row" />
              <div className="skeleton-row" />
              <div className="skeleton-row" />
            </div>
          ) : bookings.length === 0 ? (
            <div className="honest-empty-state">
              <div className="empty-icon-wrapper">
                <CalendarDays size={28} />
              </div>
              <div className="empty-title">No Bookings Found</div>
              <p className="empty-description">
                {hasActiveFilters
                  ? 'No training sessions matched your active search query or filters. Try adjusting your parameters.'
                  : 'No customer bookings have been created on the platform yet.'}
              </p>
              {hasActiveFilters && (
                <button
                  type="button"
                  className="btn-management-action"
                  onClick={handleClearFilters}
                  style={{ marginTop: '8px' }}
                >
                  Reset Filters
                </button>
              )}
            </div>
          ) : (
            <table className="demo-table">
              <thead>
                <tr>
                  <th>Booking Ref</th>
                  <th>Customer</th>
                  <th>Coach</th>
                  <th>Sport</th>
                  <th>Schedule</th>
                  <th>Venue</th>
                  <th>Status</th>
                  <th>Requested</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((booking) => {
                  const refId = `#${booking._id.slice(-6).toUpperCase()}`;
                  return (
                    <tr key={booking._id}>
                      {/* Reference / ID */}
                      <td>
                        <strong title={`Full ID: ${booking._id}`} style={{ fontFamily: 'monospace' }}>
                          {refId}
                        </strong>
                      </td>

                      {/* Customer */}
                      <td>
                        <div style={{ fontWeight: 600 }}>{booking.customer?.name || 'Unknown Customer'}</div>
                        <div className="table-subtext">
                          {booking.customer?.role === 'parent' ? 'Parent / Guardian' : 'Individual'}
                        </div>
                      </td>

                      {/* Coach */}
                      <td>
                        <div style={{ fontWeight: 600 }}>{booking.coach?.name || 'Unknown Coach'}</div>
                        <div className="table-subtext">{booking.coach?.email || '—'}</div>
                      </td>

                      {/* Sport */}
                      <td>
                        <span className="sport-pill">
                          {booking.sport.charAt(0).toUpperCase() + booking.sport.slice(1)}
                        </span>
                      </td>

                      {/* Schedule */}
                      <td>
                        <div style={{ fontWeight: 600 }}>{booking.date}</div>
                        <div className="table-subtext" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Clock size={12} />
                          <span>{booking.startTime} - {booking.endTime} ({booking.durationMinutes}m)</span>
                        </div>
                      </td>

                      {/* Venue */}
                      <td>
                        <span style={{ fontSize: '0.825rem', color: 'var(--color-navy)' }}>
                          {formatVenueType(booking.venueType)}
                        </span>
                      </td>

                      {/* Status */}
                      <td>{getStatusBadge(booking.status)}</td>

                      {/* Requested (Created At) */}
                      <td>
                        <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                          {booking.createdAt ? new Date(booking.createdAt).toLocaleDateString() : '—'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="btn-table-action"
                          onClick={() => handleViewDetail(booking._id)}
                          title="View complete booking details"
                          aria-label={`View details for booking ${refId}`}
                        >
                          <Eye size={14} />
                          <span>Details</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination Bar */}
        {!isLoading && bookings.length > 0 && (
          <div className="pagination-bar">
            <div className="pagination-info">
              Showing page <strong>{pagination.page}</strong> of <strong>{pagination.totalPages}</strong> ({pagination.total} matching session{pagination.total === 1 ? '' : 's'})
            </div>
            <div className="pagination-controls">
              <button
                type="button"
                className="btn-pagination"
                disabled={pagination.page <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                aria-label="Previous page"
              >
                <ChevronLeft size={16} />
                <span>Previous</span>
              </button>
              <span className="pagination-page-indicator">
                {pagination.page} / {pagination.totalPages}
              </span>
              <button
                type="button"
                className="btn-pagination"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => setCurrentPage((p) => Math.min(pagination.totalPages, p + 1))}
                aria-label="Next page"
              >
                <span>Next</span>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Booking Details Modal */}
      {(selectedBookingDetail || isLoadingDetail || detailError) && (
        <div
          className="modal-backdrop"
          onClick={() => {
            setSelectedBookingDetail(null);
            setDetailError(null);
          }}
          role="presentation"
        >
          <div
            className="modal-card"
            style={{ maxWidth: '680px' }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="booking-detail-modal-title"
          >
            {/* Modal Header */}
            <div className="modal-header">
              <div className="modal-header-left">
                <div className="modal-avatar" style={{ backgroundColor: 'var(--color-navy)' }}>
                  <CalendarDays size={20} />
                </div>
                <div>
                  <h2 id="booking-detail-modal-title" className="modal-title">
                    Session Ref #{selectedBookingDetail?._id.slice(-6).toUpperCase() ?? '...'}
                  </h2>
                  <div className="modal-subtitle">
                    {selectedBookingDetail && getStatusBadge(selectedBookingDetail.status)}
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="modal-btn-close"
                onClick={() => {
                  setSelectedBookingDetail(null);
                  setDetailError(null);
                }}
                aria-label="Close modal"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="modal-body">
              {isLoadingDetail ? (
                <div style={{ padding: '36px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                  <RefreshCw size={24} className="spin-icon" style={{ margin: '0 auto 12px auto' }} />
                  <div>Loading complete session details from database...</div>
                </div>
              ) : detailError ? (
                <div className="management-alert management-alert-error">
                  <AlertCircle size={18} />
                  <div className="alert-content">{detailError}</div>
                </div>
              ) : selectedBookingDetail ? (
                <>
                  {/* Cancellation Alert if Cancelled */}
                  {selectedBookingDetail.status === 'cancelled' && (
                    <div className="cancellation-alert-box">
                      <div className="cancellation-alert-title">
                        <XCircle size={18} />
                        <span>
                          Cancelled by {selectedBookingDetail.cancelledBy === 'coach' ? 'Coach' : 'Customer'}
                        </span>
                      </div>
                      <div className="cancellation-alert-desc">
                        <strong>Reason: </strong>
                        {selectedBookingDetail.cancellationReason || 'No specific cancellation explanation recorded.'}
                      </div>
                      {selectedBookingDetail.updatedAt && (
                        <div style={{ fontSize: '0.75rem', opacity: 0.85, marginTop: '2px' }}>
                          Cancelled on: {new Date(selectedBookingDetail.updatedAt).toLocaleString()}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Rejection / Declined Alert if Rejected */}
                  {selectedBookingDetail.status === 'rejected' && (
                    <div className="cancellation-alert-box" style={{ backgroundColor: '#FEF2F2', borderColor: '#F87171' }}>
                      <div className="cancellation-alert-title">
                        <AlertTriangle size={18} />
                        <span>Declined by Coach</span>
                      </div>
                      <div className="cancellation-alert-desc">
                        <strong>Reason: </strong>
                        {selectedBookingDetail.rejectionReason || 'No specific decline explanation provided.'}
                      </div>
                    </div>
                  )}

                  {/* Completion Notice if Completed */}
                  {selectedBookingDetail.status === 'completed' && (
                    <div
                      className="cancellation-alert-box"
                      style={{ backgroundColor: '#F0FDF4', borderColor: '#86EFAC', color: '#166534' }}
                    >
                      <div className="cancellation-alert-title">
                        <CheckCircle size={18} />
                        <span>Session Completed Successfully</span>
                      </div>
                      <div className="cancellation-alert-desc" style={{ fontSize: '0.8rem' }}>
                        Training session concluded on schedule. Completion record recorded in database.
                      </div>
                    </div>
                  )}

                  {/* Customer Information Section */}
                  <div>
                    <h3 className="detail-section-title">Customer Information</h3>
                    <div className="detail-grid">
                      <div className="detail-field">
                        <span className="detail-field-label">Customer Name</span>
                        <span className="detail-field-value">
                          <User size={14} />
                          {selectedBookingDetail.customer?.name || '—'}
                        </span>
                      </div>
                      <div className="detail-field">
                        <span className="detail-field-label">Account Role</span>
                        <span className="detail-field-value">
                          {selectedBookingDetail.customer?.role === 'parent' ? 'Parent / Guardian' : 'Individual Trainee'}
                        </span>
                      </div>
                      <div className="detail-field">
                        <span className="detail-field-label">Email Address</span>
                        <span className="detail-field-value">
                          <Mail size={14} />
                          {selectedBookingDetail.customer?.email || '—'}
                        </span>
                      </div>
                      <div className="detail-field">
                        <span className="detail-field-label">Contact Phone</span>
                        <span className="detail-field-value">
                          <Phone size={14} />
                          {selectedBookingDetail.customer?.customerPhone || 'Not recorded'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Coach Information Section */}
                  <div>
                    <h3 className="detail-section-title">Coach Information</h3>
                    <div className="detail-grid">
                      <div className="detail-field">
                        <span className="detail-field-label">Coach Name</span>
                        <span className="detail-field-value">
                          <Shield size={14} />
                          {selectedBookingDetail.coach?.name || '—'}
                        </span>
                      </div>
                      <div className="detail-field">
                        <span className="detail-field-label">Coach Email</span>
                        <span className="detail-field-value">
                          <Mail size={14} />
                          {selectedBookingDetail.coach?.email || '—'}
                        </span>
                      </div>
                      <div className="detail-field" style={{ gridColumn: 'span 2' }}>
                        <span className="detail-field-label">Coach Disciplines &amp; Specialties</span>
                        <span className="detail-field-value" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {selectedBookingDetail.coach?.profile?.disciplines && selectedBookingDetail.coach.profile.disciplines.length > 0 ? (
                            selectedBookingDetail.coach.profile.disciplines.map((d) => (
                              <span key={d} className="sport-pill">{d}</span>
                            ))
                          ) : (
                            <span style={{ color: 'var(--color-text-muted)' }}>No profile disciplines listed</span>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Session & Logistics Section */}
                  <div>
                    <h3 className="detail-section-title">Session Scheduling &amp; Logistics</h3>
                    <div className="detail-grid">
                      <div className="detail-field">
                        <span className="detail-field-label">Sport Discipline</span>
                        <span className="detail-field-value">
                          <span className="sport-pill">
                            {selectedBookingDetail.sport.toUpperCase()}
                          </span>
                        </span>
                      </div>
                      <div className="detail-field">
                        <span className="detail-field-label">Session Schedule</span>
                        <span className="detail-field-value">
                          <Calendar size={14} />
                          {selectedBookingDetail.date} ({selectedBookingDetail.startTime} - {selectedBookingDetail.endTime})
                        </span>
                      </div>
                      <div className="detail-field">
                        <span className="detail-field-label">Duration</span>
                        <span className="detail-field-value">
                          <Clock size={14} />
                          {selectedBookingDetail.durationMinutes} minutes
                        </span>
                      </div>
                      <div className="detail-field">
                        <span className="detail-field-label">Venue Type</span>
                        <span className="detail-field-value">
                          {formatVenueType(selectedBookingDetail.venueType)}
                        </span>
                      </div>
                      <div className="detail-field" style={{ gridColumn: 'span 2' }}>
                        <span className="detail-field-label">Training Location Address</span>
                        <span className="detail-field-value" style={{ wordBreak: 'break-word' }}>
                          <MapPin size={14} style={{ flexShrink: 0 }} />
                          {selectedBookingDetail.trainingAddress || 'No physical address provided.'}
                        </span>
                      </div>
                      {selectedBookingDetail.hourlyRateSnapshot !== undefined && (
                        <div className="detail-field">
                          <span className="detail-field-label">Rate Snapshot at Booking</span>
                          <span className="detail-field-value">
                            <DollarSign size={14} />
                            ₹{selectedBookingDetail.hourlyRateSnapshot}/hr
                            <span style={{ fontSize: '0.725rem', color: 'var(--color-text-muted)', fontWeight: 400 }}>
                              (Snapshot only)
                            </span>
                          </span>
                        </div>
                      )}
                      <div className="detail-field">
                        <span className="detail-field-label">Full Booking ID</span>
                        <span className="detail-field-value mono-text">
                          {selectedBookingDetail._id}
                        </span>
                      </div>
                    </div>
                  </div>
                </>
              ) : null}
            </div>

            {/* Modal Footer */}
            <div className="modal-footer">
              <button
                type="button"
                className="btn-management-action"
                onClick={() => {
                  setSelectedBookingDetail(null);
                  setDetailError(null);
                }}
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
