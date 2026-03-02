export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const init: RequestInit = { method, signal };
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  const resp = await fetch(url, init);
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    let msg: string;
    try { msg = (JSON.parse(text) as { error?: string }).error || text; } catch { msg = text; }
    throw new ApiError(resp.status, msg || `HTTP ${resp.status}`);
  }
  const contentLength = resp.headers.get('content-length');
  if (resp.status === 204 || contentLength === '0') {
    return undefined as T;
  }
  return resp.json() as Promise<T>;
}

export function get<T>(url: string, signal?: AbortSignal): Promise<T> {
  return request<T>('GET', url, undefined, signal);
}

export function post<T>(url: string, body?: unknown): Promise<T> {
  return request<T>('POST', url, body);
}

export function patch<T>(url: string, body: unknown): Promise<T> {
  return request<T>('PATCH', url, body);
}

export function put<T>(url: string, body: unknown): Promise<T> {
  return request<T>('PUT', url, body);
}

export function del<T>(url: string): Promise<T> {
  return request<T>('DELETE', url);
}
