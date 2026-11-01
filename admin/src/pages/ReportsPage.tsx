import React, { useState, useEffect, useCallback, useId } from 'react';
import {
  Calendar,
  Users,
  Shield,
  CalendarDays,
  CheckCircle,
  Clock,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Download,
  AlertCircle,
  Info,
  Layers,
} from 'lucide-react';
import {
  fetchAdminAnalytics,
  downloadAdminReportCsv,
  ApiError,
} from '../services/api';
import type { AnalyticsResponse } from '../services/api';

export const ReportsPage: React.FC = () => {
  const rangeSelectId = useId();
  const sportSelectId = useId();
  const statusSelectId = useId();
  const customStartId = useId();
  const customEndId = useId();

  const [range, setRange] = useState<string>('last30days');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [sportFilter, setSportFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Export state
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportToast, setExportToast] = useState<string | null>(null);

  const loadAnalytics = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetchAdminAnalytics({
        range,
        startDate: range === 'custom' ? customStart : undefined,
        endDate: range === 'custom' ? customEnd : undefined,
        sport: sportFilter,
        status: statusFilter,
      });
      setAnalytics(response);
    } catch (err: any) {
      if (err instanceof ApiError) {
        setError(`Failed to retrieve analytics: ${err.message}`);
      } else {
        setError('Network or system error while communicating with AthleteConnect backend.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [range, customStart, customEnd, sportFilter, statusFilter]);

  useEffect(() => {
    let active = true;

    fetchAdminAnalytics({
      range,
      startDate: range === 'custom' ? customStart : undefined,
      endDate: range === 'custom' ? customEnd : undefined,
      sport: sportFilter,
      status: statusFilter,
    })
      .then((response) => {
        if (active) {
          setAnalytics(response);
          setIsLoading(false);
        }
      })
      .catch((err: any) => {
        if (active) {
          if (err instanceof ApiError) {
            setError(`Failed to retrieve analytics: ${err.message}`);
          } else {
            setError('Network or system error while communicating with AthleteConnect backend.');
          }
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [range, customStart, customEnd, sportFilter, statusFilter]);

  const handleExport = async (type: 'bookings' | 'users' | 'sports' | 'cancellations') => {
    setIsExporting(true);
    setExportToast(null);
    try {
      await downloadAdminReportCsv(type, {
        range,
        startDate: range === 'custom' ? customStart : undefined,
        endDate: range === 'custom' ? customEnd : undefined,
        sport: sportFilter,
        status: statusFilter,
      });
      setExportToast(`Exported ${type} report successfully.`);
      setTimeout(() => setExportToast(null), 4000);
    } catch (err: any) {
      setExportToast(
        err instanceof ApiError
          ? `Export failed: ${err.message}`
          : 'CSV generation failed.'
      );
      setTimeout(() => setExportToast(null), 5000);
    } finally {
      setIsExporting(false);
    }
  };

  const handleResetFilters = () => {
    setRange('last30days');
    setCustomStart('');
    setCustomEnd('');
    setSportFilter('all');
    setStatusFilter('all');
  };

  return (
    <div className="management-page-container">
      {/* Page Header */}
      <div className="management-header">
        <div>
          <h1 className="management-title">Operational Reports &amp; Analytics</h1>
          <p className="management-subtitle">
            Verifiable growth trends, booking throughput, discipline distribution, and coach compliance analytics.
          </p>
        </div>
        <div className="management-header-actions">
          <button
            type="button"
            className="btn-management-action"
            onClick={() => loadAnalytics()}
            disabled={isLoading}
            aria-label="Refresh analytics data"
          >
            <RefreshCw size={15} className={isLoading ? 'spin-icon' : undefined} />
            <span>{isLoading ? 'Syncing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* Financial Reporting Notice Banner (Part 6) */}
      <div className="report-financial-notice" role="note">
        <Info size={22} className="notice-icon" />
        <div>
          <div className="notice-title">Financial Reporting Safety Notice</div>
          <div className="notice-desc">
            Financial reporting will become available after verified payment transaction integration.
            Per AthleteConnect data governance policies, gross merchandise volume (GMV), platform commission splits,
            and coach payout balances are not estimated or simulated.
          </div>
        </div>
      </div>

      {/* Filter and Date Range Toolbar (Part 2) */}
      <section className="panel management-toolbar-panel">
        <div className="management-toolbar">
          {/* Date Range Selector */}
          <div className="filter-select-wrapper">
            <Calendar size={14} color="var(--color-text-secondary)" />
            <label htmlFor={rangeSelectId} className="sr-only">Date Range</label>
            <select
              id={rangeSelectId}
              value={range}
              onChange={(e) => setRange(e.target.value)}
              aria-label="Reporting Date Range"
            >
              <option value="today">Today</option>
              <option value="last7days">Last 7 Days</option>
              <option value="last30days">Last 30 Days</option>
              <option value="last90days">Last 90 Days</option>
              <option value="thisMonth">This Month</option>
              <option value="thisYear">This Year</option>
              <option value="custom">Custom Date Range</option>
              <option value="all">All Time</option>
            </select>
          </div>

          {/* Custom Date Pickers (only shown if range === 'custom') */}
          {range === 'custom' && (
            <>
              <div className="date-input-wrapper">
                <span className="date-input-label">From:</span>
                <label htmlFor={customStartId} className="sr-only">Start Date</label>
                <input
                  id={customStartId}
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                />
              </div>
              <div className="date-input-wrapper">
                <span className="date-input-label">To:</span>
                <label htmlFor={customEndId} className="sr-only">End Date</label>
                <input
                  id={customEndId}
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                />
              </div>
            </>
          )}

          {/* Sport Filter */}
          <div className="filter-select-wrapper">
            <label htmlFor={sportSelectId} className="sr-only">Sport Filter</label>
            <select
              id={sportSelectId}
              value={sportFilter}
              onChange={(e) => setSportFilter(e.target.value)}
              aria-label="Filter by sport"
            >
              <option value="all">All Sports</option>
              <option value="boxing">Boxing</option>
              <option value="wushu">Wushu</option>
              <option value="kickboxing">Kickboxing</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="filter-select-wrapper">
            <label htmlFor={statusSelectId} className="sr-only">Status Filter</label>
            <select
              id={statusSelectId}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="accepted">Accepted</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="declined">Declined</option>
            </select>
          </div>

          {/* Export Actions (Part 5) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-export"
              onClick={() => handleExport('bookings')}
              disabled={isExporting}
              title="Download bookings report CSV"
            >
              <Download size={14} />
              <span>Export Bookings CSV</span>
            </button>
            <button
              type="button"
              className="btn-management-action"
              onClick={() => handleExport('users')}
              disabled={isExporting}
              title="Download users report CSV"
            >
              <Download size={14} />
              <span>Users CSV</span>
            </button>
            <button
              type="button"
              className="btn-management-action"
              onClick={() => handleExport('sports')}
              disabled={isExporting}
              title="Download sports popularity CSV"
            >
              <Download size={14} />
              <span>Sports CSV</span>
            </button>
          </div>

          {/* Reset Filters */}
          {(range !== 'last30days' || sportFilter !== 'all' || statusFilter !== 'all') && (
            <button
              type="button"
              className="btn-clear-filters"
              onClick={handleResetFilters}
            >
              Reset Filters
            </button>
          )}
        </div>

        {/* Date boundary label */}
        <div style={{ marginTop: '12px', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
          Active Reporting Scope: <strong>{analytics?.range.label ?? 'Last 30 Days'}</strong>
          {analytics?.range.startDate && analytics?.range.endDate && (
            <span> ({analytics.range.startDate} to {analytics.range.endDate})</span>
          )}
        </div>
      </section>

      {/* Export Toast Notification */}
      {exportToast && (
        <div
          className="management-alert management-alert-success"
          style={{ marginBottom: '16px' }}
          role="status"
        >
          <CheckCircle size={16} />
          <div className="alert-content">{exportToast}</div>
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div className="management-alert management-alert-error" role="alert">
          <AlertCircle size={18} />
          <div className="alert-content">
            <strong>Data Fetch Error:</strong> {error}
          </div>
          <button type="button" className="btn-alert-action" onClick={() => loadAnalytics()}>
            Retry
          </button>
        </div>
      )}

      {/* 7 Summary Metric Cards: All-time vs Filtered Scope (Part 1) */}
      <div className="management-stats-grid">
        {/* Total Customers */}
        <div className="m-stat-card">
          <div className="m-stat-header">
            <span className="m-stat-label">Registered Customers</span>
            <span className="m-stat-icon icon-primary">
              <Users size={18} />
            </span>
          </div>
          <div className="m-stat-value">
            {isLoading && !analytics ? <div className="stat-skeleton" /> : (
              range === 'all'
                ? analytics?.summary.allTime.totalCustomers.toLocaleString() ?? '—'
                : analytics?.summary.filtered.totalCustomers.toLocaleString() ?? '—'
            )}
          </div>
          <div className="m-stat-footnote">
            {range !== 'all' && analytics && (
              <span>In period ({analytics.summary.allTime.totalCustomers} all-time)</span>
            )}
            {range === 'all' && <span>Parents &amp; Individuals</span>}
          </div>
        </div>

        {/* Total Coaches */}
        <div className="m-stat-card">
          <div className="m-stat-header">
            <span className="m-stat-label">Registered Coaches</span>
            <span className="m-stat-icon icon-primary">
              <Shield size={18} />
            </span>
          </div>
          <div className="m-stat-value">
            {isLoading && !analytics ? <div className="stat-skeleton" /> : (
              range === 'all'
                ? analytics?.summary.allTime.totalCoaches.toLocaleString() ?? '—'
                : analytics?.summary.filtered.totalCoaches.toLocaleString() ?? '—'
            )}
          </div>
          <div className="m-stat-footnote">
            {range !== 'all' && analytics && (
              <span>In period ({analytics.summary.allTime.totalCoaches} all-time)</span>
            )}
            {range === 'all' && <span>Platform coaches</span>}
          </div>
        </div>

        {/* Total Bookings */}
        <div className="m-stat-card">
          <div className="m-stat-header">
            <span className="m-stat-label">Total Bookings</span>
            <span className="m-stat-icon icon-primary">
              <CalendarDays size={18} />
            </span>
          </div>
          <div className="m-stat-value">
            {isLoading && !analytics ? <div className="stat-skeleton" /> : (
              range === 'all'
                ? analytics?.summary.allTime.totalBookings.toLocaleString() ?? '—'
                : analytics?.summary.filtered.totalBookings.toLocaleString() ?? '—'
            )}
          </div>
          <div className="m-stat-footnote">
            {range !== 'all' && analytics && (
              <span>In period ({analytics.summary.allTime.totalBookings} all-time)</span>
            )}
            {range === 'all' && <span>All sessions requested</span>}
          </div>
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
            {isLoading && !analytics ? <div className="stat-skeleton" /> : (
              range === 'all'
                ? analytics?.summary.allTime.completedBookings.toLocaleString() ?? '—'
                : analytics?.summary.filtered.completedBookings.toLocaleString() ?? '—'
            )}
          </div>
          <div className="m-stat-footnote">
            {range !== 'all' && analytics && (
              <span>In period ({analytics.summary.allTime.completedBookings} all-time)</span>
            )}
            {range === 'all' && <span>Successfully concluded</span>}
          </div>
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
            {isLoading && !analytics ? <div className="stat-skeleton" /> : (
              range === 'all'
                ? analytics?.summary.allTime.pendingBookings.toLocaleString() ?? '—'
                : analytics?.summary.filtered.pendingBookings.toLocaleString() ?? '—'
            )}
          </div>
          <div className="m-stat-footnote">Awaiting coach response</div>
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
            {isLoading && !analytics ? <div className="stat-skeleton" /> : (
              range === 'all'
                ? analytics?.summary.allTime.cancelledBookings.toLocaleString() ?? '—'
                : analytics?.summary.filtered.cancelledBookings.toLocaleString() ?? '—'
            )}
          </div>
          <div className="m-stat-footnote">Cancelled by user/coach</div>
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
            {isLoading && !analytics ? <div className="stat-skeleton" /> : (
              range === 'all'
                ? analytics?.summary.allTime.declinedBookings.toLocaleString() ?? '—'
                : analytics?.summary.filtered.declinedBookings.toLocaleString() ?? '—'
            )}
          </div>
          <div className="m-stat-footnote">Declined before acceptance</div>
        </div>
      </div>

      {/* Grid: Charts A & B (User Growth & Booking Trends) */}
      <div className="report-grid-2col" style={{ marginTop: '24px' }}>
        {/* Chart A: User Growth Over Time (Part 3.A) */}
        <div className="report-chart-card">
          <div className="report-chart-header">
            <div>
              <h2 className="report-chart-title">User Registrations Over Time</h2>
              <div className="report-chart-subtitle">
                Parent, Individual, and Coach signups within selected date scope
              </div>
            </div>
            <div className="chart-legend">
              <div className="chart-legend-item">
                <span className="chart-legend-color" style={{ backgroundColor: 'var(--color-navy)' }} />
                <span>Parents</span>
              </div>
              <div className="chart-legend-item">
                <span className="chart-legend-color" style={{ backgroundColor: '#2563EB' }} />
                <span>Individuals</span>
              </div>
              <div className="chart-legend-item">
                <span className="chart-legend-color" style={{ backgroundColor: '#16805D' }} />
                <span>Coaches</span>
              </div>
            </div>
          </div>

          {/* SVG Chart */}
          {isLoading ? (
            <div className="stat-skeleton" style={{ height: '200px', width: '100%' }} />
          ) : !analytics?.userGrowth.timeline || analytics.userGrowth.timeline.length === 0 ? (
            <div className="honest-empty-state" style={{ padding: '36px 0' }}>
              <div className="empty-title" style={{ fontSize: '0.9rem' }}>No Registrations In Selected Scope</div>
              <p className="empty-description" style={{ fontSize: '0.8rem' }}>
                No accounts were created during this timeframe. Adjust your date range filter above.
              </p>
            </div>
          ) : (
            <div className="chart-svg-container">
              <svg viewBox="0 0 500 200" width="100%" height="100%" preserveAspectRatio="none">
                {/* Horizontal grid lines */}
                <line x1="40" y1="20" x2="490" y2="20" stroke="#E2E8F0" strokeDasharray="3 3" />
                <line x1="40" y1="80" x2="490" y2="80" stroke="#E2E8F0" strokeDasharray="3 3" />
                <line x1="40" y1="140" x2="490" y2="140" stroke="#E2E8F0" strokeDasharray="3 3" />
                <line x1="40" y1="180" x2="490" y2="180" stroke="#CBD5E1" strokeWidth="1" />

                {/* Bars */}
                {(() => {
                  const points = analytics.userGrowth.timeline;
                  const maxTotal = Math.max(1, ...points.map((p) => p.total));
                  const availableWidth = 440;
                  const barWidth = Math.max(8, Math.min(28, availableWidth / points.length - 6));
                  const step = availableWidth / points.length;

                  return points.map((p, idx) => {
                    const x = 50 + idx * step + (step - barWidth) / 2;
                    const totalH = (p.total / maxTotal) * 150;
                    const parentH = (p.parents / p.total) * totalH;
                    const indivH = (p.individuals / p.total) * totalH;
                    const coachH = (p.coaches / p.total) * totalH;

                    const yBase = 180;
                    const yParent = yBase - parentH;
                    const yIndiv = yParent - indivH;
                    const yCoach = yIndiv - coachH;

                    return (
                      <g key={p.date}>
                        <title>{`${p.date}: ${p.parents} parents, ${p.individuals} individuals, ${p.coaches} coaches (Total: ${p.total})`}</title>
                        {parentH > 0 && (
                          <rect
                            x={x}
                            y={yParent}
                            width={barWidth}
                            height={parentH}
                            fill="var(--color-navy)"
                            rx={2}
                          />
                        )}
                        {indivH > 0 && (
                          <rect
                            x={x}
                            y={yIndiv}
                            width={barWidth}
                            height={indivH}
                            fill="#2563EB"
                            rx={2}
                          />
                        )}
                        {coachH > 0 && (
                          <rect
                            x={x}
                            y={yCoach}
                            width={barWidth}
                            height={coachH}
                            fill="#16805D"
                            rx={2}
                          />
                        )}
                        {/* Date label for sparse intervals */}
                        {(points.length <= 10 || idx % Math.ceil(points.length / 8) === 0) && (
                          <text
                            x={x + barWidth / 2}
                            y="195"
                            fontSize="9"
                            fill="#64748B"
                            textAnchor="middle"
                          >
                            {p.date.slice(5)}
                          </text>
                        )}
                      </g>
                    );
                  });
                })()}
              </svg>
            </div>
          )}
        </div>

        {/* Chart B: Booking Trends & Distribution (Part 3.B) */}
        <div className="report-chart-card">
          <div className="report-chart-header">
            <div>
              <h2 className="report-chart-title">Booking Status Distribution</h2>
              <div className="report-chart-subtitle">
                Operational lifecycle statuses in active date scope
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="stat-skeleton" style={{ height: '200px', width: '100%' }} />
          ) : !analytics || analytics.bookingTrends.distribution.total === 0 ? (
            <div className="honest-empty-state" style={{ padding: '36px 0' }}>
              <div className="empty-title" style={{ fontSize: '0.9rem' }}>No Bookings In Scope</div>
              <p className="empty-description" style={{ fontSize: '0.8rem' }}>
                No training sessions match the current date and filter parameters.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Stacked progress bar overview */}
              {(() => {
                const dist = analytics.bookingTrends.distribution;
                const total = dist.total || 1;
                const pComp = (dist.completed / total) * 100;
                const pAcpt = (dist.accepted / total) * 100;
                const pPend = (dist.pending / total) * 100;
                const pCanc = (dist.cancelled / total) * 100;
                const pDecl = (dist.declined / total) * 100;

                return (
                  <div>
                    <div className="progress-bar-track" style={{ height: '14px', borderRadius: '7px' }}>
                      <div className="progress-bar-fill" style={{ width: `${pComp}%`, backgroundColor: '#16805D' }} title={`Completed: ${dist.completed}`} />
                      <div className="progress-bar-fill" style={{ width: `${pAcpt}%`, backgroundColor: '#2563EB' }} title={`Accepted: ${dist.accepted}`} />
                      <div className="progress-bar-fill" style={{ width: `${pPend}%`, backgroundColor: '#D97706' }} title={`Pending: ${dist.pending}`} />
                      <div className="progress-bar-fill" style={{ width: `${pCanc}%`, backgroundColor: '#64748B' }} title={`Cancelled: ${dist.cancelled}`} />
                      <div className="progress-bar-fill" style={{ width: `${pDecl}%`, backgroundColor: '#DC2626' }} title={`Declined: ${dist.declined}`} />
                    </div>
                  </div>
                );
              })()}

              {/* Status Breakdown List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {[
                  { label: 'Completed Sessions', count: analytics.bookingTrends.distribution.completed, color: '#16805D', status: 'completed' },
                  { label: 'Accepted / Scheduled', count: analytics.bookingTrends.distribution.accepted, color: '#2563EB', status: 'accepted' },
                  { label: 'Pending Requests', count: analytics.bookingTrends.distribution.pending, color: '#D97706', status: 'pending' },
                  { label: 'Cancelled Sessions', count: analytics.bookingTrends.distribution.cancelled, color: '#64748B', status: 'cancelled' },
                  { label: 'Declined Requests', count: analytics.bookingTrends.distribution.declined, color: '#DC2626', status: 'rejected' },
                ].map((item) => {
                  const total = analytics.bookingTrends.distribution.total || 1;
                  const pct = Math.round((item.count / total) * 100);
                  return (
                    <div key={item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.825rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="chart-legend-color" style={{ backgroundColor: item.color }} />
                        <span style={{ fontWeight: 600, color: 'var(--color-navy)' }}>{item.label}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 700, color: 'var(--color-navy)' }}>{item.count}</span>
                        <span style={{ color: 'var(--color-text-muted)', width: '38px', textAlign: 'right' }}>({pct}%)</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Grid: Section C (Sports Popularity) & Section E (Cancellation Analysis) */}
      <div className="report-grid-2col" style={{ marginTop: '24px' }}>
        {/* Section C: Sports Popularity (Part 3.C) */}
        <div className="report-chart-card">
          <div className="report-chart-header">
            <div>
              <h2 className="report-chart-title">Sports Popularity &amp; Disciplines</h2>
              <div className="report-chart-subtitle">
                Booking share across martial arts and sports disciplines
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="stat-skeleton" style={{ height: '180px', width: '100%' }} />
          ) : !analytics?.sportsPopularity || analytics.sportsPopularity.length === 0 ? (
            <div className="honest-empty-state" style={{ padding: '36px 0' }}>
              <div className="empty-title" style={{ fontSize: '0.9rem' }}>No Sports Records Found</div>
              <p className="empty-description" style={{ fontSize: '0.8rem' }}>
                No bookings have been logged for sports categories in this scope.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {analytics.sportsPopularity.map((sp) => (
                <div key={sp.sport}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.825rem', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 700, textTransform: 'capitalize', color: 'var(--color-navy)' }}>
                      {sp.sport}
                    </span>
                    <span style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                      {sp.total} session{sp.total === 1 ? '' : 's'} ({sp.percentage}%)
                    </span>
                  </div>
                  <div className="progress-bar-track">
                    <div
                      className="progress-bar-fill"
                      style={{
                        width: `${sp.percentage}%`,
                        backgroundColor:
                          sp.sport === 'boxing'
                            ? 'var(--color-navy)'
                            : sp.sport === 'wushu'
                            ? '#2563EB'
                            : sp.sport === 'kickboxing'
                            ? '#16805D'
                            : '#64748B',
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '12px', fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                    <span>Completed: <strong>{sp.completed}</strong></span>
                    <span>Accepted: <strong>{sp.accepted}</strong></span>
                    <span>Cancelled: <strong>{sp.cancelled}</strong></span>
                    <span>Declined: <strong>{sp.declined}</strong></span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Section E: Cancellation & Decline Breakdown (Part 3.E) */}
        <div className="report-chart-card">
          <div className="report-chart-header">
            <div>
              <h2 className="report-chart-title">Cancellation &amp; Decline Analysis</h2>
              <div className="report-chart-subtitle">
                Attribution and top recorded reasons from verified records
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="stat-skeleton" style={{ height: '180px', width: '100%' }} />
          ) : !analytics ? (
            <div className="honest-empty-state" style={{ padding: '36px 0' }}>
              <div className="empty-title" style={{ fontSize: '0.9rem' }}>No Cancellation Data</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Attribution summary */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                <div style={{ backgroundColor: 'var(--color-mist)', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                  <div style={{ fontSize: '0.725rem', color: 'var(--color-text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>By Customer</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-navy)' }}>
                    {analytics.cancellationAnalysis.attribution.customer}
                  </div>
                </div>
                <div style={{ backgroundColor: 'var(--color-mist)', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                  <div style={{ fontSize: '0.725rem', color: 'var(--color-text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>By Coach</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-navy)' }}>
                    {analytics.cancellationAnalysis.attribution.coach}
                  </div>
                </div>
                <div style={{ backgroundColor: 'var(--color-mist)', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                  <div style={{ fontSize: '0.725rem', color: 'var(--color-text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Declined</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#DC2626' }}>
                    {analytics.cancellationAnalysis.totalDeclined}
                  </div>
                </div>
              </div>

              {/* Recorded Reasons List */}
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-navy)', marginBottom: '8px' }}>
                  Top Recorded Cancellation Reasons:
                </div>
                {analytics.cancellationAnalysis.reasons.length === 0 ? (
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                    No cancellations recorded in this scope.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {analytics.cancellationAnalysis.reasons.slice(0, 4).map((r, i) => (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          fontSize: '0.8rem',
                          padding: '6px 10px',
                          backgroundColor: '#FEF2F2',
                          borderRadius: '6px',
                          color: '#991B1B',
                        }}
                      >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80%' }}>
                          {r.reason}
                        </span>
                        <span style={{ fontWeight: 700 }}>{r.count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Section D: Coach Activity & Compliance (Part 3.D) */}
      <section className="panel" style={{ marginTop: '24px' }}>
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Coach Engagement &amp; Operational Throughput</h2>
            <p className="panel-subtitle">
              Verified session volume and completion performance. No simulated scores or rankings.
            </p>
          </div>
          <button
            type="button"
            className="btn-management-action"
            onClick={() => handleExport('bookings')}
            disabled={isExporting}
            style={{ fontSize: '0.775rem' }}
          >
            <Download size={13} />
            <span>Export Details</span>
          </button>
        </div>

        {/* 3 KPI mini-metrics */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '18px' }}>
          <div className="detail-field">
            <span className="detail-field-label">Total Registered Coaches</span>
            <span className="detail-field-value">{analytics?.coachActivity.totalRegistered ?? '—'}</span>
          </div>
          <div className="detail-field">
            <span className="detail-field-label">Active &amp; Compliant Coaches</span>
            <span className="detail-field-value">{analytics?.coachActivity.activeCoaches ?? '—'}</span>
          </div>
          <div className="detail-field">
            <span className="detail-field-label">Coaches with Bookings in Scope</span>
            <span className="detail-field-value">{analytics?.coachActivity.coachesWithBookings ?? '—'}</span>
          </div>
        </div>

        {/* Top Active Coaches Table */}
        <div className="table-wrapper">
          {isLoading ? (
            <div className="table-skeleton-wrapper">
              <div className="skeleton-row" />
              <div className="skeleton-row" />
            </div>
          ) : !analytics?.coachActivity.topCoaches || analytics.coachActivity.topCoaches.length === 0 ? (
            <div className="honest-empty-state" style={{ padding: '24px' }}>
              <div className="empty-title" style={{ fontSize: '0.9rem' }}>No Coach Booking Activity</div>
              <p className="empty-description" style={{ fontSize: '0.8rem' }}>
                No coach has received booking requests within the selected timeframe.
              </p>
            </div>
          ) : (
            <table className="demo-table">
              <thead>
                <tr>
                  <th>Coach Name</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Total Sessions</th>
                  <th>Completed</th>
                  <th>Accepted</th>
                  <th>Cancelled</th>
                </tr>
              </thead>
              <tbody>
                {analytics.coachActivity.topCoaches.map((coach) => (
                  <tr key={coach.coachId}>
                    <td style={{ fontWeight: 600 }}>{coach.name}</td>
                    <td className="table-subtext">{coach.email}</td>
                    <td>
                      <span className={`badge-status ${coach.isActive ? 'badge-verified' : 'badge-declined'}`}>
                        {coach.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td><strong>{coach.totalBookings}</strong></td>
                    <td><span style={{ color: '#16805D', fontWeight: 600 }}>{coach.completedSessions}</span></td>
                    <td><span style={{ color: '#2563EB', fontWeight: 600 }}>{coach.acceptedSessions}</span></td>
                    <td><span style={{ color: '#64748B' }}>{coach.cancelledSessions}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Section F: Administrative Audit Trail Notice (Part 8) */}
      <section className="panel" style={{ marginTop: '24px' }}>
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Administrative Audit Trail &amp; Governance</h2>
            <p className="panel-subtitle">System event logging, administrative modifications, and security audit records.</p>
          </div>
          <span className="badge-status badge-phase">Phase 5 Governance</span>
        </div>

        <div className="placeholder-card" style={{ padding: '24px 20px' }}>
          <div className="placeholder-icon">
            <Layers size={28} />
          </div>
          <h3 className="placeholder-title">Immutable Audit Trail Framework</h3>
          <p className="placeholder-desc">
            Platform governance, immutable administrator audit logging, and authorization event tracking are scheduled for deployment in Admin Phase 5.
            Per AthleteConnect data integrity standards, ordinary database records are not described as an audit trail.
          </p>
        </div>
      </section>
    </div>
  );
};
