import React, { useState, useEffect, useCallback, useId } from 'react';
import {
  Users,
  UserCheck,
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
} from 'lucide-react';
import {
  fetchAdminUsers,
  fetchAdminUserDetail,
  updateAdminUserStatus,
  ApiError,
} from '../services/api';
import type {
  CustomerUser,
  PaginationMeta,
  CustomerSummary,
  UserDetailResponse,
} from '../services/api';

export const UsersPage: React.FC = () => {
  const searchInputId = useId();
  const roleSelectId = useId();
  const statusSelectId = useId();
  const [users, setUsers] = useState<CustomerUser[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });
  const [summary, setSummary] = useState<CustomerSummary | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Notification toast
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Detail Modal State
  const [selectedUserDetail, setSelectedUserDetail] = useState<UserDetailResponse | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState<boolean>(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Activation Confirmation Modal State
  const [statusTargetUser, setStatusTargetUser] = useState<CustomerUser | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<boolean>(false);

  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetchAdminUsers({
        page: currentPage,
        limit: 10,
        search: search.trim() || undefined,
        role: roleFilter,
        status: statusFilter,
      });
      setUsers(response.users);
      setPagination(response.pagination);
      setSummary(response.summary);
    } catch (err: any) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to retrieve customer accounts.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, search, roleFilter, statusFilter]);

  useEffect(() => {
    let active = true;

    fetchAdminUsers({
      page: currentPage,
      limit: 10,
      search: search.trim() || undefined,
      role: roleFilter,
      status: statusFilter,
    })
      .then((response) => {
        if (active) {
          setUsers(response.users);
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
            setError('Failed to retrieve customer accounts.');
          }
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [currentPage, search, roleFilter, statusFilter]);

  // Handle status toggle action
  const handleConfirmStatusChange = async () => {
    if (!statusTargetUser) return;
    setIsUpdatingStatus(true);
    try {
      const nextStatus = !statusTargetUser.isActive;
      const response = await updateAdminUserStatus(statusTargetUser._id, nextStatus);
      setToast({ type: 'success', message: response.message });
      setStatusTargetUser(null);
      // Reload list
      await loadUsers();
    } catch (err: any) {
      setToast({
        type: 'error',
        message: err.message || 'Failed to update account status.',
      });
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // Open detail modal
  const handleOpenDetail = async (user: CustomerUser) => {
    setIsLoadingDetail(true);
    setDetailError(null);
    setSelectedUserDetail({ user, bookingCount: 0 });
    try {
      const detail = await fetchAdminUserDetail(user._id);
      setSelectedUserDetail(detail);
    } catch (err: any) {
      setDetailError(err.message || 'Could not load complete user profile.');
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleClearFilters = () => {
    setSearch('');
    setRoleFilter('all');
    setStatusFilter('all');
    setCurrentPage(1);
  };

  const hasActiveFilters = search.trim() !== '' || roleFilter !== 'all' || statusFilter !== 'all';

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
          <h1 className="management-title">Users Management</h1>
          <p className="management-subtitle">
            Customer account governance for Parents/Guardians and Individual trainees.
          </p>
        </div>
        <div className="management-actions">
          <button
            type="button"
            className="btn-secondary btn-refresh"
            onClick={loadUsers}
            disabled={isLoading}
            aria-label="Refresh user accounts"
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
            <span className="m-stat-label">Total Customers</span>
            <span className="m-stat-icon icon-primary">
              <Users size={18} />
            </span>
          </div>
          <div className="m-stat-value">{summary?.totalCustomers.toLocaleString() ?? '—'}</div>
          <div className="m-stat-footnote">Parents &amp; Individuals combined</div>
        </div>

        <div className="m-stat-card">
          <div className="m-stat-header">
            <span className="m-stat-label">Parents / Guardians</span>
            <span className="m-stat-icon">
              <Users size={18} />
            </span>
          </div>
          <div className="m-stat-value">{summary?.parentCount.toLocaleString() ?? '—'}</div>
          <div className="m-stat-footnote">Managing youth athlete bookings</div>
        </div>

        <div className="m-stat-card">
          <div className="m-stat-header">
            <span className="m-stat-label">Individual Customers</span>
            <span className="m-stat-icon">
              <UserCheck size={18} />
            </span>
          </div>
          <div className="m-stat-value">{summary?.individualCount.toLocaleString() ?? '—'}</div>
          <div className="m-stat-footnote">Direct adult participants</div>
        </div>

        <div className="m-stat-card">
          <div className="m-stat-header">
            <span className="m-stat-label">Account Status</span>
            <span className="m-stat-icon icon-success">
              <CheckCircle2 size={18} />
            </span>
          </div>
          <div className="m-stat-value">
            {summary ? `${summary.activeCount} Active` : '—'}
          </div>
          <div className="m-stat-footnote">
            {summary ? `${summary.inactiveCount} Deactivated` : ''}
          </div>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="panel management-toolbar-panel">
        <div className="management-toolbar">
          <div className="toolbar-search">
            <label htmlFor={searchInputId} className="visually-hidden">
              Search by name or email
            </label>
            <Search size={16} className="search-icon" />
            <input
              id={searchInputId}
              type="text"
              placeholder="Search by name or email..."
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
              <label htmlFor={roleSelectId} className="toolbar-label">
                Role:
              </label>
              <select
                id={roleSelectId}
                value={roleFilter}
                onChange={(e) => {
                  setRoleFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="toolbar-select"
              >
                <option value="all">All Roles</option>
                <option value="parent">Parent / Guardian</option>
                <option value="individual">Individual Customer</option>
              </select>
            </div>

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
                <div className="error-panel-title">Failed to load customer records</div>
                <div className="error-panel-message">{error}</div>
              </div>
            </div>
            <button
              type="button"
              className="btn-secondary btn-retry"
              onClick={loadUsers}
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
        ) : users.length === 0 ? (
          <div className="honest-empty-state" style={{ padding: '48px 16px' }}>
            <div className="empty-icon-wrapper">
              <Users size={32} />
            </div>
            <h2 className="empty-title">
              {hasActiveFilters ? 'No Matching Customers' : 'No Customer Accounts Found'}
            </h2>
            <p className="empty-description">
              {hasActiveFilters
                ? 'No customer accounts matched your search and filter criteria. Try adjusting or clearing your filters.'
                : 'There are currently zero customer accounts in the database.'}
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
                  <th>Customer Name</th>
                  <th>Email Address</th>
                  <th>Account Type</th>
                  <th>Account Status</th>
                  <th>Registration Date</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user._id}>
                    <td>
                      <div className="user-cell">
                        <div className="user-avatar-sm" aria-hidden="true">
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="user-name-text">{user.name}</span>
                      </div>
                    </td>
                    <td>
                      <span className="user-email-text">{user.email}</span>
                    </td>
                    <td>
                      <span
                        className={`badge-role ${
                          user.role === 'parent' ? 'badge-parent' : 'badge-individual'
                        }`}
                      >
                        {user.role === 'parent' ? 'Parent / Guardian' : 'Individual'}
                      </span>
                    </td>
                    <td>
                      {user.isActive ? (
                        <span className="badge-status badge-verified">Active</span>
                      ) : (
                        <span className="badge-status badge-declined">Inactive</span>
                      )}
                    </td>
                    <td>
                      <span className="date-cell">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </span>
                    </td>
                    <td>
                      <div className="action-buttons-cell">
                        <button
                          type="button"
                          className="btn-action-view"
                          onClick={() => handleOpenDetail(user)}
                          title="View complete customer details"
                          aria-label={`View details for ${user.name}`}
                        >
                          <Eye size={14} /> View Details
                        </button>
                        <button
                          type="button"
                          className={`btn-action-status ${
                            user.isActive ? 'btn-deactivate' : 'btn-activate'
                          }`}
                          onClick={() => setStatusTargetUser(user)}
                          title={user.isActive ? 'Deactivate account' : 'Activate account'}
                          aria-label={`${user.isActive ? 'Deactivate' : 'Activate'} ${user.name}`}
                        >
                          <Power size={13} />
                          {user.isActive ? 'Deactivate' : 'Activate'}
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
        {!isLoading && users.length > 0 && (
          <div className="pagination-bar">
            <div className="pagination-info">
              Showing {(pagination.page - 1) * pagination.limit + 1}–
              {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
              {pagination.total} accounts
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

      {/* Detail Modal / Drawer */}
      {selectedUserDetail && (
        <div className="modal-backdrop" onClick={() => setSelectedUserDetail(null)}>
          <div
            className="modal-card detail-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="user-detail-heading"
          >
            <div className="modal-header">
              <div className="modal-header-left">
                <div className="modal-avatar">
                  {selectedUserDetail.user.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 id="user-detail-heading" className="modal-title">
                    {selectedUserDetail.user.name}
                  </h2>
                  <span className="modal-subtitle">
                    {selectedUserDetail.user.role === 'parent'
                      ? 'Parent / Guardian Account'
                      : 'Individual Customer Account'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="modal-btn-close"
                onClick={() => setSelectedUserDetail(null)}
                aria-label="Close user details"
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

              <div className="detail-section">
                <h3 className="detail-section-title">Verified Account Information</h3>
                <div className="detail-grid">
                  <div className="detail-field">
                    <span className="detail-field-label">Email Address</span>
                    <span className="detail-field-value">
                      <Mail size={14} /> {selectedUserDetail.user.email}
                    </span>
                  </div>

                  <div className="detail-field">
                    <span className="detail-field-label">Account Status</span>
                    <span className="detail-field-value">
                      {selectedUserDetail.user.isActive ? (
                        <span className="badge-status badge-verified">Active</span>
                      ) : (
                        <span className="badge-status badge-declined">Deactivated</span>
                      )}
                    </span>
                  </div>

                  <div className="detail-field">
                    <span className="detail-field-label">User ID</span>
                    <span className="detail-field-value mono-text">
                      {selectedUserDetail.user._id}
                    </span>
                  </div>

                  <div className="detail-field">
                    <span className="detail-field-label">Registered Date</span>
                    <span className="detail-field-value">
                      <Calendar size={14} />{' '}
                      {new Date(selectedUserDetail.user.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="detail-field">
                    <span className="detail-field-label">Session Bookings Placed</span>
                    <span className="detail-field-value">
                      <strong>{selectedUserDetail.bookingCount}</strong> total training bookings
                    </span>
                  </div>

                  <div className="detail-field">
                    <span className="detail-field-label">Profile Photo</span>
                    <span className="detail-field-value">
                      {selectedUserDetail.user.photoFileId ? 'Uploaded (GridFS)' : 'None (Default Avatar)'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setSelectedUserDetail(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Activation / Deactivation Confirmation Dialog */}
      {statusTargetUser && (
        <div className="modal-backdrop" onClick={() => setStatusTargetUser(null)}>
          <div
            className="modal-card confirmation-modal"
            onClick={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="status-confirm-title"
          >
            <div className="modal-header">
              <div className="confirm-icon-wrapper">
                <ShieldAlert size={24} className="confirm-icon" />
              </div>
              <h2 id="status-confirm-title" className="modal-title">
                {statusTargetUser.isActive ? 'Deactivate Account' : 'Activate Account'}
              </h2>
            </div>

            <div className="modal-body">
              <p className="confirm-text">
                Are you sure you want to{' '}
                <strong>{statusTargetUser.isActive ? 'deactivate' : 'activate'}</strong> the customer
                account for <strong>{statusTargetUser.name}</strong> ({statusTargetUser.email})?
              </p>
              <div className="confirm-warning-box">
                {statusTargetUser.isActive ? (
                  <span>
                    When deactivated, this user will immediately be barred from logging in or booking
                    training sessions. Existing past booking records remain preserved.
                  </span>
                ) : (
                  <span>
                    When activated, this user will regain full access to their AthleteConnect account
                    and mobile application features.
                  </span>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setStatusTargetUser(null)}
                disabled={isUpdatingStatus}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`btn-primary ${
                  statusTargetUser.isActive ? 'btn-confirm-danger' : 'btn-confirm-success'
                }`}
                onClick={handleConfirmStatusChange}
                disabled={isUpdatingStatus}
              >
                {isUpdatingStatus ? (
                  <span className="btn-loading-content">
                    <span className="login-spinner" aria-hidden="true"></span>
                    <span>Updating...</span>
                  </span>
                ) : statusTargetUser.isActive ? (
                  'Yes, Deactivate Account'
                ) : (
                  'Yes, Activate Account'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
