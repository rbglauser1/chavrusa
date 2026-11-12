/** Optional interfaces; old look IDs and defaults remain independent. */
export const EXPERIENCES = [
  { id: 'paper-ink', name: 'Paper and Ink', blurb: 'A quiet editorial library and a paper reading desk.' },
  { id: 'midnight-sefer', name: 'Midnight Sefer', blurb: 'A midnight study room with gold details and a sefer beside the conversation.' },
  { id: 'beis-medrash', name: 'Beis Medrash', blurb: 'A warm study hall, a library entrance and a cream reading desk.' },
  { id: 'sand-teal', name: 'Sand and Teal', blurb: 'An approachable study studio with deep teal controls.' },
  { id: 'editorial', name: 'Editorial', blurb: 'A copper and ivory reading journal with strong typography.' },
  { id: 'guided-learning', name: 'Guided Learning', blurb: 'A focused study path with reading, discussion and recall actions.' },
  { id: 'living-page', name: 'The Living Page', blurb: 'An expansive ink and cobalt page with a floating navigation dock.' },
  { id: 'study-workspace', name: 'Study Workspace', blurb: 'The indigo Berachos workspace with text and conversation together.' },
] as const;
export type Experience = typeof EXPERIENCES[number]['id'];
export function isExperience(value: unknown): value is Experience { return EXPERIENCES.some((x) => x.id === value); }
