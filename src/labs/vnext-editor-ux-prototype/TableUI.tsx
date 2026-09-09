import { useState, type PointerEvent as PE } from 'react';
import { Plus, Trash2, Maximize2 } from 'lucide-react';
import type { Item } from './fixtures';
import { ColorControl } from './ColorControl';
export type Range={id:string;r0:number;c0:number;r1:number;c1:number};
type Props={o:Item;range:Range|null;setRange:(r:Range|null)=>void;patch:(id:string,v:Partial<Item>)=>void;select:()=>void;zoom:number;mini?:boolean;active?:boolean};
const bounds=(a:Range)=>({r0:Math.min(a.r0,a.r1),r1:Math.max(a.r0,a.r1),c0:Math.min(a.c0,a.c1),c1:Math.max(a.c0,a.c1)});

export function TableCanvas({o,range,setRange,patch,select,zoom,mini=false,active=false}:Props){
 const [edit,setEdit]=useState(''),[anchor,setAnchor]=useState<{r:number;c:number}|null>(null),[liveWidths,setLiveWidths]=useState<number[]|null>(null);
 const rows=o.rows||[],widths=liveWidths||o.widths||rows[0]?.map(()=>100/rows[0].length)||[];
 const b=range?.id===o.id?bounds(range):null;
 const choose=(e:PE,r:number,c:number)=>{e.stopPropagation();select();setRange(e.shiftKey&&range?.id===o.id?{...range,r1:r,c1:c}:{id:o.id,r0:r,c0:c,r1:r,c1:c});setAnchor({r,c});};
 const resizeColumn=(e:PE,c:number)=>{e.stopPropagation();const el=e.currentTarget as HTMLElement;el.setPointerCapture(e.pointerId);const x=e.clientX,original=[...widths];let next=original;
 const move=(ev:PointerEvent)=>{const d=(ev.clientX-x)/zoom/o.w*100;const shift=Math.max(8-original[c],Math.min(original[c+1]-8,d));next=[...original];next[c]+=shift;next[c+1]-=shift;setLiveWidths(next);};
 const end=()=>{el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',end);el.removeEventListener('pointercancel',end);patch(o.id,{widths:next});setLiveWidths(null);};el.addEventListener('pointermove',move);el.addEventListener('pointerup',end);el.addEventListener('pointercancel',end);};
 const editorial=(key:'title'|'group'|'note'|'footnote'|'section',className:string)=>o[key]&&<div className={className} onPointerDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()} contentEditable={!mini&&edit===key} suppressContentEditableWarning aria-label={!mini?({title:'Título da tabela',group:'Cabeçalho agrupado',note:'Nota da tabela',footnote:'Nota de rodapé',section:'Seção da tabela'})[key]:undefined} onDoubleClick={()=>!mini&&setEdit(key)} onBlur={e=>{if(edit===key){patch(o.id,{[key]:e.currentTarget.innerText});setEdit('');}}}>{o[key]}</div>;

 const contentHeight=(rows.length*(o.size*1.3+2*(o.padding??10))+(o.title?36:0)+(o.group?38:0)+(o.section?28:0)+(o.note?26:0)+(o.footnote?26:0));
 const isOverflowing=contentHeight>o.h;
 const fitHeight=()=>patch(o.id,{h:Math.ceil(contentHeight+16)});

 return <div className={`table-frame ${active?'active':''}`} onPointerUp={()=>setAnchor(null)}>
  <div className="table-content-viewport">
   {editorial('title','table-title')}
   {editorial('group','table-group')}
   {editorial('section','table-section')}
   {active&&!mini&&<div className="column-selectors">{widths.map((w,c)=>{
    const isColSel=b&&b.c0<=c&&c<=b.c1&&b.r0===0&&b.r1===rows.length-1;
    return <div style={{width:w+'%'}} key={c}><button type="button" className={isColSel?'selected':''} aria-label={`Selecionar coluna ${String.fromCharCode(65+c)}`} onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();select();setRange({id:o.id,r0:0,c0:c,r1:rows.length-1,c1:c});}}>{String.fromCharCode(65+c)}</button>{c<widths.length-1&&<span role="slider" aria-label={`Largura da coluna ${c+1}`} className="column-resizer" onPointerDown={e=>resizeColumn(e,c)}/>}</div>;
   })}</div>}
   <table aria-label={!mini?'Tabela técnica editável':undefined} style={{fontSize:o.size,textAlign:o.align||'left'}}><colgroup>{widths.map((w,i)=><col key={i} style={{width:w+'%'}}/>)}</colgroup><tbody>{rows.map((row,r)=>{
    const isRowSel=active&&b&&b.r0<=r&&r<=b.r1&&b.c0===0&&b.c1===row.length-1;
    return <tr key={r}>{row.map((text,c)=>{
     const span=o.merges?.find(m=>r>=m.r&&r<m.r+m.rs&&c>=m.c&&c<m.c+m.cs);
     if(span&&(span.r!==r||span.c!==c))return null;
     const key=r+':'+c,cell=o.cells?.[key],isSelected=active&&b&&r>=b.r0&&r<=b.r1&&c>=b.c0&&c<=b.c1;
     return <td key={c} rowSpan={span?.rs||1} colSpan={span?.cs||1} data-cell={mini?undefined:key} className={`${isSelected?'cell-selected':''} ${isRowSel?'row-selected':''}`} style={{background:cell?.fill||(r===0&&o.header?o.fill==='#ffffff'?'#123e59':o.fill:r%2?'#f1f5f7':'white'),color:cell?.color||(r===0&&o.header?'white':o.color),textAlign:cell?.align||o.align,padding:o.padding??10,border:o.borders?'1px solid #d7e1e7':'0'}} onPointerDown={e=>{if(!mini)choose(e,r,c);}} onPointerEnter={e=>{if(anchor&&e.buttons===1)setRange({id:o.id,r0:anchor.r,c0:anchor.c,r1:r,c1:c});}} onClick={e=>e.stopPropagation()}>
      {active&&c===0&&!mini&&<button type="button" className={`row-selector ${isRowSel?'selected':''}`} aria-label={`Selecionar linha ${r+1}`} onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();select();setRange({id:o.id,r0:r,c0:0,r1:r,c1:row.length-1});}}>{r+1}</button>}
      <div contentEditable={!mini&&edit===key} suppressContentEditableWarning aria-label={!mini?`Célula ${String.fromCharCode(65+c)}${r+1}`:undefined} onDoubleClick={()=>!mini&&setEdit(key)} onBlur={e=>{if(edit===key){const next=structuredClone(rows);next[r][c]=e.currentTarget.innerText;patch(o.id,{rows:next});setEdit('');}}} onKeyDown={e=>{if(edit===key&&e.key==='Enter'&&!e.shiftKey){e.preventDefault();e.currentTarget.blur();}}}>{text||' '}</div></td>;
    })}</tr>;
   })}</tbody></table>
   {editorial('note','table-note')}{editorial('footnote','table-footnote')}
  </div>
  {isOverflowing&&active&&!mini&&<div className="table-overflow-banner"><span>Conteúdo excede a altura do quadro</span><button type="button" onClick={fitHeight}><Maximize2 size={12}/>Ajustar altura</button></div>}
 </div>;
}

