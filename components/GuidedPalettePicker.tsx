'use client';
import { GUIDED_PALETTES, guidedPalette, type GuidedPalette } from '@/lib/guided';
export default function GuidedPalettePicker({value,onChange}:{value?:GuidedPalette;onChange:(value:GuidedPalette)=>void}) {
  return <div className="gl-palettes" role="radiogroup" aria-label="Guided Learning palette">{GUIDED_PALETTES.map(p=><button key={p.id} type="button" role="radio" aria-checked={guidedPalette(value)===p.id} onClick={()=>onChange(p.id)}><span className="gl-swatches" aria-hidden="true">{p.colors.map(c=><i key={c} style={{background:c}}/>)}</span><span>{p.name}</span><span aria-hidden="true">{guidedPalette(value)===p.id?'✓':''}</span></button>)}</div>;
}
