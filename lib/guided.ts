/** Fixed, contrast-aware UI palettes; source text colors remain independent. */
export const GUIDED_PALETTES = [
  { id:'iris', name:'Playful Purple', colors:['#6246c9','#c9f0d9','#ffe5a0'] },
  { id:'lagoon', name:'Lagoon', colors:['#086d68','#c6e5ff','#ffe39b'] },
  { id:'sunset', name:'Sunset', colors:['#b03e57','#e7d9ff','#ffe3ad'] },
  { id:'sky', name:'Blue Sky', colors:['#245bb9','#d7edaf','#fbd6df'] },
] as const;
export type GuidedPalette = typeof GUIDED_PALETTES[number]['id'];
export function guidedPalette(value: unknown): GuidedPalette {
  return GUIDED_PALETTES.find(p=>p.id===value)?.id ?? 'iris';
}
