import { getApiBaseUrl, API_ENDPOINTS } from '../config/api';
import { AuthApiError } from './authApi';

export const COACH_DISCIPLINES = ['boxing', 'wushu', 'kickboxing'] as const;
export const SESSION_FORMATS = ['one_on_one', 'small_group'] as const;
export const VENUE_TYPES = ['coach_home', 'customer_home', 'ground'] as const;

export type CoachDiscipline = (typeof COACH_DISCIPLINES)[number];
export type SessionFormat = (typeof SESSION_FORMATS)[number];
export type VenueType = (typeof VENUE_TYPES)[number];

export interface CoachProfile {
  _id: string;
  userId: string;
  bio?: string;
  disciplines: CoachDiscipline[];
  specialties: string[];
  sessionFormats: SessionFormat[];
  venueTypes: VenueType[];
  hourlyRate?: number;
  currency: string;
  locations: string[];
  isPublished: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CoachProfileResponse {
  profile: CoachProfile | null;
  isComplete: boolean;
  message?: string;
}

export interface UpdateCoachProfileInput {
  bio?: string;
  disciplines?: CoachDiscipline[];
  specialties?: string[];
  sessionFormats?: SessionFormat[];
  venueTypes?: VenueType[];
  hourlyRate?: number;
  locations?: string[];
}


const ALLOWED_UPDATE_FIELDS: (keyof UpdateCoachProfileInput)[] = [
  'bio',
  'disciplines',
  'specialties',
  'sessionFormats',
  'venueTypes',
  'hourlyRate',
  'locations',
];

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
      return 'Authentication required. Please log in again.';
    case 403:
      return 'Access denied. Coach privileges required.';
    case 404:
      return 'Coach profile service endpoint was not found.';
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

const VALID_DISCIPLINES: ReadonlySet<string> = new Set(COACH_DISCIPLINES);
const VALID_SESSION_FORMATS: ReadonlySet<string> = new Set(SESSION_FORMATS);
const VALID_VENUE_TYPES: ReadonlySet<string> = new Set(VENUE_TYPES);

function isStringArray(arr: unknown): arr is string[] {
  return Array.isArray(arr) && arr.every((item) => typeof item === 'string');
}

/**
 * Validates that response data matches the expected CoachProfileResponse envelope.
 *
 * Requirements:
 * - isComplete must be a boolean (reflects profile data readiness, never credential verification).
 * - profile may be null (for coaches without a saved profile).
 * - When profile is populated, enforces required fields, string arrays, enum restrictions,
 *   and validates types of optional fields (bio, hourlyRate, createdAt, updatedAt) when present.
 */
function isValidCoachProfileResponse(data: unknown): data is CoachProfileResponse {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return false;
  }

  const record = data as Record<string, unknown>;

  // isComplete must be a boolean (server-calculated profile data readiness)
  if (typeof record.isComplete !== 'boolean') {
    return false;
  }

  // Optional message envelope field when present must be a string
  if (record.message !== undefined && typeof record.message !== 'string') {
    return false;
  }

  // profile may be null before the first save, but must never be reported as complete
  if (record.profile === null) {
    return record.isComplete === false;
  }

  if (typeof record.profile !== 'object' || Array.isArray(record.profile)) {
    return false;
  }

  const profile = record.profile as Record<string, unknown>;

  // Required identifiers and server-controlled status fields
  if (typeof profile._id !== 'string' || !profile._id.trim()) {
    return false;
  }
  if (typeof profile.userId !== 'string' || !profile.userId.trim()) {
    return false;
  }
  if (typeof profile.currency !== 'string') {
    return false;
  }
  if (typeof profile.isPublished !== 'boolean') {
    return false;
  }

  // Array fields with enum restrictions
  if (
    !Array.isArray(profile.disciplines) ||
    !profile.disciplines.every((d) => typeof d === 'string' && VALID_DISCIPLINES.has(d))
  ) {
    return false;
  }

  if (
    !Array.isArray(profile.sessionFormats) ||
    !profile.sessionFormats.every((f) => typeof f === 'string' && VALID_SESSION_FORMATS.has(f))
  ) {
    return false;
  }

  if (
    !Array.isArray(profile.venueTypes) ||
    !profile.venueTypes.every((v) => typeof v === 'string' && VALID_VENUE_TYPES.has(v))
  ) {
    return false;
  }

  // String-array fields
  if (!isStringArray(profile.specialties)) {
    return false;
  }

  if (!isStringArray(profile.locations)) {
    return false;
  }

  // Optional fields: validate type when present
  if (profile.bio !== undefined && typeof profile.bio !== 'string') {
    return false;
  }

  if (
    profile.hourlyRate !== undefined &&
    (typeof profile.hourlyRate !== 'number' || isNaN(profile.hourlyRate) || !isFinite(profile.hourlyRate))
  ) {
    return false;
  }

  if (profile.createdAt !== undefined && typeof profile.createdAt !== 'string') {
    return false;
  }

  if (profile.updatedAt !== undefined && typeof profile.updatedAt !== 'string') {
    return false;
  }

  return true;
}

/**
 * Fetch Current Authenticated Coach Profile
 * GET /api/coach/profile/me
 *
 * NOTE: The returned `isComplete` indicates profile data readiness (bio, disciplines, etc.)
 * and MUST NEVER be equated with or interpreted as administrative credential verification.
 */
export async function getCoachProfile(token: string): Promise<CoachProfileResponse> {
  if (!token || typeof token !== 'string' || !token.trim()) {
    throw new AuthApiError('Authentication required. Missing token.', 401);
  }

  const url = `${getApiBaseUrl()}${API_ENDPOINTS.COACH_PROFILE}`;

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

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new AuthApiError('Invalid response from server. Malformed JSON.', response.status);
  }

  if (!isValidCoachProfileResponse(data)) {
    throw new AuthApiError(
      'Unexpected response shape received from coach profile service.',
      response.status
    );
  }

  return data;
}

/**
 * Create or Update Authenticated Coach Profile
 * PUT /api/coach/profile/me
 *
 * NOTE: Only the supplied editable fields from UpdateCoachProfileInput are serialized.
 * Server-controlled properties (such as userId, currency, isPublished, and verification status)
 * are strictly excluded from the payload.
 */
export async function updateCoachProfile(
  token: string,
  input: UpdateCoachProfileInput
): Promise<CoachProfileResponse> {
  if (!token || typeof token !== 'string' || !token.trim()) {
    throw new AuthApiError('Authentication required. Missing token.', 401);
  }

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new AuthApiError('Invalid profile update data. Expected an object.', 400);
  }

  // Serialize only the supplied editable fields; omit unsupplied fields to support partial updates
  const payload: Partial<UpdateCoachProfileInput> = {};
  for (const key of ALLOWED_UPDATE_FIELDS) {
    if (input[key] !== undefined) {
      (payload as Record<string, unknown>)[key] = input[key];
    }
  }

  const url = `${getApiBaseUrl()}${API_ENDPOINTS.COACH_PROFILE}`;

  const response = await safeFetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token.trim()}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorMessage = await parseResponseError(response);
    throw new AuthApiError(errorMessage, response.status);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new AuthApiError('Invalid response from server. Malformed JSON.', response.status);
  }

  if (!isValidCoachProfileResponse(data)) {
    throw new AuthApiError(
      'Unexpected response shape received from coach profile service.',
      response.status
    );
  }

  return data;
}

export { AuthApiError };
