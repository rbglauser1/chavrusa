import 'server-only';
import { readJson, writeJson } from './store';

// Contact us: messages sent from the Contact page (app/contact), kept in the app's own storage (no email needed).
// The owner reads them in Settings → Messages. One small file holds them all, newest first.
export interface ContactMessage { id: string; at: string; name: string; email: string; topic: string; text: string; read?: boolean }
const FILE = 'contact/messages.json';

export async function listMessages(): Promise<ContactMessage[]> { return (await readJson<ContactMessage[]>(FILE)) ?? []; }

export async function addContact(m: Omit<ContactMessage, 'id' | 'at'>): Promise<void> {
  const msg: ContactMessage = { ...m, id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), at: new Date().toISOString() };
  await writeJson(FILE, [msg, ...(await listMessages())].slice(0, 2000));
}
export async function markRead(id: string): Promise<void> {
  await writeJson(FILE, (await listMessages()).map((x) => (x.id === id ? { ...x, read: true } : x)));
}
export async function removeContact(id: string): Promise<void> {
  await writeJson(FILE, (await listMessages()).filter((x) => x.id !== id));
}
