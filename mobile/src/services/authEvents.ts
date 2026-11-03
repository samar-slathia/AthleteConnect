export type AuthFailureReason = 'unauthorized' | 'account_deactivated';

export interface AuthFailureEvent {
  reason: AuthFailureReason;
  statusCode: number;
  message: string;
  token?: string; // Original token used by the failed request
}

type AuthFailureListener = (event: AuthFailureEvent) => void;

const listeners: Set<AuthFailureListener> = new Set();

/**
 * Subscribes to global authentication failure events (e.g. 401 Unauthorized, 403 Deactivated).
 * Returns an unsubscribe callback function.
 */
export function onAuthFailure(listener: AuthFailureListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Notifies all active subscribers that an authentication failure occurred.
 * Called automatically by API clients when receiving 401 or 403 deactivation responses.
 */
export function notifyAuthFailure(event: AuthFailureEvent): void {
  listeners.forEach((listener) => {
    try {
      listener(event);
    } catch {
      // Prevent third-party listener errors from disrupting API calls
    }
  });
}

/**
 * Inspects a protected API response status and error message.
 * If the response represents a revoked session (401) or deactivated account (403),
 * dispatches the appropriate auth failure notification globally, associating the token used.
 */
export function handleProtectedResponseError(
  statusCode: number,
  errorMessage: string,
  token?: string,
  errorCode?: string
): void {
  if (statusCode === 401) {
    notifyAuthFailure({
      reason: 'unauthorized',
      statusCode: 401,
      message: 'Session expired. Please log in again.',
      token,
    });
  } else if (
    statusCode === 403 &&
    (errorCode === 'ACCOUNT_DEACTIVATED' ||
      errorMessage.toLowerCase().includes('deactivated') ||
      errorMessage.includes('ACCOUNT_DEACTIVATED'))
  ) {
    notifyAuthFailure({
      reason: 'account_deactivated',
      statusCode: 403,
      message: 'Account has been deactivated. Please contact support.',
      token,
    });
  }
}

/**
 * Test helper to clear all registered listeners between test cases.
 */
export function clearAuthFailureListeners(): void {
  listeners.clear();
}
