import 'server-only';
import { readJson, writeJson } from './store';

// Notes on the line (Settings → Extras): the learner's own notes, each on a line of a text ("Yoma 6a", line 4).
// One small file holds them all (fine for thousands of notes).
export interface Note { id: string; ref: string; n: number; text: string; created: string }
const FILE = 'notes/all.json';

export async function allNotes(): Promise<Note[]> { return (await readJson<Note[]>(FILE)) ?? []; }
export async function notesFor(ref: string): Promise<Note[]> { return (await allNotes()).filter((x) => x.ref === ref); }
export async function addNote(ref: string, n: number, text: string): Promise<Note> {
  const note: Note = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), ref, n, text: text.trim().slice(0, 4000), created: new Date().toISOString() };
  await writeJson(FILE, [...(await allNotes()), note]);
  return note;
}
export async function updateNote(id: string, text: string): Promise<void> {
  await writeJson(FILE, (await allNotes()).map((x) => (x.id === id ? { ...x, text: text.trim().slice(0, 4000) } : x)));
}
export async function removeNote(id: string): Promise<void> {
  await writeJson(FILE, (await allNotes()).filter((x) => x.id !== id));
}
