// Mikraos Gedolos (Chumash): the meforshim the learner can put on his page (Settings → the page's "Meforshim" panel).
// `title` gives Sefaria's name for the commentary on a book; the default page has the first five.
export interface Meforesh { id: string; he: string; name: string; title: (book: string) => string }
export const MEFORSHIM: Meforesh[] = [
  { id: 'Rashi', he: 'רש״י', name: 'Rashi', title: (b) => `Rashi on ${b}` },
  { id: 'Ramban', he: 'רמב״ן', name: 'Ramban', title: (b) => `Ramban on ${b}` },
  { id: 'Ibn Ezra', he: 'אבן עזרא', name: 'Ibn Ezra', title: (b) => `Ibn Ezra on ${b}` },
  { id: 'Sforno', he: 'ספורנו', name: 'Sforno', title: (b) => `Sforno on ${b}` },
  { id: 'Or HaChaim', he: 'אור החיים', name: 'Ohr HaChaim', title: (b) => `Or HaChaim on ${b}` },
  { id: 'Rashbam', he: 'רשב״ם', name: 'Rashbam', title: (b) => `Rashbam on ${b}` },
  { id: 'Kli Yakar', he: 'כלי יקר', name: 'Kli Yakar', title: (b) => `Kli Yakar on ${b}` },
  { id: 'Daat Zekenim', he: 'דעת זקנים', name: 'Daas Zekeinim', title: (b) => `Da'at Zekenim on ${b}` },
  { id: 'Baal HaTurim', he: 'בעל הטורים', name: 'Baal HaTurim', title: (b) => `Ba'al HaTurim on ${b}` },
  { id: 'Chizkuni', he: 'חזקוני', name: 'Chizkuni', title: (b) => `Chizkuni, ${b}` },
  { id: 'Siftei Chakhamim', he: 'שפתי חכמים', name: 'Sifsei Chachamim', title: (b) => `Siftei Chakhamim, ${b}` },
  { id: 'Haamek Davar', he: 'העמק דבר', name: 'Haamek Davar', title: (b) => `Haamek Davar on ${b}` },
  { id: 'Malbim', he: 'מלבי״ם', name: 'Malbim', title: (b) => `Malbim on ${b}` },
  { id: 'Tur HaArokh', he: 'טור הארוך', name: 'Tur HaAroch', title: (b) => `Tur HaArokh, ${b}` },
];
export const MG_DEFAULT = ['Rashi', 'Ramban', 'Ibn Ezra', 'Sforno', 'Or HaChaim'];
