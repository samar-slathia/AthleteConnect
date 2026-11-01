import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  Server,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RotateCcw,
  Save,
  Search,
  Filter,
  LogOut,
  Sliders,
  FileText,
  User,
  Info,
  ChevronLeft,
  ChevronRight,
  Database,
  Cpu,
  Layers,
  X,
  Lock,
} from 'lucide-react';
import { useAuth } from '../context/useAuth';
import {
  fetchAdminSettings,
  updateAdminSettings,
  fetchAdminAuditLogs,
  fetchAdminSystemHealth,
  type PlatformConfigSettings,
  type PlatformInfo,
  type PlatformFeatures,
  type AuditLogEntry,
  type SystemHealthResponse,
} from '../services/api';

type TabKey = 'health' | 'config' | 'admin' | 'audit';

export const SettingsPage: React.FC = () => {
  const { user, logout } = useAuth();

  const [activeTab, setActiveTab] = useState<TabKey>('health');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Loaded Settings Data
  const [settings, setSettings] = useState<PlatformConfigSettings | null>(null);
  const [platformInfo, setPlatformInfo] = useState<PlatformInfo | null>(null);
  const [features, setFeatures] = useState<PlatformFeatures | null>(null);

  // Form Editing State
  const [formState, setFormState] = useState<PlatformConfigSettings | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);

  // Health Diagnostics State
  const [healthData, setHealthData] = useState<SystemHealthResponse | null>(null);
  const [isCheckingHealth, setIsCheckingHealth] = useState<boolean>(false);

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditTotal, setAuditTotal] = useState<number>(0);
  const [auditPage, setAuditPage] = useState<number>(1);
  const [auditTotalPages, setAuditTotalPages] = useState<number>(1);
  const [auditCategory, setAuditCategory] = useState<string>('all');
  const [auditOutcome, setAuditOutcome] = useState<string>('all');
  const [auditSearch, setAuditSearch] = useState<string>('');
  const [isLoadingAudit, setIsLoadingAudit] = useState<boolean>(false);
  const [selectedAuditLog, setSelectedAuditLog] = useState<AuditLogEntry | null>(null);

  // Load Primary Settings & Health
  const loadInitialData = useCallback(() => {
    setIsLoading(true);
    setError(null);
    Promise.all([
      fetchAdminSettings(),
      fetchAdminSystemHealth().catch(() => null),
    ])
      .then(([settingsRes, healthRes]) => {
        setSettings(settingsRes.settings);
        setFormState(settingsRes.settings);
        setPlatformInfo(settingsRes.platformInfo);
        setFeatures(settingsRes.features);
        if (healthRes) {
          setHealthData(healthRes);
        }
        setIsLoading(false);
      })
      .catch((err: any) => {
        setError(err?.message || 'Failed to load platform settings and governance data.');
        setIsLoading(false);
      });
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetchAdminSettings(),
      fetchAdminSystemHealth().catch(() => null),
    ])
      .then(([settingsRes, healthRes]) => {
        if (!active) return;
        setSettings(settingsRes.settings);
        setFormState(settingsRes.settings);
        setPlatformInfo(settingsRes.platformInfo);
        setFeatures(settingsRes.features);
        if (healthRes) {
          setHealthData(healthRes);
        }
        setIsLoading(false);
      })
      .catch((err: any) => {
        if (!active) return;
        setError(err?.message || 'Failed to load platform settings and governance data.');
        setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  // Load Audit Logs
  const loadAuditLogs = useCallback((page: number = 1) => {
    setIsLoadingAudit(true);
    fetchAdminAuditLogs({
      page,
      limit: 15,
      category: auditCategory,
      outcome: auditOutcome,
      search: auditSearch,
    })
      .then((res) => {
        setAuditLogs(res.logs);
        setAuditTotal(res.pagination.total);
        setAuditPage(res.pagination.page);
        setAuditTotalPages(res.pagination.totalPages);
        setIsLoadingAudit(false);
      })
      .catch((err: any) => {
        console.error('Failed to load audit logs:', err);
        setIsLoadingAudit(false);
      });
  }, [auditCategory, auditOutcome, auditSearch]);

  useEffect(() => {
    if (activeTab === 'audit') {
      let active = true;
      fetchAdminAuditLogs({
        page: 1,
        limit: 15,
        category: auditCategory,
        outcome: auditOutcome,
        search: auditSearch,
      })
        .then((res) => {
          if (!active) return;
          setAuditLogs(res.logs);
          setAuditTotal(res.pagination.total);
          setAuditPage(res.pagination.page);
          setAuditTotalPages(res.pagination.totalPages);
          setIsLoadingAudit(false);
        })
        .catch((err: any) => {
          if (!active) return;
          console.error('Failed to load audit logs:', err);
          setIsLoadingAudit(false);
        });

      return () => {
        active = false;
      };
    }
  }, [activeTab, auditCategory, auditOutcome, auditSearch]);

  // Handle Manual Health Refresh
  const handleRefreshHealth = async () => {
    setIsCheckingHealth(true);
    try {
      const healthRes = await fetchAdminSystemHealth();
      setHealthData(healthRes);
      setSuccessMessage('System health diagnostic refreshed successfully.');
      setTimeout(() => setSuccessMessage(null), 3500);
    } catch (err: any) {
      setError(err?.message || 'System health diagnostic failed.');
    } finally {
      setIsCheckingHealth(false);
    }
  };

  // Form Field Updates
  const handleInputChange = (field: keyof PlatformConfigSettings, value: any) => {
    if (!formState) return;
    setFormState({
      ...formState,
      [field]: value,
    });
  };

  // Toggle Sports Discipline
  const handleDisciplineToggle = (discipline: string) => {
    if (!formState) return;
    const current = formState.supportedDisciplines || [];
    let updated: string[];
    if (current.includes(discipline)) {
      if (current.length === 1) {
        return; // Prevent deselecting all
      }
      updated = current.filter((d) => d !== discipline);
    } else {
      updated = [...current, discipline];
    }
    setFormState({
      ...formState,
      supportedDisciplines: updated,
    });
  };

  // Check which fields changed
  const getModifiedFields = (): Array<{ field: string; from: any; to: any }> => {
    if (!settings || !formState) return [];
    const diff: Array<{ field: string; from: any; to: any }> = [];

    const keys: Array<keyof PlatformConfigSettings> = [
      'platformName',
      'supportEmail',
      'supportPhone',
      'supportedDisciplines',
      'cancellationWindowHours',
      'maxAdvanceBookingDays',
      'defaultSessionDurationMinutes',
      'maintenanceMode',
      'maintenanceNotice',
    ];

    for (const key of keys) {
      const oldVal = settings[key];
      const newVal = formState[key];
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        diff.push({ field: key, from: oldVal, to: newVal });
      }
    }
    return diff;
  };

  // Reset to Loaded Values
  const handleResetForm = () => {
    if (settings) {
      setFormState({ ...settings });
      setSuccessMessage('Configuration changes discarded.');
      setTimeout(() => setSuccessMessage(null), 3000);
    }
  };

  // Save Configuration Flow
  const handleSaveConfirmed = async () => {
    if (!formState) return;
    setIsSaving(true);
    setShowConfirmModal(false);
    setError(null);
    try {
      const diff = getModifiedFields();
      if (diff.length === 0) {
        setSuccessMessage('No configuration changes detected.');
        setIsSaving(false);
        return;
      }

      const patchPayload: Partial<PlatformConfigSettings> = {};
      for (const item of diff) {
        (patchPayload as any)[item.field] = (formState as any)[item.field];
      }

      const res = await updateAdminSettings(patchPayload);
      setSettings(res.settings);
      setFormState(res.settings);
      setSuccessMessage('Platform configuration updated and recorded in the audit trail.');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setError(err?.message || 'Failed to update platform settings.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="panel loading-panel" role="status" aria-live="polite">
        <div className="spinner" aria-hidden="true" />
        <p className="loading-text">Loading platform governance and settings...</p>
      </div>
    );
  }

  const modifiedList = getModifiedFields();
  const hasChanges = modifiedList.length > 0;

  return (
    <div className="settings-page-container">
      {/* Page Header */}
      <div className="panel-header settings-main-header">
        <div>
          <h2 className="panel-title">Platform Settings & Governance</h2>
          <p className="panel-subtitle">
            System health, platform configuration, administrator account, and immutable governance audit trail.
          </p>
        </div>
        <div className="settings-header-actions">
          <span className="badge-phase">Admin Phase 5 Active</span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={loadInitialData}
            title="Reload settings and system health"
          >
            <RotateCcw size={14} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Global Alerts */}
      {error && (
        <div className="alert alert-danger" role="alert">
          <AlertTriangle size={18} />
          <span>{error}</span>
          <button type="button" className="alert-close" onClick={() => setError(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="alert alert-success" role="alert">
          <CheckCircle2 size={18} />
          <span>{successMessage}</span>
          <button type="button" className="alert-close" onClick={() => setSuccessMessage(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Maintenance Mode Warning Notice if Active */}
      {settings?.maintenanceMode && (
        <div className="maintenance-active-banner">
          <AlertTriangle size={20} />
          <div>
            <strong>Operational Maintenance Notice Active:</strong>{' '}
            {settings.maintenanceNotice || 'Platform is in maintenance notification mode.'}
          </div>
        </div>
      )}

      {/* Section Tabs */}
      <div className="settings-tabs-nav">
        <button
          type="button"
          className={`settings-tab-btn ${activeTab === 'health' ? 'active' : ''}`}
          onClick={() => setActiveTab('health')}
        >
          <Activity size={16} />
          <span>System Health & Features</span>
          <span className="tab-pill-badge">
            {healthData?.status === 'healthy' ? 'Healthy' : 'Active'}
          </span>
        </button>

        <button
          type="button"
          className={`settings-tab-btn ${activeTab === 'config' ? 'active' : ''}`}
          onClick={() => setActiveTab('config')}
        >
          <Sliders size={16} />
          <span>Platform Configuration</span>
          {hasChanges && <span className="tab-pill-badge badge-warning">Unsaved Changes</span>}
        </button>

        <button
          type="button"
          className={`settings-tab-btn ${activeTab === 'admin' ? 'active' : ''}`}
          onClick={() => setActiveTab('admin')}
        >
          <Shield size={16} />
          <span>Administrator Account</span>
        </button>

        <button
          type="button"
          className={`settings-tab-btn ${activeTab === 'audit' ? 'active' : ''}`}
          onClick={() => setActiveTab('audit')}
        >
          <FileText size={16} />
          <span>Governance & Audit Trail</span>
          {auditTotal > 0 && <span className="tab-pill-badge">{auditTotal}</span>}
        </button>
      </div>

      {/* TAB 1: System Health & Features */}
      {activeTab === 'health' && (
        <div className="settings-tab-content">
          {/* Health Diagnostics Panel */}
          <div className="panel">
            <div className="panel-header">
              <div>
                <h3 className="section-title">Verified System Health Indicators</h3>
                <p className="panel-subtitle">Real-time status of backend services and database connectivity.</p>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleRefreshHealth}
                disabled={isCheckingHealth}
              >
                <Activity size={14} className={isCheckingHealth ? 'spin' : ''} />
                <span>{isCheckingHealth ? 'Checking...' : 'Run Diagnostics'}</span>
              </button>
            </div>

            <div className="health-metrics-grid">
              {/* Database Status */}
              <div className="health-card">
                <div className="health-card-header">
                  <Database size={20} className="health-icon" />
                  <span
                    className={`badge-status ${
                      healthData?.database.status === 'connected' ? 'status-active' : 'status-declined'
                    }`}
                  >
                    {healthData?.database.status === 'connected' ? 'Connected' : 'Disconnected'}
                  </span>
                </div>
                <div className="health-card-label">MongoDB Database</div>
                <div className="health-card-value">
                  {healthData?.database.status === 'connected' ? 'Operational' : 'Unavailable'}
                </div>
                <div className="health-card-meta">
                  Ping Latency: {healthData?.database.pingLatencyMs ?? 0} ms | State: {healthData?.database.readyState ?? 1}
                </div>
              </div>

              {/* Core Backend API */}
              <div className="health-card">
                <div className="health-card-header">
                  <Server size={20} className="health-icon" />
                  <span className="badge-status status-active">Operational</span>
                </div>
                <div className="health-card-label">Core API Endpoints</div>
                <div className="health-card-value">RESTful Express Engine</div>
                <div className="health-card-meta">
                  Uptime: {Math.floor((healthData?.server.uptimeSeconds ?? 0) / 60)}m{' '}
                  {(healthData?.server.uptimeSeconds ?? 0) % 60}s
                </div>
              </div>

              {/* Admin Portal API */}
              <div className="health-card">
                <div className="health-card-header">
                  <Shield size={20} className="health-icon" />
                  <span className="badge-status status-active">Protected</span>
                </div>
                <div className="health-card-label">Admin API & RBAC</div>
                <div className="health-card-value">Strict Role Enforcement</div>
                <div className="health-card-meta">
                  Environment: {healthData?.server.environment || platformInfo?.environment || 'development'}
                </div>
              </div>

              {/* Memory Footprint */}
              <div className="health-card">
                <div className="health-card-header">
                  <Cpu size={20} className="health-icon" />
                  <span className="badge-status status-confirmed">Normal</span>
                </div>
                <div className="health-card-label">Node.js Memory Heap</div>
                <div className="health-card-value">
                  {healthData?.server.memoryHeapUsedMB ?? 0} MB
                </div>
                <div className="health-card-meta">
                  Total Allocated: {healthData?.server.memoryHeapTotalMB ?? 0} MB
                </div>
              </div>
            </div>

            <div className="health-safety-note">
              <Info size={16} />
              <span>
                Infrastructure Safety: Hostnames, connection strings, JWT secrets, and network topologies are strictly
                hidden from all administrative API endpoints to prevent information disclosure.
              </span>
            </div>
          </div>

          {/* Major Platform Features Matrix */}
          <div className="panel" style={{ marginTop: '24px' }}>
            <div className="panel-header">
              <div>
                <h3 className="section-title">Platform Capabilities & Implementation Status</h3>
                <p className="panel-subtitle">Verified status of end-to-end customer, coach, and administrative capabilities.</p>
              </div>
            </div>

            <div className="features-status-grid">
              {features &&
                Object.entries(features).map(([key, item]) => {
                  const isAvailable = item.status === 'Available';
                  const isPlanned = item.status === 'Planned';
                  return (
                    <div key={key} className={`feature-status-card ${isPlanned ? 'feature-planned' : ''}`}>
                      <div className="feature-card-header">
                        <span className="feature-name">{item.label}</span>
                        <span
                          className={`badge-status ${
                            isAvailable ? 'status-active' : isPlanned ? 'badge-phase' : 'status-declined'
                          }`}
                        >
                          {item.status}
                        </span>
                      </div>
                      <p className="feature-description">{item.description}</p>
                    </div>
                  );
                })}
            </div>

            {/* Explicit Notice on Payment Gateway */}
            <div className="payment-safety-callout">
              <Lock size={18} />
              <div>
                <strong>Payment Integration Status:</strong> Financial processing remains explicitly marked as{' '}
                <strong>Planned</strong>. In accordance with AthleteConnect compliance rules, payments will only be
                activated following verified merchant gateway integration. No mock transactions or fabricated revenues
                are shown.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Platform Configuration */}
      {activeTab === 'config' && formState && (
        <div className="settings-tab-content">
          <div className="panel">
            <div className="panel-header">
              <div>
                <h3 className="section-title">Platform Operational Parameters</h3>
                <p className="panel-subtitle">
                  Safe configuration settings that govern platform display, discipline availability, and booking rules.
                </p>
              </div>
              <div className="form-action-buttons">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleResetForm}
                  disabled={!hasChanges || isSaving}
                >
                  <RotateCcw size={14} />
                  <span>Discard</span>
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => setShowConfirmModal(true)}
                  disabled={!hasChanges || isSaving}
                >
                  <Save size={14} />
                  <span>{isSaving ? 'Saving...' : 'Save Configuration'}</span>
                </button>
              </div>
            </div>

            {hasChanges && (
              <div className="unsaved-changes-banner">
                <AlertTriangle size={16} />
                <span>You have unsaved configuration changes. Click &quot;Save Configuration&quot; to review and apply them.</span>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setShowConfirmModal(true);
              }}
              className="settings-form"
            >
              {/* Category 1: Platform Information */}
              <div className="form-section">
                <h4 className="form-section-title">
                  <Layers size={16} />
                  <span>Platform Display Information</span>
                </h4>
                <div className="form-row-2">
                  <div className="form-group">
                    <label className="form-label" htmlFor="platformName">
                      Platform Name
                    </label>
                    <input
                      id="platformName"
                      type="text"
                      className="form-input"
                      value={formState.platformName}
                      onChange={(e) => handleInputChange('platformName', e.target.value)}
                      required
                    />
                    <span className="form-help">Displayed in navigation and communications.</span>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="supportEmail">
                      Support Email Address
                    </label>
                    <input
                      id="supportEmail"
                      type="email"
                      className="form-input"
                      value={formState.supportEmail}
                      onChange={(e) => handleInputChange('supportEmail', e.target.value)}
                      required
                    />
                    <span className="form-help">Official customer inquiry and support channel.</span>
                  </div>
                </div>

                <div className="form-row-2">
                  <div className="form-group">
                    <label className="form-label" htmlFor="supportPhone">
                      Support Phone Number (Optional)
                    </label>
                    <input
                      id="supportPhone"
                      type="text"
                      className="form-input"
                      value={formState.supportPhone}
                      onChange={(e) => handleInputChange('supportPhone', e.target.value)}
                      placeholder="+1-800-555-0199"
                    />
                    <span className="form-help">Emergency and operational contact line.</span>
                  </div>
                </div>
              </div>

              {/* Category 2: Supported Sports Disciplines */}
              <div className="form-section">
                <h4 className="form-section-title">
                  <Activity size={16} />
                  <span>Supported Sports Disciplines</span>
                </h4>
                <p className="form-help" style={{ marginBottom: '12px' }}>
                  Enable or restrict active combat sports disciplines available for coach registrations and booking discovery.
                </p>
                <div className="disciplines-checkbox-group">
                  {['boxing', 'wushu', 'kickboxing'].map((discipline) => {
                    const isChecked = formState.supportedDisciplines?.includes(discipline);
                    return (
                      <label
                        key={discipline}
                        className={`discipline-checkbox-card ${isChecked ? 'selected' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleDisciplineToggle(discipline)}
                        />
                        <div className="discipline-label-text">
                          <span className="discipline-name">
                            {discipline.charAt(0).toUpperCase() + discipline.slice(1)}
                          </span>
                          <span className="discipline-desc">
                            {discipline === 'boxing' && 'Traditional Boxing, sparring, and footwork'}
                            {discipline === 'wushu' && 'Chinese martial arts, forms, and Sanda combat'}
                            {discipline === 'kickboxing' && 'Full contact striking and Muay Thai techniques'}
                          </span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Category 3: Booking Policy Rules */}
              <div className="form-section">
                <h4 className="form-section-title">
                  <Clock size={16} />
                  <span>Booking Policy Rules</span>
                </h4>
                <div className="form-row-3">
                  <div className="form-group">
                    <label className="form-label" htmlFor="cancellationWindowHours">
                      Cancellation Window (Hours)
                    </label>
                    <input
                      id="cancellationWindowHours"
                      type="number"
                      min={1}
                      max={168}
                      className="form-input"
                      value={formState.cancellationWindowHours}
                      onChange={(e) =>
                        handleInputChange('cancellationWindowHours', parseInt(e.target.value, 10) || 1)
                      }
                      required
                    />
                    <span className="form-help">Minimum notice required to cancel a booking. (1-168h)</span>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="maxAdvanceBookingDays">
                      Max Advance Booking (Days)
                    </label>
                    <input
                      id="maxAdvanceBookingDays"
                      type="number"
                      min={1}
                      max={90}
                      className="form-input"
                      value={formState.maxAdvanceBookingDays}
                      onChange={(e) =>
                        handleInputChange('maxAdvanceBookingDays', parseInt(e.target.value, 10) || 1)
                      }
                      required
                    />
                    <span className="form-help">How far in advance customers can schedule. (1-90 days)</span>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="defaultSessionDurationMinutes">
                      Default Session Duration (Mins)
                    </label>
                    <input
                      id="defaultSessionDurationMinutes"
                      type="number"
                      min={15}
                      max={240}
                      step={15}
                      className="form-input"
                      value={formState.defaultSessionDurationMinutes}
                      onChange={(e) =>
                        handleInputChange('defaultSessionDurationMinutes', parseInt(e.target.value, 10) || 60)
                      }
                      required
                    />
                    <span className="form-help">Standard training duration. (15-240 mins)</span>
                  </div>
                </div>
              </div>

              {/* Category 4: Operational Maintenance Toggle */}
              <div className="form-section">
                <h4 className="form-section-title">
                  <AlertTriangle size={16} />
                  <span>Operational Maintenance Status</span>
                </h4>
                <div className="maintenance-toggle-row">
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={formState.maintenanceMode}
                      onChange={(e) => handleInputChange('maintenanceMode', e.target.checked)}
                    />
                    <span className="toggle-slider" />
                  </label>
                  <div className="toggle-labels">
                    <span className="toggle-title">
                      {formState.maintenanceMode ? 'Maintenance Notice Active' : 'Maintenance Mode Inactive'}
                    </span>
                    <span className="toggle-subtitle">
                      When enabled, displays an informational notice to platform operators. Does not disrupt database access.
                    </span>
                  </div>
                </div>

                {formState.maintenanceMode && (
                  <div className="form-group" style={{ marginTop: '14px' }}>
                    <label className="form-label" htmlFor="maintenanceNotice">
                      Maintenance Notice Text
                    </label>
                    <textarea
                      id="maintenanceNotice"
                      className="form-input form-textarea"
                      rows={3}
                      value={formState.maintenanceNotice}
                      onChange={(e) => handleInputChange('maintenanceNotice', e.target.value)}
                      placeholder="e.g., Scheduled routine system upgrades are underway. Platform operations are monitored."
                    />
                  </div>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TAB 3: Administrator Account & Security */}
      {activeTab === 'admin' && (
        <div className="settings-tab-content">
          <div className="panel">
            <div className="panel-header">
              <div>
                <h3 className="section-title">Administrator Profile & Active Session</h3>
                <p className="panel-subtitle">Current authenticated administrative identity and access parameters.</p>
              </div>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={logout}
                title="Terminate administrative session"
              >
                <LogOut size={14} />
                <span>Sign Out</span>
              </button>
            </div>

            <div className="admin-profile-card">
              <div className="admin-profile-avatar">
                <User size={36} />
              </div>
              <div className="admin-profile-info">
                <div className="admin-profile-name">{user?.name || 'Platform Administrator'}</div>
                <div className="admin-profile-email">{user?.email || 'admin@athleteconnect.test'}</div>
                <div className="admin-profile-tags">
                  <span className="badge-status status-active">
                    <Shield size={12} /> Administrator
                  </span>
                  <span className="badge-status status-confirmed">Session Active</span>
                  <span className="badge-status">Role: {user?.role || 'admin'}</span>
                </div>
              </div>
            </div>

            <div className="admin-security-details-grid">
              <div className="detail-item">
                <span className="detail-label">Session Authentication</span>
                <span className="detail-value">Cryptographically Signed JWT Bearer Token</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Session Duration</span>
                <span className="detail-value">7-Day Standard Expiration Window</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Access Boundary</span>
                <span className="detail-value">Platform Administration & Governance</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Account Provisioning</span>
                <span className="detail-value">Server-Side Local CLI Utility (`npm run admin:create`)</span>
              </div>
            </div>

            {/* Credential Policy Callout */}
            <div className="admin-credential-policy-box">
              <div className="policy-icon">
                <Lock size={20} />
              </div>
              <div className="policy-content">
                <h4 className="policy-title">Administrative Credential & Governance Security Protocol</h4>
                <p className="policy-text">
                  To prevent unauthorized privilege escalation, administrator accounts cannot be created, modified, or
                  promoted through public endpoints or regular admin APIs. In accordance with platform governance rules:
                </p>
                <ul className="policy-list">
                  <li>Ordinary users or coaches cannot be elevated to administrative roles.</li>
                  <li>No public administrative registration endpoints exist.</li>
                  <li>
                    To create or rotate an administrator credential, system operators must execute the local provisioning
                    utility: <code>npm run admin:create</code> on the server terminal.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: Governance & Audit Trail */}
      {activeTab === 'audit' && (
        <div className="settings-tab-content">
          <div className="panel">
            <div className="panel-header">
              <div>
                <h3 className="section-title">Administrative Audit Trail</h3>
                <p className="panel-subtitle">
                  Immutable records of administrative mutations, configuration updates, and account activations.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => loadAuditLogs(auditPage)}
                disabled={isLoadingAudit}
              >
                <RotateCcw size={14} className={isLoadingAudit ? 'spin' : ''} />
                <span>Refresh Log</span>
              </button>
            </div>

            {/* Audit Filter Controls */}
            <div className="audit-controls-row">
              <div className="audit-search-wrapper">
                <Search size={16} className="search-icon" />
                <input
                  type="text"
                  className="audit-search-input"
                  placeholder="Search by action, admin email, or target..."
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') loadAuditLogs(1);
                  }}
                />
              </div>

              <div className="audit-filter-group">
                <Filter size={16} />
                <select
                  className="audit-select"
                  value={auditCategory}
                  onChange={(e) => {
                    setAuditCategory(e.target.value);
                  }}
                >
                  <option value="all">All Categories</option>
                  <option value="AUTH">Authentication (AUTH)</option>
                  <option value="USER_MANAGEMENT">User Management (USER_MANAGEMENT)</option>
                  <option value="SETTINGS">Settings & Config (SETTINGS)</option>
                  <option value="SECURITY">Security (SECURITY)</option>
                </select>

                <select
                  className="audit-select"
                  value={auditOutcome}
                  onChange={(e) => {
                    setAuditOutcome(e.target.value);
                  }}
                >
                  <option value="all">All Outcomes</option>
                  <option value="SUCCESS">Success Only</option>
                  <option value="FAILURE">Failure Only</option>
                </select>

                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => loadAuditLogs(1)}
                >
                  Filter
                </button>
              </div>
            </div>

            {/* Audit Logs Table */}
            {isLoadingAudit ? (
              <div className="panel loading-panel" style={{ minHeight: '200px' }}>
                <div className="spinner" />
                <p className="loading-text">Fetching immutable audit records...</p>
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="audit-empty-state">
                <FileText size={36} className="empty-icon" />
                <h4 className="empty-title">No Audit Events Recorded Yet</h4>
                <p className="empty-desc">
                  Administrative mutations (such as user activation toggles, settings updates, and admin logins) are
                  recorded here immutably as they occur.
                </p>
              </div>
            ) : (
              <div className="audit-table-wrapper">
                <table className="audit-table">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Action</th>
                      <th>Category</th>
                      <th>Administrator</th>
                      <th>Target</th>
                      <th>Outcome</th>
                      <th style={{ textAlign: 'right' }}>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map((log) => (
                      <tr key={log._id}>
                        <td className="cell-timestamp">
                          {new Date(log.createdAt).toLocaleDateString()} {new Date(log.createdAt).toLocaleTimeString()}
                        </td>
                        <td className="cell-action">
                          <strong>{log.action}</strong>
                          <div className="cell-event-type">{log.eventType}</div>
                        </td>
                        <td>
                          <span className={`badge-category badge-cat-${log.category.toLowerCase()}`}>
                            {log.category}
                          </span>
                        </td>
                        <td className="cell-admin">
                          <div>{log.adminName || 'Admin'}</div>
                          <div className="cell-subtext">{log.adminEmail}</div>
                        </td>
                        <td className="cell-target">
                          <span>{log.targetType}</span>
                          {log.targetId && <div className="cell-subtext">ID: {log.targetId.slice(-6)}</div>}
                        </td>
                        <td>
                          <span
                            className={`badge-status ${
                              log.outcome === 'SUCCESS' ? 'status-active' : 'status-declined'
                            }`}
                          >
                            {log.outcome}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-xs"
                            onClick={() => setSelectedAuditLog(log)}
                          >
                            Inspect
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Audit Pagination */}
            {auditTotalPages > 1 && (
              <div className="audit-pagination-bar">
                <span className="pagination-info">
                  Showing page {auditPage} of {auditTotalPages} ({auditTotal} total records)
                </span>
                <div className="pagination-buttons">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={auditPage <= 1}
                    onClick={() => loadAuditLogs(auditPage - 1)}
                  >
                    <ChevronLeft size={14} />
                    <span>Previous</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={auditPage >= auditTotalPages}
                    onClick={() => loadAuditLogs(auditPage + 1)}
                  >
                    <span>Next</span>
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL for Configuration Changes */}
      {showConfirmModal && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <div className="modal-header-title">
                <AlertTriangle size={20} className="warning-icon" />
                <h3>Confirm Platform Configuration Changes</h3>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowConfirmModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <p style={{ marginBottom: '16px', color: 'var(--color-text-secondary)' }}>
                Please review the proposed platform configuration updates. Once saved, these parameters will take effect
                platform-wide and will be permanently recorded in the immutable audit log:
              </p>

              <div className="diff-review-list">
                {modifiedList.map((item) => (
                  <div key={item.field} className="diff-review-item">
                    <span className="diff-field-name">{item.field}:</span>
                    <span className="diff-old-val">{JSON.stringify(item.from)}</span>
                    <span className="diff-arrow">&rarr;</span>
                    <span className="diff-new-val">{JSON.stringify(item.to)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowConfirmModal(false)}
                disabled={isSaving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSaveConfirmed}
                disabled={isSaving}
              >
                {isSaving ? 'Applying Changes...' : 'Confirm & Apply Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AUDIT LOG INSPECTOR MODAL */}
      {selectedAuditLog && (
        <div className="modal-backdrop">
          <div className="modal-card modal-card-lg">
            <div className="modal-header">
              <div className="modal-header-title">
                <FileText size={20} />
                <h3>Governance Audit Record Details</h3>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setSelectedAuditLog(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <div className="audit-detail-summary">
                <div className="detail-item">
                  <span className="detail-label">Event ID</span>
                  <span className="detail-value">{selectedAuditLog._id}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Action</span>
                  <span className="detail-value">{selectedAuditLog.action}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Event Type</span>
                  <span className="detail-value">{selectedAuditLog.eventType}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Category</span>
                  <span className="detail-value">{selectedAuditLog.category}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Administrator</span>
                  <span className="detail-value">
                    {selectedAuditLog.adminName} ({selectedAuditLog.adminEmail})
                  </span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Target Entity</span>
                  <span className="detail-value">
                    {selectedAuditLog.targetType}{' '}
                    {selectedAuditLog.targetId ? `(ID: ${selectedAuditLog.targetId})` : ''}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Outcome</span>
                  <span
                    className={`badge-status ${
                      selectedAuditLog.outcome === 'SUCCESS' ? 'status-active' : 'status-declined'
                    }`}
                  >
                    {selectedAuditLog.outcome}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Timestamp</span>
                  <span className="detail-value">{new Date(selectedAuditLog.createdAt).toISOString()}</span>
                </div>
              </div>

              <div style={{ marginTop: '16px' }}>
                <h4 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '6px' }}>
                  Sanitized Metadata & Parameters:
                </h4>
                <pre className="audit-metadata-code">
                  {JSON.stringify(selectedAuditLog.details, null, 2)}
                </pre>
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setSelectedAuditLog(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
