export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function get<T>(url: string): Promise<T> {
  const resp = await fetch(url);
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    let msg: string;
    try { msg = (JSON.parse(body) as { error?: string }).error || body; } catch { msg = body; }
    throw new ApiError(resp.status, msg || `HTTP ${resp.status}`);
  }
  return resp.json() as Promise<T>;
}

export async function post<T>(url: string, body?: unknown): Promise<T> {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    let msg: string;
    try { msg = (JSON.parse(text) as { error?: string }).error || text; } catch { msg = text; }
    throw new ApiError(resp.status, msg || `HTTP ${resp.status}`);
  }
  return resp.json() as Promise<T>;
}
