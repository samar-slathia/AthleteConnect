import { RoleId } from '../data/roles';
import { getApiBaseUrl, API_ENDPOINTS } from '../config/api';
import { handleProtectedResponseError } from './authEvents';

export type CustomerRole = RoleId;

export interface UserProfile {
  _id: string;
  name: string;
  email: string;
  role: CustomerRole;
  isActive: boolean;
  photoFileId?: string | null;
  photoUpdatedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface AuthResponse {
  user: UserProfile;
  token: string;
}

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  role: CustomerRole;
}

export interface LoginPayload {
  email: string;
  password: string;
}

/**
 * Custom error class for API client failures, capturing HTTP status code
 * and user-facing messages without exposing raw internal error objects.
 */
export class AuthApiError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode: number = 0) {
    super(message);
    this.name = 'AuthApiError';
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, AuthApiError.prototype);
  }
}

interface ParsedApiError {
  message: string;
  code?: string;
}

/**
 * Safely extracts user-friendly error message and optional machine-readable error code from backend error responses.
 */
async function parseResponseError(response: Response): Promise<ParsedApiError> {
  let message: string | undefined;
  let code: string | undefined;

  try {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await response.json();
      if (data && typeof data.error === 'string' && data.error.trim()) {
        message = data.error.trim();
      }
      if (data && typeof data.code === 'string' && data.code.trim()) {
        code = data.code.trim();
      }
    }
  } catch {
    // Non-JSON or unreadable body, fall back to status code defaults below
  }

  if (!message) {
    switch (response.status) {
      case 400:
        message = 'Invalid request. Please check your inputs.';
        break;
      case 401:
        message = 'Invalid email or password.';
        break;
      case 403:
        message = 'Account is deactivated. Please contact support.';
        break;
      case 404:
        message = 'Authentication service endpoint was not found.';
        break;
      case 409:
        message = 'An account with this email address already exists.';
        break;
      case 500:
      case 502:
      case 503:
        message = 'Server error. Please try again later.';
        break;
      default:
        message = `Request failed with status ${response.status}.`;
        break;
    }
  }

  return { message, code };
}

/**
 * Robust fetch wrapper that gracefully handles network disconnects and timeouts.
 */
async function safeFetch(url: string, options: RequestInit): Promise<Response> {
  try {
    return await fetch(url, options);
  } catch {
    throw new AuthApiError(
      'Unable to connect to AthleteConnect servers. Please check your internet connection.',
      0
    );
  }
}

/**
 * Checks backend health endpoint to monitor transport reachability.
 * GET /api/health
 */
export async function probeBackendHealth(): Promise<{ reachable: boolean; status?: number }> {
  try {
    const url = `${getApiBaseUrl()}/api/health`;
    const response = await safeFetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });
    return { reachable: true, status: response.status };
  } catch {
    return { reachable: false };
  }
}

/**
 * Public Registration
 * POST /api/auth/register
 */
export async function register(payload: RegisterPayload): Promise<AuthResponse> {
  const url = `${getApiBaseUrl()}${API_ENDPOINTS.REGISTER}`;

  const response = await safeFetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const { message } = await parseResponseError(response);
    throw new AuthApiError(message, response.status);
  }

  const data = (await response.json()) as AuthResponse;
  return data;
}

/**
 * User Login
 * POST /api/auth/login
 */
export async function login(payload: LoginPayload): Promise<AuthResponse> {
  const url = `${getApiBaseUrl()}${API_ENDPOINTS.LOGIN}`;

  const response = await safeFetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const { message } = await parseResponseError(response);
    throw new AuthApiError(message, response.status);
  }

  const data = (await response.json()) as AuthResponse;
  return data;
}

/**
 * Fetch Current Authenticated User Profile
 * GET /api/auth/me
 */
export async function getMe(token: string): Promise<UserProfile> {
  if (!token || typeof token !== 'string' || !token.trim()) {
    throw new AuthApiError('Authentication required. Missing token.', 401);
  }

  const url = `${getApiBaseUrl()}${API_ENDPOINTS.ME}`;

  const response = await safeFetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token.trim()}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const { message, code } = await parseResponseError(response);
    handleProtectedResponseError(response.status, message, token.trim(), code);
    throw new AuthApiError(message, response.status);
  }
  const data = (await response.json()) as { user: UserProfile };
  return data.user;
}
