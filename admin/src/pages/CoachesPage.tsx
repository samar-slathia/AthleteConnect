import React, { useState, useEffect, useCallback, useId } from 'react';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Search,
  Filter,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Eye,
  Power,
  ChevronLeft,
  ChevronRight,
  X,
  Calendar,
  Mail,
  MapPin,
  DollarSign,
  Activity,
  Layers,
} from 'lucide-react';
import {
  fetchAdminCoaches,
  fetchAdminCoachDetail,
  updateAdminUserStatus,
  ApiError,
} from '../services/api';
import type {
  CoachUser,
  PaginationMeta,
  CoachSummary,
  CoachDetailResponse,
} from '../services/api';

export const CoachesPage: React.FC = () => {
  const searchInputId = useId();
  const statusSelectId = useId();
  const disciplineSelectId = useId();
  const [coaches, setCoaches] = useState<CoachUser[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });
  const [summary, setSummary] = useState<CoachSummary | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [disciplineFilter, setDisciplineFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Toast notification
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Coach Detail Modal
  const [selectedCoachDetail, setSelectedCoachDetail] = useState<CoachDetailResponse | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState<boolean>(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Activation Confirmation Modal
  const [statusTargetCoach, setStatusTargetCoach] = useState<CoachUser | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<boolean>(false);

  const loadCoaches = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetchAdminCoaches({
        page: currentPage,
        limit: 10,
        search: search.trim() || undefined,
        status: statusFilter,
        discipline: disciplineFilter,
      });
      setCoaches(response.coaches);
      setPagination(response.pagination);
      setSummary(response.summary);
    } catch (err: any) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to retrieve coaches directory.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, search, statusFilter, disciplineFilter]);

  useEffect(() => {
    let active = true;

    fetchAdminCoaches({
      page: currentPage,
      limit: 10,
      search: search.trim() || undefined,
      status: statusFilter,
      discipline: disciplineFilter,
    })
      .then((response) => {
        if (active) {
          setCoaches(response.coaches);
          setPagination(response.pagination);
          setSummary(response.summary);
          setIsLoading(false);
        }
      })
      .catch((err: any) => {
        if (active) {
          if (err instanceof ApiError) {
            setError(err.message);
          } else {
            setError('Failed to retrieve coaches directory.');
          }
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [currentPage, search, statusFilter, disciplineFilter]);

  const handleConfirmStatusChange = async () => {
    if (!statusTargetCoach) return;
    setIsUpdatingStatus(true);
    try {
      const nextStatus = !statusTargetCoach.isActive;
      const response = await updateAdminUserStatus(statusTargetCoach._id, nextStatus);
      setToast({ type: 'success', message: response.message });
      setStatusTargetCoach(null);
      await loadCoaches();
    } catch (err: any) {
      setToast({
        type: 'error',
        message: err.message || 'Failed to update coach status.',
      });
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleOpenDetail = async (coach: CoachUser) => {
    setIsLoadingDetail(true);
    setDetailError(null);
    setSelectedCoachDetail({ coach, profile: coach.profile, bookingCount: 0 });
    try {
      const detail = await fetchAdminCoachDetail(coach._id);
      setSelectedCoachDetail(detail);
    } catch (err: any) {
      setDetailError(err.message || 'Could not load full coach profile.');
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleClearFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setDisciplineFilter('all');
    setCurrentPage(1);
  };

  const hasActiveFilters =
    search.trim() !== '' || statusFilter !== 'all' || disciplineFilter !== 'all';

  const formatDisciplinePill = (discipline: string) => {
    return discipline.charAt(0).toUpperCase() + discipline.slice(1);
  };

  return (
    <div className="management-page">
      {/* Toast Notification */}
      {toast && (
        <div className={`management-toast toast-${toast.type}`} role="alert">
          {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span>{toast.message}</span>
          <button
            type="button"
            className="toast-close"
            onClick={() => setToast(null)}
            aria-label="Dismiss notice"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Page Header */}
      <div className="management-header">
        <div>
          <h1 className="management-title">Coaches Management</h1>
          <p className="management-subtitle">
            Certified martial arts trainer directory, profile completeness, and account governance.
          </p>
        </div>
        <div className="management-actions">
          <button
            type="button"
            className="btn-secondary btn-refresh"
            onClick={loadCoaches}
            disabled={isLoading}
            aria-label="Refresh coaches list"
          >
            <RefreshCw size={15} className={isLoading ? 'spin-icon' : undefined} />
            <span>{isLoading ? 'Syncing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* Summary Stat Cards */}
      <div className="management-stats-grid">
        <div className="m-stat-card">
          <div className="m-stat-header">
            <span className="m-stat-label">Total Coaches</span>
            <span className="m-stat-icon icon-primary">
              <Shield size={18} />
            </span>
          </div>
          <div className="m-stat-value">{summary?.totalCoaches.toLocaleString() ?? '—'}</div>
          <div className="m-stat-footnote">All registered martial arts coaches</div>
        </div>

        <div className="m-stat-card">
          <div className="m-stat-header">
            <span className="m-stat-label">Active Coaches</span>
            <span className="m-stat-icon icon-success">
              <CheckCircle2 size={18} />
            </span>
          </div>
          <div className="m-stat-value">{summary?.activeCoaches.toLocaleString() ?? '—'}</div>
          <div className="m-stat-footnote">Eligible for discovery &amp; bookings</div>
        </div>

        <div className="m-stat-card">
          <div className="m-stat-header">
            <span className="m-stat-label">Inactive Coaches</span>
            <span className="m-stat-icon icon-danger">
              <ShieldAlert size={18} />
            </span>
          </div>
          <div className="m-stat-value">{summary?.inactiveCoaches.toLocaleString() ?? '—'}</div>
          <div className="m-stat-footnote">Deactivated or unverified trainers</div>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="panel management-toolbar-panel">
        <div className="management-toolbar">
          <div className="toolbar-search">
            <label htmlFor={searchInputId} className="visually-hidden">
              Search coaches by name or email
            </label>
            <Search size={16} className="search-icon" />
            <input
              id={searchInputId}
              type="text"
              placeholder="Search by coach name or email..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              className="toolbar-input"
            />
          </div>

          <div className="toolbar-filters">
            <div className="toolbar-select-group">
              <label htmlFor={statusSelectId} className="toolbar-label">
                Status:
              </label>
              <select
                id={statusSelectId}
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="toolbar-select"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active Only</option>
                <option value="inactive">Inactive Only</option>
              </select>
            </div>

            <div className="toolbar-select-group">
              <label htmlFor={disciplineSelectId} className="toolbar-label">
                Discipline:
              </label>
              <select
                id={disciplineSelectId}
                value={disciplineFilter}
                onChange={(e) => {
                  setDisciplineFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="toolbar-select"
              >
                <option value="all">All Disciplines</option>
                <option value="boxing">Boxing</option>
                <option value="wushu">Wushu</option>
                <option value="kickboxing">Kickboxing</option>
              </select>
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                className="btn-clear-filters"
                onClick={handleClearFilters}
                title="Reset all filters"
              >
                <Filter size={14} /> Clear
              </button>
            )}
          </div>
        </div>

        {/* Error Panel */}
        {error && (
          <div className="error-panel" role="alert" style={{ marginTop: '16px' }}>
            <div className="error-panel-content">
              <AlertCircle size={20} className="error-panel-icon" />
              <div>
                <div className="error-panel-title">Failed to load coach directory</div>
                <div className="error-panel-message">{error}</div>
              </div>
            </div>
            <button
              type="button"
              className="btn-secondary btn-retry"
              onClick={loadCoaches}
            >
              Retry
            </button>
          </div>
        )}

        {/* Table Content */}
        {isLoading ? (
          <div className="table-skeleton-wrapper" style={{ padding: '24px 0' }}>
            <div className="skeleton-row"></div>
            <div className="skeleton-row"></div>
            <div className="skeleton-row"></div>
            <div className="skeleton-row"></div>
          </div>
        ) : coaches.length === 0 ? (
          <div className="honest-empty-state" style={{ padding: '48px 16px' }}>
            <div className="empty-icon-wrapper">
              <ShieldCheck size={32} />
            </div>
            <h2 className="empty-title">
              {hasActiveFilters ? 'No Matching Coaches' : 'No Coaches Registered'}
            </h2>
            <p className="empty-description">
              {hasActiveFilters
                ? 'No coaches matched your search and filter criteria. Try resetting your filters.'
                : 'There are currently zero coach accounts registered in the database.'}
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                className="btn-secondary"
                onClick={handleClearFilters}
                style={{ marginTop: '12px' }}
              >
                Clear Filters
              </button>
            )}
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="demo-table management-table">
              <thead>
                <tr>
                  <th>Coach Name</th>
                  <th>Email Address</th>
                  <th>Sports Disciplines</th>
                  <th>Rate / Completeness</th>
                  <th>Account Status</th>
                  <th>Registration Date</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {coaches.map((coach) => (
                  <tr key={coach._id}>
                    <td>
                      <div className="user-cell">
                        <div className="coach-avatar-sm" aria-hidden="true">
                          {coach.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="user-name-text">{coach.name}</span>
                      </div>
                    </td>
                    <td>
                      <span className="user-email-text">{coach.email}</span>
                    </td>
                    <td>
                      <div className="discipline-badges-wrapper">
                        {coach.profile?.disciplines && coach.profile.disciplines.length > 0 ? (
                          coach.profile.disciplines.map((d) => (
                            <span key={d} className="sport-pill">
                              {formatDisciplinePill(d)}
                            </span>
                          ))
                        ) : (
                          <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                            Unconfigured
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        {coach.profile?.hourlyRate ? (
                          <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                            ₹{coach.profile.hourlyRate.toLocaleString()}/hr
                          </span>
                        ) : (
                          <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                            Rate unassigned
                          </span>
                        )}
                        <span style={{ fontSize: '0.725rem' }}>
                          {coach.profile?.isComplete ? (
                            <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>
                              Profile Ready
                            </span>
                          ) : (
                            <span style={{ color: 'var(--color-warning)', fontWeight: 600 }}>
                              Incomplete Profile
                            </span>
                          )}
                        </span>
                      </div>
                    </td>
                    <td>
                      {coach.isActive ? (
                        <span className="badge-status badge-verified">Active</span>
                      ) : (
                        <span className="badge-status badge-declined">Inactive</span>
                      )}
                    </td>
                    <td>
                      <span className="date-cell">
                        {new Date(coach.createdAt).toLocaleDateString()}
                      </span>
                    </td>
                    <td>
                      <div className="action-buttons-cell">
                        <button
                          type="button"
                          className="btn-action-view"
                          onClick={() => handleOpenDetail(coach)}
                          title="View complete coach profile and compliance data"
                          aria-label={`View details for ${coach.name}`}
                        >
                          <Eye size={14} /> View Details
                        </button>
                        <button
                          type="button"
                          className={`btn-action-status ${
                            coach.isActive ? 'btn-deactivate' : 'btn-activate'
                          }`}
                          onClick={() => setStatusTargetCoach(coach)}
                          title={coach.isActive ? 'Deactivate coach account' : 'Activate coach account'}
                          aria-label={`${coach.isActive ? 'Deactivate' : 'Activate'} ${coach.name}`}
                        >
                          <Power size={13} />
                          {coach.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {!isLoading && coaches.length > 0 && (
          <div className="pagination-bar">
            <div className="pagination-info">
              Showing {(pagination.page - 1) * pagination.limit + 1}–
              {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
              {pagination.total} coaches
            </div>
            <div className="pagination-controls">
              <button
                type="button"
                className="btn-pagination"
                disabled={pagination.page <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                aria-label="Previous page"
              >
                <ChevronLeft size={16} /> Prev
              </button>
              <span className="pagination-page-indicator">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                type="button"
                className="btn-pagination"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => setCurrentPage((p) => Math.min(pagination.totalPages, p + 1))}
                aria-label="Next page"
              >
                Next <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Coach Detail Modal */}
      {selectedCoachDetail && (
        <div className="modal-backdrop" onClick={() => setSelectedCoachDetail(null)}>
          <div
            className="modal-card detail-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="coach-detail-heading"
          >
            <div className="modal-header">
              <div className="modal-header-left">
                <div className="coach-avatar-lg">
                  {selectedCoachDetail.coach.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 id="coach-detail-heading" className="modal-title">
                    {selectedCoachDetail.coach.name}
                  </h2>
                  <span className="modal-subtitle">Certified Martial Arts Trainer Profile</span>
                </div>
              </div>
              <button
                type="button"
                className="modal-btn-close"
                onClick={() => setSelectedCoachDetail(null)}
                aria-label="Close coach details"
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              {isLoadingDetail && <div className="skeleton-row" style={{ height: '32px' }}></div>}
              {detailError && (
                <div className="error-panel" style={{ marginBottom: '16px' }}>
                  <AlertCircle size={16} /> <span>{detailError}</span>
                </div>
              )}

              {/* Account Overview */}
              <div className="detail-section">
                <h3 className="detail-section-title">Trainer Account Summary</h3>
                <div className="detail-grid">
                  <div className="detail-field">
                    <span className="detail-field-label">Email Address</span>
                    <span className="detail-field-value">
                      <Mail size={14} /> {selectedCoachDetail.coach.email}
                    </span>
                  </div>

                  <div className="detail-field">
                    <span className="detail-field-label">Account Status</span>
                    <span className="detail-field-value">
                      {selectedCoachDetail.coach.isActive ? (
                        <span className="badge-status badge-verified">Active Account</span>
                      ) : (
                        <span className="badge-status badge-declined">Deactivated Account</span>
                      )}
                    </span>
                  </div>

                  <div className="detail-field">
                    <span className="detail-field-label">Total Assigned Bookings</span>
                    <span className="detail-field-value">
                      <Activity size={14} /> <strong>{selectedCoachDetail.bookingCount}</strong> training sessions
                    </span>
                  </div>

                  <div className="detail-field">
                    <span className="detail-field-label">Registration Date</span>
                    <span className="detail-field-value">
                      <Calendar size={14} />{' '}
                      {new Date(selectedCoachDetail.coach.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Profile Details (Only when present in database) */}
              <div className="detail-section">
                <h3 className="detail-section-title">Verified Coaching Profile</h3>
                {selectedCoachDetail.profile ? (
                  <div className="detail-grid">
                    <div className="detail-field" style={{ gridColumn: '1 / -1' }}>
                      <span className="detail-field-label">Biography</span>
                      <p className="detail-bio-text">
                        {selectedCoachDetail.profile.bio || 'No biography written by coach.'}
                      </p>
                    </div>

                    <div className="detail-field">
                      <span className="detail-field-label">Disciplines</span>
                      <div className="discipline-badges-wrapper" style={{ marginTop: '4px' }}>
                        {selectedCoachDetail.profile.disciplines?.map((d: string) => (
                          <span key={d} className="sport-pill">
                            {formatDisciplinePill(d)}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="detail-field">
                      <span className="detail-field-label">Hourly Rate</span>
                      <span className="detail-field-value">
                        <DollarSign size={14} />{' '}
                        {selectedCoachDetail.profile.hourlyRate
                          ? `₹${selectedCoachDetail.profile.hourlyRate.toLocaleString()} ${
                              selectedCoachDetail.profile.currency || 'INR'
                            }`
                          : 'Not configured'}
                      </span>
                    </div>

                    <div className="detail-field">
                      <span className="detail-field-label">Venue Types Offered</span>
                      <span className="detail-field-value">
                        <Layers size={14} />{' '}
                        {selectedCoachDetail.profile.venueTypes?.join(', ') || 'Standard ground'}
                      </span>
                    </div>

                    <div className="detail-field">
                      <span className="detail-field-label">Operating Locations</span>
                      <span className="detail-field-value">
                        <MapPin size={14} />{' '}
                        {selectedCoachDetail.profile.locations?.join(', ') || 'Not specified'}
                      </span>
                    </div>

                    {selectedCoachDetail.profile.specialties &&
                      selectedCoachDetail.profile.specialties.length > 0 && (
                        <div className="detail-field" style={{ gridColumn: '1 / -1' }}>
                          <span className="detail-field-label">Specialties</span>
                          <span className="detail-field-value">
                            {selectedCoachDetail.profile.specialties.join(' • ')}
                          </span>
                        </div>
                      )}
                  </div>
                ) : (
                  <div className="empty-profile-box">
                    <span>
                      This coach has registered an account but has not yet completed and saved their
                      coaching profile.
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setSelectedCoachDetail(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Activation / Deactivation Confirmation Dialog */}
      {statusTargetCoach && (
        <div className="modal-backdrop" onClick={() => setStatusTargetCoach(null)}>
          <div
            className="modal-card confirmation-modal"
            onClick={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="coach-status-title"
          >
            <div className="modal-header">
              <div className="confirm-icon-wrapper">
                <ShieldAlert size={24} className="confirm-icon" />
              </div>
              <h2 id="coach-status-title" className="modal-title">
                {statusTargetCoach.isActive ? 'Deactivate Coach Account' : 'Activate Coach Account'}
              </h2>
            </div>

            <div className="modal-body">
              <p className="confirm-text">
                Are you sure you want to{' '}
                <strong>{statusTargetCoach.isActive ? 'deactivate' : 'activate'}</strong> the coach
                account for <strong>{statusTargetCoach.name}</strong> ({statusTargetCoach.email})?
              </p>
              <div className="confirm-warning-box">
                {statusTargetCoach.isActive ? (
                  <span>
                    When deactivated, this coach will immediately be hidden from public discovery and
                    will not be able to accept training sessions. All past session records remain
                    preserved.
                  </span>
                ) : (
                  <span>
                    When activated, this coach will regain access to their portal and will be eligible
                    for trainee bookings.
                  </span>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setStatusTargetCoach(null)}
                disabled={isUpdatingStatus}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`btn-primary ${
                  statusTargetCoach.isActive ? 'btn-confirm-danger' : 'btn-confirm-success'
                }`}
                onClick={handleConfirmStatusChange}
                disabled={isUpdatingStatus}
              >
                {isUpdatingStatus ? (
                  <span className="btn-loading-content">
                    <span className="login-spinner" aria-hidden="true"></span>
                    <span>Updating...</span>
                  </span>
                ) : statusTargetCoach.isActive ? (
                  'Yes, Deactivate Coach'
                ) : (
                  'Yes, Activate Coach'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
