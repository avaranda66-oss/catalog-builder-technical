import React from 'react';
import type { DocumentSession } from '../application';
import { approveNativePdfCellFill, prepareNativePdfCellFill,
  type NativePdfCellFillPreview,type NativePdfCellFillTarget } from './native-pdf-cell-fill';
import type { LocalPdfMaterial } from './pdf-grounded-input';

interface Props {
  readonly session: DocumentSession;
  readonly target: NativePdfCellFillTarget;
  readonly onBeforeMutation?: () => boolean;
}
type Manifest = { readonly sources: readonly {
  sourceId: string; fileName: string; revision: string;
}[]; readonly proposal: unknown };
function parseManifest(raw: unknown, files: readonly File[]): Manifest {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('INVALID_MANIFEST');
  const manifest=raw as Record<string,unknown>;
  if(Object.keys(manifest).sort().join('|')!=='proposal|sources' ||
      !Array.isArray(manifest.sources) || manifest.sources.length!==files.length ||
      files.length<1 || files.length>5)throw new Error('INVALID_MANIFEST');
  const used=new Set<string>();
  for(const item of manifest.sources) {
    if(!item || typeof item!=='object' || Array.isArray(item))throw new Error('INVALID_SOURCE');
    const source=item as Record<string,unknown>;
    if(Object.keys(source).sort().join('|')!=='fileName|revision|sourceId' ||
        typeof source.fileName!=='string' || typeof source.sourceId!=='string' ||
        typeof source.revision!=='string' ||
        !/^[a-z0-9-]{1,40}$/.test(source.sourceId) ||
        !source.revision.trim() || source.revision.length>100 ||
        used.has(source.fileName) ||
        !files.some(file=>file.name===source.fileName))throw new Error('INVALID_SOURCE_MAPPING');
    used.add(source.fileName);
  }
  if(new Set(files.map(file=>file.name)).size!==files.length ||
    !files.every(file=>used.has(file.name)))throw new Error('SOURCE_FILENAME_AMBIGUOUS');
  return manifest as Manifest;
}

