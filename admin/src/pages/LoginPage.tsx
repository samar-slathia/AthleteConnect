import React, { useState } from 'react';
import { Zap, Lock, Mail, Eye, EyeOff, AlertCircle, ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/useAuth';

export const LoginPage: React.FC = () => {
  const { login, error, clearError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setLocalError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setLocalError('Please enter your administrator email address.');
      return;
    }
    if (!password) {
      setLocalError('Please enter your password.');
      return;
    }

    try {
      setIsSubmitting(true);
      await login(trimmedEmail, password);
    } catch (err: any) {
      // Error message is handled by context or local state
      setLocalError(err.message || 'Authentication failed. Please verify your credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayedError = localError || error;

  return (
    <div className="login-container">
      <div className="login-card">
        {/* Brand Header */}
        <div className="login-header">
          <div className="login-brand-icon" aria-hidden="true">
            <Zap size={28} fill="#101C2C" stroke="#101C2C" />
          </div>
          <h1 className="login-title">AthleteConnect</h1>
          <p className="login-subtitle">Operations Administration Console</p>
          <div className="login-badge">
            <ShieldAlert size={13} />
            <span>Authorized Personnel Only</span>
          </div>
        </div>

        {/* Error Alert */}
        {displayedError && (
          <div className="login-error-banner" role="alert" aria-live="assertive">
            <AlertCircle size={18} className="login-error-icon" />
            <div className="login-error-text">{displayedError}</div>
          </div>
        )}

        {/* Login Form */}
        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label htmlFor="admin-email" className="form-label">
              Admin Email
            </label>
            <div className="input-wrapper">
              <Mail size={18} className="input-icon" />
              <input
                id="admin-email"
                type="email"
                className="form-input"
                placeholder="admin@athleteconnect.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (displayedError) {
                    clearError();
                    setLocalError(null);
                  }
                }}
                disabled={isSubmitting}
                autoComplete="email"
                required
                autoFocus
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="admin-password" className="form-label">
              Password
            </label>
            <div className="input-wrapper">
              <Lock size={18} className="input-icon" />
              <input
                id="admin-password"
                type={showPassword ? 'text' : 'password'}
                className="form-input"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (displayedError) {
                    clearError();
                    setLocalError(null);
                  }
                }}
                disabled={isSubmitting}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="btn-login-submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <span className="btn-loading-content">
                <span className="login-spinner" aria-hidden="true"></span>
                <span>Authenticating...</span>
              </span>
            ) : (
              'Sign In to Dashboard'
            )}
          </button>
        </form>

        {/* Security Notice Footer */}
        <div className="login-footer">
          <p>
            Role-based authorization is strictly enforced on the server. Non-admin roles (parent, individual, coach) will be denied entry.
          </p>
        </div>
      </div>
    </div>
  );
};
