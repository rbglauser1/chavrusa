// "Each in its own lettering" (Settings → Look → Commentaries on the page): every meforesh gets its own Hebrew font,
// so you can tell them apart at a glance, the way they look different on a printed page. Rashi and Tosafos keep the
// classic Rashi script; the rest get distinct book faces. The fonts are set in app/globals.css (`[data-mf=…]`).

/** The key for a meforesh's title or ref ("Ramban on Genesis 24:1" → "ramban"). Unknown ones get "other". */
export function mfKey(title?: string | null): string {
  const t = (title ?? '').replace(/ on .*$/i, '').toLowerCase().replace(/[^a-z]/g, '');
  if (!t) return 'other';
  if (t === 'rashi') return 'rashi';
  if (t.startsWith('tosaf') || t.startsWith('tosfos')) return 'tosafos';
  if (t === 'ramban' || t === 'nachmanides') return 'ramban';
  if (t.startsWith('ibnezra')) return 'ibnezra';
  if (t.startsWith('sforno') || t.startsWith('seforno')) return 'sforno';
  if (t.includes('ohrhachaim') || t.includes('orhachaim') || t.includes('orhahayyim')) return 'ohrhachaim';
  if (t.includes('kliyakar') || t.includes('kliyakar')) return 'kliyakar';
  if (t === 'rashbam') return 'rashbam';
  if (t.includes('baalhaturim')) return 'baalhaturim';
  if (t.startsWith('chizkuni')) return 'chizkuni';
  if (t.includes('daat') || t.includes('daas')) return 'daas';
  if (t.includes('gurarye')) return 'guraryeh';
  if (t.includes('siftei') || t.includes('sifsei')) return 'sifsei';
  if (t.startsWith('onkelos') || t.startsWith('targum')) return 'targum';
  if (t === 'ran' || t === 'rosh' || t === 'rif') return t;
  if (t.startsWith('maharsha')) return 'maharsha';
  if (t.startsWith('rashba')) return 'rashba';
  if (t.startsWith('ritva')) return 'ritva';
  return 'other';
}