export function VerifiedPdfTableReview({session,target,onBeforeMutation}:Props) {
  const [files,setFiles]=React.useState<File[]>([]);
  const [manifest,setManifest]=React.useState<File|null>(null);
  const [preview,setPreview]=React.useState<NativePdfCellFillPreview|null>(null);
  const [busy,setBusy]=React.useState(false);
  const [error,setError]=React.useState('');
  const [result,setResult]=React.useState('');
  const [approved,setApproved]=React.useState<{preview:NativePdfCellFillPreview;revision:number}|null>(null);
  const serial=React.useRef(0);
  React.useEffect(()=>{
    serial.current++;
    setPreview(null);
    setError('');
    setResult('');
    setApproved(null);
  },[target.pageId,target.objectId]);
  React.useEffect(()=>()=>{serial.current++;},[]);
  const verify=async()=>{
    if(busy||!manifest||files.length<1||files.length>5)return;
    const seq=++serial.current;
    setBusy(true);setPreview(null);setError('');setResult('');
    try {
      if(manifest.size>500_000||files.some(file=>file.size>50*1024*1024 ||
        !file.name.toLowerCase().endsWith('.pdf')))throw new Error('FILE_LIMIT');
      const data=parseManifest(JSON.parse(await manifest.text()),files);
      const materials:LocalPdfMaterial[]=await Promise.all(data.sources.map(async source=>{
        const file=files.find(f=>f.name===source.fileName)!;
        return {sourceId:source.sourceId,fileName:source.fileName,
          revision:source.revision,bytes:await file.arrayBuffer()};
      }));
      const plan=await prepareNativePdfCellFill(session,target,materials,data.proposal);
      if(serial.current===seq)setPreview(plan);
    } catch {
      if(serial.current===seq)setError('Não foi possível atestar as fontes. Revise os arquivos, modelos, unidades, condições e citações. Nenhuma célula foi alterada.');
    } finally {
      if(serial.current===seq)setBusy(false);
    }
  };
  const confirm=()=>{
    if(!preview||busy)return;
    if(onBeforeMutation&&!onBeforeMutation()){
      setError('Finalize a edição atual antes de aprovar as fontes.');
      return;
    }
    try{
      const receipt=approveNativePdfCellFill(session,preview);
      setApproved({preview,revision:receipt.revision});
      setResult('Inseridos '+receipt.filled+' valores apoiados por citações locais. '+
        receipt.missing+' posições continuam vazias. Confira o PDF final e salve.');
      setPreview(null);setError('');
    }catch{
      setPreview(null);
      setError('A tabela mudou ou ficou indisponível. A operação foi bloqueada; valide novamente os PDFs.');
    }
  };
  return <details className="ai-source-review">
    <summary>Preencher tabela com PDFs (revisão técnica)</summary>
    <p>Fluxo supervisionado para textos literais de PDFs pesquisáveis, com manifesto JSON de extração.
      Não envia seus arquivos ao Gemini. Tabelas complexas ou digitalizadas exigem inspeção visual.</p>
    <label>PDFs originais (até cinco)
      <input aria-label="PDFs originais para validação" type="file" accept="application/pdf,.pdf"
        multiple onChange={e=>{serial.current++;setPreview(null);setResult('');
          setFiles([...e.target.files??[]]);}}/>
    </label>
    <label>Manifesto JSON contendo `sources` e `proposal`
      <input aria-label="Manifesto das fontes PDF" type="file" accept=".json,application/json"
        onChange={e=>{serial.current++;setPreview(null);setResult('');
          setManifest(e.target.files?.[0]??null);}}/>
    </label>
    <button type="button" disabled={busy||!manifest||files.length===0}
      onClick={()=>void verify()}>{busy?'Conferindo arquivos…':'Conferir citações nos PDFs'}</button>
    {preview&&<section role="group" aria-label="Revisar valores e citações PDF">
      <h4>Valores propostos — nenhuma célula foi alterada</h4>
      <p>{preview.verifiedCells} valores com trechos localizados; {preview.missingCells} ausentes.</p>
      <ul>{preview.cells.map(item=><li key={item.cellId}>
        <strong>{item.rowLabel} / {item.model}</strong>: {item.status==='known'?item.displayValue:'Sem valor; manter vazio'}
        {item.source&&<small> · {item.source.sourceId}, página {item.source.page}
          <span> — “{item.source.quote}”</span>
        </small>}
      </li>)}</ul>
      <button type="button" onClick={confirm}>Confirmar preenchimento desta tabela</button>
      <button type="button" onClick={()=>{serial.current++;setPreview(null);}}>Rejeitar</button>
    </section>}
    {error&&<p role="alert">{error}</p>}
    {result&&<p role="status">{result}</p>}
    {approved&&<button type="button" onClick={()=>{
      const receipt={schema:'PRESYS_NATIVE_PDF_LITERAL_EVIDENCE_V1',
        caution:'Texto literal de PDFs pesquisáveis; não comprova geometria de tabelas complexas.',
        documentId:approved.preview.documentId,
        objectId:approved.preview.objectId,tableId:approved.preview.tableId,
        revisionAfterApproval:approved.revision,
        sourceHashes:approved.preview.pdfHashes,
        values:approved.preview.cells};
      const url=URL.createObjectURL(new Blob([JSON.stringify(receipt,null,2)],
        {type:'application/json'}));
      const link=document.createElement('a');link.href=url;
      link.download='presys-evidencia-pdf-'+approved.preview.tableId+'.json';
      link.click();URL.revokeObjectURL(url);
    }}>Baixar comprovante de fontes e valores (JSON)</button>}
    <small>Esta é uma ferramenta de revisão técnica, não uma leitura automática certificada.
      Só valores literais compatíveis com a tabela selecionada podem ser preenchidos.</small>
  </details>;
}
