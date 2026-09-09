import { useState } from 'react';
const brand=['#123e59','#176b87','#4e98a0','#dce9ef','#ffffff','#252f37'];
export function ColorControl({label,value,onChange,documentColors=[]}:{label:string;value:string;onChange:(v:string)=>void;documentColors?:string[]}){
 const [open,setOpen]=useState(false),[hex,setHex]=useState(value),[recent,setRecent]=useState<string[]>([]);
 const apply=(v:string)=>{onChange(v);setHex(v);setRecent(a=>[v,...a.filter(c=>c!==v)].slice(0,6));setOpen(false);};
 return <div className="color-control"><button className="color-trigger" onClick={()=>{setHex(value);setOpen(!open);}} aria-expanded={open}><span style={{background:value}}/>{label}</button>{open&&<div className="color-popover" role="dialog" aria-label={label}><b>{label}</b>{[['PRESYS',brand],['No documento',[...new Set(documentColors)].slice(0,6)],['Recentes',recent]].map(([name,colors])=><div key={name as string}><p>{name}</p><div className="swatches">{(colors as string[]).map(c=><button key={c} aria-label={`${name} ${c}`} title={c} style={{background:c}} onClick={()=>apply(c)}/>)}</div></div>)}<label>Personalizada<input type="color" aria-label="Cor personalizada" value={/^#[0-9a-f]{6}$/i.test(hex)?hex:value} onChange={e=>setHex(e.target.value)}/></label><div className="form-row"><input aria-label="HEX" value={hex} onChange={e=>setHex(e.target.value)}/><button disabled={!/^#[0-9a-f]{6}$/i.test(hex)} onClick={()=>apply(hex)}>Aplicar</button></div><button className="wide" onClick={()=>setOpen(false)}>Fechar cores</button></div>}</div>;
}

