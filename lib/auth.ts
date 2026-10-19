// Simple password gate for the single-user phase. Works in middleware (edge) and server routes.
export const AUTH_COOKIE = 'chavrusa_auth';

export async function authToken(): Promise<string> {
  const pw = process.env.APP_PASSWORD ?? '';
  const bytes = new TextEncoder().encode(`chavrusa:${pw}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
