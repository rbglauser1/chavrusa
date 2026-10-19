import 'server-only';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_SETTINGS, normalizeLook, OWNER_ID, Settings } from './config';

let client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (!client) {
    // Accept the URL however it was copied (e.g. with /rest/v1/ or a trailing slash): keep only https://<project>.supabase.co
    const raw = (process.env.SUPABASE_URL ?? '').trim();
    const url = raw ? (() => { try { return new URL(raw).origin; } catch { return raw; } })() : '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Supabase is not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

// ---------- Settings ----------
export async function getSettings(userId = OWNER_ID): Promise<Settings> {
  const row = check(await db().from('settings').select('data').eq('user_id', userId).maybeSingle());
  const s = { ...DEFAULT_SETTINGS, ...((row as { data?: Partial<Settings> } | null)?.data ?? {}) };
  s.theme = normalizeLook(s.theme);
  return s;
}

export async function saveSettings(patch: Partial<Settings>, userId = OWNER_ID): Promise<Settings> {
  const next = { ...(await getSettings(userId)), ...patch };
  check(await db().from('settings').upsert({ user_id: userId, data: next, updated_at: new Date().toISOString() }));
  return next;
}

// ---------- Memory ----------
export interface Memory { id: string; kind: 'instruction' | 'observation' | 'note'; content: string; scope: string | null; created_at: string }

export async function listMemories(userId = OWNER_ID): Promise<Memory[]> {
  return check(await db().from('memories').select('id, kind, content, scope, created_at')
    .eq('user_id', userId).eq('active', true).order('created_at')) as Memory[];
}

export async function addMemory(m: { kind: Memory['kind']; content: string; scope?: string | null }, userId = OWNER_ID): Promise<Memory> {
  return check(await db().from('memories').insert({ user_id: userId, kind: m.kind, content: m.content, scope: m.scope ?? null })
    .select('id, kind, content, scope, created_at').single()) as Memory;
}

export async function forgetMemory(id: string, userId = OWNER_ID): Promise<void> {
  check(await db().from('memories').update({ active: false }).eq('id', id).eq('user_id', userId));
}

export async function updateMemory(id: string, content: string, userId = OWNER_ID): Promise<void> {
  check(await db().from('memories').update({ content }).eq('id', id).eq('user_id', userId));
}

// ---------- Sessions ----------
export interface SessionRow { id: string; title: string; created_at: string; updated_at: string }
export interface MessageRow { id: string; role: 'user' | 'assistant'; content: string; meta: Record<string, unknown> | null; created_at: string }
export interface SourceRow { id: string; ref: string; he_ref: string | null; data: SourceData; created_at: string }
export interface SourceData {
  ref: string; heRef: string; he: string[]; en: string[];
  translation: string | null;   // approved translation version title, or null
  url: string;
}

export async function listSessions(userId = OWNER_ID): Promise<SessionRow[]> {
  return check(await db().from('sessions').select('id, title, created_at, updated_at')
    .eq('user_id', userId).order('updated_at', { ascending: false }).limit(100)) as SessionRow[];
}

export async function createSession(title = 'New session', userId = OWNER_ID): Promise<SessionRow> {
  return check(await db().from('sessions').insert({ user_id: userId, title }).select('id, title, created_at, updated_at').single()) as SessionRow;
}

export async function getSession(id: string, userId = OWNER_ID): Promise<SessionRow | null> {
  return check(await db().from('sessions').select('id, title, created_at, updated_at').eq('id', id).eq('user_id', userId).maybeSingle()) as SessionRow | null;
}

export async function touchSession(id: string, title?: string): Promise<void> {
  const patch: Record<string, string> = { updated_at: new Date().toISOString() };
  if (title) patch.title = title;
  check(await db().from('sessions').update(patch).eq('id', id));
}

export async function deleteSession(id: string, userId = OWNER_ID): Promise<void> {
  check(await db().from('sessions').delete().eq('id', id).eq('user_id', userId));
}

export async function listMessages(sessionId: string, limit = 200): Promise<MessageRow[]> {
  const rows = check(await db().from('messages').select('id, role, content, meta, created_at')
    .eq('session_id', sessionId).order('created_at', { ascending: false }).limit(limit)) as MessageRow[];
  return rows.reverse();
}

export async function addMessage(sessionId: string, role: 'user' | 'assistant', content: string, meta?: Record<string, unknown>): Promise<void> {
  check(await db().from('messages').insert({ session_id: sessionId, role, content, meta: meta ?? null }));
}

export async function listSources(sessionId: string): Promise<SourceRow[]> {
  return check(await db().from('session_sources').select('id, ref, he_ref, data, created_at')
    .eq('session_id', sessionId).order('created_at')) as SourceRow[];
}

export async function addSource(sessionId: string, s: SourceData): Promise<void> {
  check(await db().from('session_sources').insert({ session_id: sessionId, ref: s.ref, he_ref: s.heRef, data: s }));
}

// ---------- Costs ----------
export async function logCost(e: { sessionId?: string | null; kind?: string; provider: string; model: string; inputTokens: number; outputTokens: number; costUsd: number }, userId = OWNER_ID): Promise<void> {
  check(await db().from('cost_log').insert({
    user_id: userId, session_id: e.sessionId ?? null, kind: e.kind ?? 'chat', provider: e.provider, model: e.model,
    input_tokens: e.inputTokens, output_tokens: e.outputTokens, cost_usd: e.costUsd,
  }));
}

export async function sessionCost(sessionId: string): Promise<number> {
  const rows = check(await db().from('cost_log').select('cost_usd').eq('session_id', sessionId)) as { cost_usd: number | string }[];
  return rows.reduce((sum, r) => sum + Number(r.cost_usd), 0);
}

export async function costSummary(userId = OWNER_ID) {
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const rows = check(await db().from('cost_log').select('model, kind, input_tokens, output_tokens, cost_usd, created_at')
    .eq('user_id', userId).gte('created_at', since)) as { model: string; kind: string; input_tokens: number; output_tokens: number; cost_usd: number | string }[];
  const byModel: Record<string, { exchanges: number; inputTokens: number; outputTokens: number; usd: number }> = {};
  let total = 0;
  for (const r of rows) {
    const k = `${r.model} (${r.kind})`;
    byModel[k] ??= { exchanges: 0, inputTokens: 0, outputTokens: 0, usd: 0 };
    byModel[k].exchanges++;
    byModel[k].inputTokens += r.input_tokens;
    byModel[k].outputTokens += r.output_tokens;
    byModel[k].usd += Number(r.cost_usd);
    total += Number(r.cost_usd);
  }
  return { days: 30, totalUsd: total, byModel };
}

// ---------- Approved list ----------
export interface ApprovedRow { kind: 'work' | 'author' | 'translation' | 'site'; name: string; status: 'approved' | 'blocked'; lean: string }

let approvedCache: { at: number; rows: ApprovedRow[] } | null = null;
export async function approvedList(): Promise<ApprovedRow[]> {
  if (approvedCache && Date.now() - approvedCache.at < 60_000) return approvedCache.rows;
  const rows = check(await db().from('approved_sources').select('kind, name, status, lean')) as ApprovedRow[];
  approvedCache = { at: Date.now(), rows };
  return rows;
}
