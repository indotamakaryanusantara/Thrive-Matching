const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
const APPS_SCRIPT_SECRET = process.env.APPS_SCRIPT_SECRET;

export function assertAppsScriptConfig() {
  if (!APPS_SCRIPT_URL || !APPS_SCRIPT_SECRET) {
    throw new Error('APPS_SCRIPT_URL and APPS_SCRIPT_SECRET must be set in Vercel');
  }
}

export async function fetchAppsScript<T>(
  action: string,
  options?: { method?: 'GET' | 'POST'; body?: Record<string, unknown> }
): Promise<T> {
  assertAppsScriptConfig();
  const method = options?.method ?? 'GET';

  if (method === 'GET') {
    const url = new URL(APPS_SCRIPT_URL!);
    url.searchParams.set('action', action);
    url.searchParams.set('token', APPS_SCRIPT_SECRET!);
    const res = await fetch(url.toString(), { cache: 'no-store', redirect: 'follow' });
    if (!res.ok) throw new Error(`Apps Script ${action} failed: ${res.status}`);
    return res.json() as Promise<T>;
  }

  const res = await fetch(APPS_SCRIPT_URL!, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    redirect: 'follow',
    body: JSON.stringify({
      token: APPS_SCRIPT_SECRET,
      action,
      ...options?.body,
    }),
  });
  if (!res.ok) throw new Error(`Apps Script ${action} failed: ${res.status}`);
  return res.json() as Promise<T>;
}
