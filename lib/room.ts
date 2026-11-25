import 'server-only';
import { readJson, writeJson } from './store';

// Nov 25: Learn with a friend. A room is one small file (rooms/<code>.json) in the app's private storage: the text of
// the amud, the line the two of them are pointing at, and their messages (with the chavrusa's, when they call it in).
// Anyone with the link can join (the code is long and random); a room lasts two days and allows 40 AI answers.
export type RoomMsg = { id: number; who: string; text: string; ai?: boolean; at: number };
export type Room = { code: string; ref: string; title: string; he: string[]; en: string[]; line: number; lineBy: string; msgs: RoomMsg[]; created: number; ai: number };
export const ROOM_HOURS = 48, ROOM_AI = 40;
const pathOf = (code: string) => `rooms/${code.replace(/[^a-z0-9]/gi, '').slice(0, 24)}.json`;
export async function readRoom(code: string): Promise<Room | null> {
  const r = await readJson<Room>(pathOf(code));
  if (!r || Date.now() - r.created > ROOM_HOURS * 3600_000) return null;
  return r;
}
export const writeRoom = (r: Room) => writeJson(pathOf(r.code), r);
export function newCode(): string {
  const a = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  const b = new Uint8Array(12); crypto.getRandomValues(b);
  for (const x of b) s += a[x % a.length];
  return s;
}
