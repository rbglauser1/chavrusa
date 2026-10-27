// Small reference helpers that work in the browser and on the server.

// The next perek / amud after this one: "Genesis 1" -> "Genesis 2"; "Berakhot 2a" -> "Berakhot 2b" -> "Berakhot 3a";
// "Mishnah Peah 1" -> "Mishnah Peah 2"; "Shulchan Arukh, Orach Chayim 239" -> "... 240". Commentaries: none.
export function nextSection(base: string): string | null {
  if (/ on /i.test(base)) return null;
  const t = base.match(/^(.*?) (\d+)([ab])$/);
  if (t) return t[3] === 'a' ? `${t[1]} ${t[2]}b` : `${t[1]} ${Number(t[2]) + 1}a`;
  const c = base.match(/^(.*?) (\d+)$/);
  return c ? `${c[1]} ${Number(c[2]) + 1}` : null;
}

// The one before: "Berakhot 37a" -> "Berakhot 36b"; "Berakhot 2a" -> none; "Genesis 2" -> "Genesis 1".
export function prevSection(base: string): string | null {
  if (/ on /i.test(base)) return null;
  const t = base.match(/^(.*?) (\d+)([ab])$/);
  if (t) return t[3] === 'b' ? `${t[1]} ${t[2]}a` : Number(t[2]) > 2 ? `${t[1]} ${Number(t[2]) - 1}b` : null;
  const c = base.match(/^(.*?) (\d+)$/);
  return c && Number(c[2]) > 1 ? `${c[1]} ${Number(c[2]) - 1}` : null;
}

// What a section is called: an amud of Gemara, a siman of Shulchan Aruch, otherwise a perek.
export function sectionWord(base: string): string {
  if (/ \d+[ab]$/.test(base)) return 'amud';
  if (/^(Shulchan Arukh|Mishnah Berurah|Tur|Kitzur Shulchan Arukh)/i.test(base)) return 'siman';
  return 'perek';
}
