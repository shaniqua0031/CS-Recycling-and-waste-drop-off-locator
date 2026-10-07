export type UserRole = "RECYCLER" | "COLLECTOR" | "FACILITY" | "ADMIN";

export type AuthUser = {
  id: string;
  email: string;
  role: UserRole;
  displayName: string | null;
};

type ApiEnvelope<T> = { data: T };
type ApiErrorEnvelope = { error?: { code?: string; message?: string } };

function getApiBaseUrl(): string {
  const configuredUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim()
    || process.env.NEXT_PUBLIC_API_URL?.trim();

  if (configuredUrl) {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(configuredUrl);
    } catch {
      if (process.env.NODE_ENV !== "production") {
        return "http://localhost:5000/api/v1";
      }
      throw new AuthApiError("The configured API URL must be an absolute HTTP(S) URL.", 0, "INVALID_API_URL");
    }

    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      if (process.env.NODE_ENV !== "production") {
        return "http://localhost:5000/api/v1";
      }
      throw new AuthApiError("The configured API URL must use HTTP or HTTPS.", 0, "INVALID_API_URL");
    }

    if (process.env.NODE_ENV === "production" && parsedUrl.protocol !== "https:") {
      throw new AuthApiError("The configured API URL must use HTTPS in production.", 0, "INVALID_API_URL");
    }
    return configuredUrl.replace(/\/+$/, "");
  }

  if (process.env.NODE_ENV !== "production") {
    return "http://localhost:5000/api/v1";
  }

  throw new AuthApiError(
    "The API URL is not configured. Set NEXT_PUBLIC_API_BASE_URL to your public API URL and redeploy the frontend.",
    0,
    "API_NOT_CONFIGURED",
  );
}

export class AuthApiError extends Error {
  constructor(message: string, readonly statusCode: number, readonly code?: string) {
    super(message);
    this.name = "AuthApiError";
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const apiBaseUrl = getApiBaseUrl();
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new AuthApiError("Could not reach the WasteWise API. Check that the server is running.", 0, "API_UNAVAILABLE");
  }

  const body = await response.json().catch(() => null) as ApiEnvelope<T> & ApiErrorEnvelope | null;
  if (!response.ok) {
    throw new AuthApiError(
      body?.error?.message ?? "The request could not be completed.",
      response.status,
      body?.error?.code,
    );
  }

  if (!body || !("data" in body)) {
    throw new AuthApiError("The API returned an invalid response.", response.status, "INVALID_API_RESPONSE");
  }

  return body.data;
}

export type RegistrationInput = {
  displayName: string;
  email: string;
  password: string;
  role?: UserRole;
  serviceArea?: string;
  serviceRadiusKm?: number;
  serviceCenterLatitude?: number;
  serviceCenterLongitude?: number;
  vehicleType?: string;
  vehicleDescription?: string;
  vehicleRegistration?: string;
  facilityName?: string;
  facilityAddress?: string;
  facilityLatitude?: number;
  facilityLongitude?: number;
  acceptedMaterials?: string[];
  openingHours?: string[];
};

export function registerRecycler(input: RegistrationInput) {
  return apiRequest<{ user: AuthUser }>('/auth/register', { method: 'POST', body: JSON.stringify(input) });
}

export function login(input: { email: string; password: string }) {
  return apiRequest<{ user: AuthUser }>('/auth/login', { method: 'POST', body: JSON.stringify(input) });
}

export function getSession() {
  return apiRequest<{ authenticated: true; user: AuthUser }>('/auth/session');
}

export function logout() {
  return apiRequest<{ signedOut: true }>('/auth/logout', { method: 'POST' });
}
