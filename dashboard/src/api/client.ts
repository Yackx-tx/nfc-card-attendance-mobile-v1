const API_BASE = '/api/v1';

export interface UserSession {
  token: string;
  refreshToken: string;
  user: {
    id: string;
    organizationId: string;
    email: string;
    role: string;
  };
}

export function getStoredSession(): UserSession | null {
  const data = localStorage.getItem('amas_session');
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export function saveSession(session: UserSession) {
  localStorage.setItem('amas_session', JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem('amas_session');
}

export async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const session = getStoredSession();
  const headers = new Headers(options.headers || {});

  if (session?.token) {
    headers.set('Authorization', `Bearer ${session.token}`);
  }

  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401 && session?.refreshToken) {
    // Attempt token refresh
    const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });

    if (refreshRes.ok) {
      const refreshed = await refreshRes.json();
      saveSession({
        ...session,
        token: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
      });
      // Retry original request
      headers.set('Authorization', `Bearer ${refreshed.accessToken}`);
      const retryRes = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
      });
      if (!retryRes.ok) {
        const err = await retryRes.json().catch(() => ({ message: 'Request failed' }));
        throw new Error(err.message || `Error ${retryRes.status}`);
      }
      return retryRes.json();
    } else {
      clearSession();
      window.location.reload();
      throw new Error('Session expired');
    }
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ message: 'Request failed' }));
    const error = new Error(errorBody.message || `HTTP ${response.status}`);
    (error as any).code = errorBody.code;
    (error as any).details = errorBody.details;
    throw error;
  }

  return response.json();
}
