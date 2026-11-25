import { NextRequest, NextResponse } from 'next/server';
import { MODELS, costUsd } from '@/lib/config';
import { getSettings, logCost } from '@/lib/db';
import { runAnthropic } from '@/lib/llm/anthropic';
import { runOpenAI } from '@/lib/llm/openai';
import { needCredit } from '@/lib/credits';
import { SCOPE } from '@/lib/scope';
import { stripNikud } from '@/lib/hebrew';
import { readRoom, writeRoom, ROOM_AI, type Room } from '@/lib/room';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Nov 25: a Learn with a friend room (open to anyone with its link; see middleware). GET: the room (the text only when
// asked for, the rest each few seconds). POST: point at a line, say something, or call the chavrusa in.
const lite = (r: Room, full: boolean) => ({ ref: r.ref, title: r.title, line: r.line, lineBy: r.lineBy, msgs: r.msgs.slice(-80), aiLeft: Math.max(0, ROOM_AI - r.ai), ...(full ? { he: r.he, en: r.en } : {}) });

export async function GET(req: NextRequest) {
  const r = await readRoom(String(req.nextUrl.searchParams.get('c') ?? ''));
  if (!r) return NextResponse.json({ error: 'This room has ended or the link is wrong.' }, { status: 404 });
  return NextResponse.json(lite(r, req.nextUrl.searchParams.get('full') === '1'));
}

const AI = `You are a warm, sharp chavrusa, called in as a third voice by two friends learning together. They point at a line (marked >>> <<<) and talk it over; one of them asks you in. Answer what they asked or are stuck on, in 40 to 100 words, like a chavrusa joining the table: clear, to the point, from the text and the standard meforshim. Name a source only if you are sure it says it; if you are not sure, say so. Address them both. No markdown. Hebrew and Aramaic words in Hebrew letters.`;

export async function POST(req: NextRequest) {
  try {
    const b = await req.json().catch(() => ({}));
    const r = await readRoom(String(b.c ?? ''));
    if (!r) return NextResponse.json({ error: 'This room has ended or the link is wrong.' }, { status: 404 });
    const who = String(b.who ?? '').trim().slice(0, 30) || 'Friend';
    if (Number.isInteger(b.line)) {
      r.line = Math.min(Math.max(1, b.line), r.he.length); r.lineBy = who;
      await writeRoom(r); return NextResponse.json(lite(r, false));
    }
    const text = String(b.text ?? '').trim().slice(0, 1500);
    const add = (m: Omit<Room['msgs'][number], 'id' | 'at'>) => r.msgs.push({ ...m, id: (r.msgs[r.msgs.length - 1]?.id ?? 0) + 1, at: Date.now() });
    if (text) add({ who, text });
    if (b.ai === true) {
      if (r.ai >= ROOM_AI) { add({ who: 'Chavrusa', text: 'This room has used all its answers from the chavrusa. Keep learning together!', ai: true }); await writeRoom(r); return NextResponse.json(lite(r, false)); }
      await writeRoom(r); // their message shows right away
      await needCredit();
      const settings = await getSettings();
      const model = MODELS[settings.provider][settings.tier];
      const run = settings.provider === 'openai' ? runOpenAI : runAnthropic;
      const n = r.line;
      const lines = r.he.map((h, i) => (Math.abs(i + 1 - n) <= 4 ? `[${i + 1}] ${i + 1 === n ? '>>> ' : ''}${stripNikud(h).slice(0, 800)}${i + 1 === n ? ' <<<' : ''}${r.en[i] ? `\n    ${r.en[i].slice(0, 800)}` : ''}` : '')).filter(Boolean).join('\n');
      const talk = r.msgs.slice(-12).map((m) => `${m.ai ? 'You (the chavrusa)' : m.who}: ${m.text}`).join('\n');
      const out = await run({ lang: true, model: model.id, system: `${AI}\n\n${SCOPE}`, history: [{ role: 'user', content: `${r.ref}, line ${n}\n\n${lines}\n\n---\nTheir conversation:\n${talk || '(none yet)'}\n\n${who} calls you in${text ? '' : ' on this line'}.` }], tools: [], execute: async () => '', effort: model.effort, thinking: 'disabled', maxSteps: 1, maxTokens: 500 });
      await logCost({ sessionId: null, kind: 'room-ai', provider: settings.provider, model: model.id, inputTokens: out.inputTokens, outputTokens: out.outputTokens, costUsd: costUsd(model, out.inputTokens, out.outputTokens) }).catch(() => {});
      const fresh = (await readRoom(r.code)) ?? r; // they may have written meanwhile
      fresh.ai = r.ai + 1;
      fresh.msgs.push({ id: (fresh.msgs[fresh.msgs.length - 1]?.id ?? 0) + 1, who: 'Chavrusa', text: out.text.replace(/\*\*|__/g, '').trim().slice(0, 2000) || 'I couldn’t answer just now.', ai: true, at: Date.now() });
      await writeRoom(fresh); return NextResponse.json(lite(fresh, false));
    }
    if (!text) return NextResponse.json({ error: 'Nothing to send.' }, { status: 400 });
    // Re-read just before writing, so a message the other sent a moment ago isn't lost.
    const fresh = (await readRoom(r.code)) ?? r;
    fresh.msgs.push({ id: (fresh.msgs[fresh.msgs.length - 1]?.id ?? 0) + 1, who, text, at: Date.now() });
    await writeRoom(fresh); return NextResponse.json(lite(fresh, false));
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}
