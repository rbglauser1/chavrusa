import 'server-only';
import { readJson, writeJson } from './store';

// Notes (Settings → Extras, on unless switched off): the learner's own notes. One small file holds them all (fine
// for thousands), and every note shows in the Notebook (components/Notebook.tsx).
//   ref + n: the line it belongs to ("Yoma 6a", line 4). A note on its own (a notebook page) has ref "" and n 0.
//   on:      what it is about, when not the line itself ("Rashi", "Tosafos", "Explanation", "Sugya map", "Ideas"…).
//   quote:   a few words of what it was written on (the Rashi, the map step…), to remember it by.
// Topics are the #words in its text (#kashya, #halacha…).
export interface Note { id: string; ref: string; n: number; text: string; created: string; updated?: string; on?: string; quote?: string; at?: number }
const FILE = 'notes/all.json';

export const tagsOf = (text: string) => [...new Set((text.match(/#[\p{L}\p{N}_-]+/gu) ?? []).map((t) => t.slice(1).toLowerCase()))];

export async function allNotes(): Promise<Note[]> { return (await readJson<Note[]>(FILE)) ?? []; }
export async function notesFor(ref: string): Promise<Note[]> { return (await allNotes()).filter((x) => x.ref === ref); }
export async function addNote(ref: string, n: number, text: string, on?: string, quote?: string, at?: number): Promise<Note> {
  const note: Note = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), ref, n, text: text.trim().slice(0, 4000), created: new Date().toISOString(),
    ...(on ? { on: on.slice(0, 80) } : {}), ...(quote ? { quote: quote.trim().slice(0, 240) } : {}), ...(quote && typeof at === 'number' && at >= 0 ? { at: Math.floor(at) } : {}),
  };
  await writeJson(FILE, [...(await allNotes()), note]);
  return note;
}
export async function updateNote(id: string, text: string): Promise<void> {
  await writeJson(FILE, (await allNotes()).map((x) => (x.id === id ? { ...x, text: text.trim().slice(0, 4000), updated: new Date().toISOString() } : x)));
}
export async function removeNote(id: string): Promise<void> {
  await writeJson(FILE, (await allNotes()).filter((x) => x.id !== id));
}
