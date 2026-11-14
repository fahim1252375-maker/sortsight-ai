const TOKEN_STORAGE_KEY = 'sortsight_auth_token';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // Storage can be unavailable in private browsing or restricted environments.
  }
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers);
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;

  if (options.body != null && !isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`/api/v1${path}`, { ...options, headers });
  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get('content-type') || '';
  const responseText = await response.text();
  let responseBody: unknown = responseText;

  if (responseText && contentType.includes('application/json')) {
    try {
      responseBody = JSON.parse(responseText) as unknown;
    } catch {
      responseBody = { error: 'The server returned invalid JSON.' };
    }
  }

  if (!response.ok) {
    const body = responseBody as { error?: string } | null;
    const message = body && typeof body === 'object' && 'error' in body && body.error
      ? String(body.error)
      : `Request failed (${response.status})`;
    throw new Error(message);
  }

  return responseBody as T;
}
