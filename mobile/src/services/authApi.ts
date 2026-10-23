import { RoleId } from '../data/roles';
import { getApiBaseUrl, API_ENDPOINTS } from '../config/api';

export type CustomerRole = RoleId;

export interface UserProfile {
  _id: string;
  name: string;
  email: string;
  role: CustomerRole;
  isActive: boolean;
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

/**
 * Safely extracts user-friendly error message from backend error responses.
 */
async function parseResponseError(response: Response): Promise<string> {
  try {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await response.json();
      if (data && typeof data.error === 'string' && data.error.trim()) {
        return data.error;
      }
    }
  } catch {
    // Non-JSON or unreadable body, fall back to status code defaults below
  }

  switch (response.status) {
    case 400:
      return 'Invalid request. Please check your inputs.';
    case 401:
      return 'Invalid email or password.';
    case 403:
      return 'Account is deactivated. Please contact support.';
    case 404:
      return 'Authentication service endpoint was not found.';
    case 409:
      return 'An account with this email address already exists.';
    case 500:
    case 502:
    case 503:
      return 'Server error. Please try again later.';
    default:
      return `Request failed with status ${response.status}.`;
  }
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
    const errorMessage = await parseResponseError(response);
    throw new AuthApiError(errorMessage, response.status);
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
    const errorMessage = await parseResponseError(response);
    throw new AuthApiError(errorMessage, response.status);
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
    const errorMessage = await parseResponseError(response);
    throw new AuthApiError(errorMessage, response.status);
  }

  const data = (await response.json()) as { user: UserProfile };
  return data.user;
}