type ControlProps={o:Item;range:Range|null;patch:Props['patch'];setRange:Props['setRange'];documentColors:string[];onSave:()=>void;inspector?:boolean};
export function TableControls({o,range,patch,setRange,documentColors,onSave,inspector=false}:ControlProps){
 const b=range?.id===o.id?bounds(range):{r0:0,c0:0,r1:0,c1:0},rows=o.rows||[],cols=rows[0]?.length||1;
 const isRowSel=range?.id===o.id&&b.c0===0&&b.c1===cols-1;
 const isColSel=range?.id===o.id&&b.r0===0&&b.r1===rows.length-1;
 const isSingleCell=range?.id===o.id&&b.r0===b.r1&&b.c0===b.c1;
 const isMultiCell=range?.id===o.id&&(b.r0!==b.r1||b.c0!==b.c1);

 const labelRange=()=>{
  if(!range||range.id!==o.id)return 'Tabela';
  if(isRowSel)return b.r0===b.r1?`Linha ${b.r0+1}`:`Linhas ${b.r0+1}–${b.r1+1}`;
  if(isColSel)return b.c0===b.c1?`Coluna ${String.fromCharCode(65+b.c0)}`:`Colunas ${String.fromCharCode(65+b.c0)}–${String.fromCharCode(65+b.c1)}`;
  if(isSingleCell)return `Célula ${String.fromCharCode(65+b.c0)}${b.r0+1}`;
  return `${(b.r1-b.r0+1)*(b.c1-b.c0+1)} células`;
 };

 const structural=(action:string)=>{if(!action)return;const next=structuredClone(rows);let widths=[...(o.widths||[])];
  if(action==='add-row')next.splice(b.r1+1,0,Array(cols).fill('Novo valor'));
  if(action==='remove-row'){if(next.length<=b.r1-b.r0+1)return;next.splice(b.r0,b.r1-b.r0+1);}
  if(action==='add-col'){next.forEach(r=>r.splice(b.c1+1,0,'Novo campo'));widths=Array(cols+1).fill(100/(cols+1));}
  if(action==='remove-col'){if(cols<=b.c1-b.c0+1)return;next.forEach(r=>r.splice(b.c0,b.c1-b.c0+1));widths=Array(next[0].length).fill(100/next[0].length);}
  patch(o.id,{rows:next,widths,merges:[],cells:{}});setRange(null);
 };

 const applyCell=(v:{fill?:string;color?:string;align?:'left'|'center'|'right'})=>{const cells={...o.cells};for(let r=b.r0;r<=b.r1;r++)for(let c=b.c0;c<=b.c1;c++)cells[r+':'+c]={...cells[r+':'+c],...v};patch(o.id,{cells});};
 const merge=()=>{const overlaps=(o.merges||[]).some(m=>m.r<=b.r1&&m.r+m.rs>b.r0&&m.c<=b.c1&&m.c+m.cs>b.c0);if(overlaps)return;patch(o.id,{merges:[...(o.merges||[]),{r:b.r0,c:b.c0,rs:b.r1-b.r0+1,cs:b.c1-b.c0+1}]});};
 const unmerge=()=>patch(o.id,{merges:(o.merges||[]).filter(m=>!(m.r<=b.r1&&m.r+m.rs>b.r0&&m.c<=b.c1&&m.c+m.cs>b.c0))});

 const contentHeight=(rows.length*(o.size*1.3+2*(o.padding??10))+(o.title?36:0)+(o.group?38:0)+(o.section?28:0)+(o.note?26:0)+(o.footnote?26:0));
 const isOverflowing=contentHeight>o.h;
 const fitHeight=()=>patch(o.id,{h:Math.ceil(contentHeight+16)});

 const currentCellFill=o.cells?.[b.r0+':'+b.c0]?.fill||'#ffffff';
 const currentCellAlign=o.cells?.[b.r0+':'+b.c0]?.align||'left';

 if(!inspector)return <div className="table-quick">
  <span className="table-quick-badge">{labelRange()}</span>
  <button type="button" onClick={()=>structural('add-row')} title="Adicionar linha abaixo"><Plus size={13}/>Linha</button>
  <button type="button" onClick={()=>structural('add-col')} title="Adicionar coluna à direita"><Plus size={13}/>Coluna</button>
  {(isRowSel||isColSel)&&<button type="button" className="danger-btn" onClick={()=>structural(isRowSel?'remove-row':'remove-col')} title={`Excluir ${isRowSel?'linha':'coluna'}`}><Trash2 size={13}/>Excluir</button>}
  <button type="button" disabled={!isMultiCell} onClick={merge} title={isMultiCell?'Mesclar células selecionadas':'Selecione 2 ou mais células para mesclar'}>Mesclar</button>
  <button type="button" disabled={!o.merges?.length} onClick={unmerge} title="Separar células mescladas">Separar</button>
  <ColorControl label="Cor" value={currentCellFill} onChange={fill=>applyCell({fill})} documentColors={documentColors}/>
  <button type="button" onClick={()=>patch(o.id,{borders:!o.borders})} title="Alternar bordas da tabela">{o.borders?'Bordas ✓':'Bordas'}</button>
  <select aria-label="Alinhamento das células" value={currentCellAlign} onChange={e=>applyCell({align:e.target.value as Item['align']})}><option value="left">Esquerda</option><option value="center">Centro</option><option value="right">Direita</option></select>
  {isOverflowing&&<button type="button" className="fit-btn" onClick={fitHeight} title="Ajustar quadro à altura do conteúdo"><Maximize2 size={12}/>Ajustar altura</button>}
 </div>;

 return <><section><h3>Tabela</h3><label><input type="checkbox" checked={o.header||false} onChange={e=>patch(o.id,{header:e.target.checked})}/> Primeira linha como cabeçalho</label><ColorControl label="Cor do cabeçalho" value={o.fill==='#ffffff'?'#123e59':o.fill} onChange={fill=>patch(o.id,{fill})} documentColors={documentColors}/>{(['title','group','section','note','footnote'] as const).map((key,i)=><label key={key}>{['Título da tabela','Cabeçalho agrupado','Seção','Nota','Nota de rodapé'][i]}<input value={o[key]||''} placeholder={['Adicionar título','Ex.: Desempenho térmico','Ex.: Condições de operação','Adicionar nota','Ex.: ¹ Em condições de laboratório'][i]} onChange={e=>patch(o.id,{[key]:e.target.value})}/></label>)}</section>
 <details open><summary>Células e estrutura</summary>
  <div className="table-inspector-controls">
   <button type="button" onClick={()=>structural('add-row')}><Plus size={13}/>Adicionar linha</button>
   <button type="button" onClick={()=>structural('add-col')}><Plus size={13}/>Adicionar coluna</button>
   <button type="button" onClick={()=>structural('remove-row')} disabled={rows.length<=1}><Trash2 size={13}/>Excluir linha</button>
   <button type="button" onClick={()=>structural('remove-col')} disabled={cols<=1}><Trash2 size={13}/>Excluir coluna</button>
   <button type="button" disabled={!isMultiCell} onClick={merge}>Mesclar células</button>
   <button type="button" disabled={!o.merges?.length} onClick={unmerge}>Separar mesclas</button>
  </div>
  <ColorControl label="Cor de fundo da célula" value={currentCellFill} onChange={fill=>applyCell({fill})} documentColors={documentColors}/>
  <ColorControl label="Cor do texto das células" value={o.color} onChange={color=>applyCell({color})} documentColors={documentColors}/>
  <label>Alinhamento do texto<select aria-label="Alinhamento do texto" value={currentCellAlign} onChange={e=>applyCell({align:e.target.value as Item['align']})}><option value="left">À esquerda</option><option value="center">Centralizado</option><option value="right">À direita</option></select></label>
  <p className="hint">Arraste pelas células ou use Shift + clique para selecionar um intervalo.</p>
 </details>
 <details><summary>Tipografia e espaçamento</summary>
  <label>Tamanho do texto<input type="number" min="8" max="30" value={o.size} onChange={e=>patch(o.id,{size:+e.target.value})}/></label>
  <label>Espaço interno das células<input type="number" min="2" max="24" value={o.padding??10} onChange={e=>patch(o.id,{padding:+e.target.value})}/></label>
  <label><input type="checkbox" checked={o.borders||false} onChange={e=>patch(o.id,{borders:e.target.checked})}/> Exibir bordas na tabela</label>
  {isOverflowing&&<button type="button" className="wide fit-btn" onClick={fitHeight}><Maximize2 size={14}/>Ajustar quadro à altura do conteúdo</button>}
 </details>
 <details><summary>Avançado</summary><button className="wide" onClick={onSave}>Salvar estilo de tabela</button><p className="hint">O estilo fica disponível durante esta sessão.</p></details></>;
}


