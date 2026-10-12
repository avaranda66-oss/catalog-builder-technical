// @vitest-environment node
// Opt-in real-world acceptance only. The proprietary source PDF is NEVER committed.
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { readNativePdfSnapshot, type NativePdfRun } from '../../../src/vnext/ai-catalog/pdf-native-provenance';
import { verifyNativeTableProposal, type NativeTableProposal } from '../../../src/vnext/ai-catalog/native-table-proposal';

Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
const path = process.env.REAL_PRESYS_PDF_PATH;
const expectedHash = '5bfafcfe4d1dc8a77c0738beb204eca283cc5cb97d6fa7238d8e0511fd93d86a';
type Anchor = NativeTableProposal['columns'][number]['modelHeader'];
describe.skipIf(!path)('real PRESYS page 6 — source-byte grounded quarantine, NEVER Known', () => {
  it('inspects 3 exact models x 2 real physical rows; blocks ambiguous geometry', async () => {
    const bytes = Uint8Array.from(await readFile(path!)).buffer;
    const snapshot = await readNativePdfSnapshot('real-presys-original.pdf', bytes, { pages: [6], expectedSha256: expectedHash });
    const runs = new Map(snapshot.pages[0].runs.map(r => [r.id, r]));
    const pick = (n: number): NativePdfRun => {
      const r = runs.get('p6:i' + n);
      if (!r?.metricBox || !r.geometrySupported || r.evidenceRole !== 'content') throw Error('REAL_RUN_MISSING_'+n);
      return r;
    };
    const anchor = (...segments: Array<[number, number?, number?]>): Anchor => {
      const spans = segments.map(([n, start=0, end]) => {
        const run=pick(n); return { runId: run.id, start, end: end ?? run.str.length };
      });
      const rs=segments.map(([n])=>pick(n));
      return { segments: spans, box: {
        left: Math.min(...rs.map(r=>r.metricBox!.left)), right: Math.max(...rs.map(r=>r.metricBox!.right)),
        bottom: Math.min(...rs.map(r=>r.metricBox!.bottom)), top: Math.max(...rs.map(r=>r.metricBox!.top)),
      }};
    };
    const columns: NativeTableProposal['columns'] = [
      {id:'ta25',model:'TA-25N',left:230,right:333,modelHeader:anchor([98],[99],[100])},
      {id:'ta35',model:'TA-35N',left:343,right:448,modelHeader:anchor([102],[103],[104])},
      {id:'ta50',model:'TA-50N',left:457,right:550,modelHeader:anchor([106],[107],[108])},
    ];
    const rows: NativeTableProposal['rows'] = [
      {id:'power',field:'power-consumption',bottom:238,top:253,rowLabel:anchor([185])},
      {id:'weight',field:'weight',bottom:153,top:170,rowLabel:anchor([305])},
    ];
    const cells: NativeTableProposal['cells'] = [
      {columnId:'ta25',rowId:'power',quantity:anchor([187,0,3]),unit:anchor([187,3]),condition:null},
      {columnId:'ta35',rowId:'power',quantity:anchor([189],[190,0,2]),unit:anchor([190,2]),condition:null},
      {columnId:'ta50',rowId:'power',quantity:anchor([192,0,3]),unit:anchor([192,3]),condition:null},
      {columnId:'ta25',rowId:'weight',quantity:anchor([307],[308,0,2]),unit:anchor([308,2]),condition:null},
      {columnId:'ta35',rowId:'weight',quantity:anchor([310],[311],[312,0,1]),unit:anchor([312,1]),condition:null},
      {columnId:'ta50',rowId:'weight',quantity:anchor([314,0,4]),unit:anchor([314,4]),condition:null},
    ];
    const proposal: NativeTableProposal = {version:1,pdfSha256:snapshot.sha256,
      parserVersion:'4.10.38',page:6,tableBox:{left:70,bottom:143,right:560,top:405},columns,rows,cells};
    const result=await verifyNativeTableProposal('real-presys-original.pdf',bytes,proposal);
    const receipt={fileHash:result.pdfSha256,proposalHash:result.proposalSha256,status:result.status,
      errors:result.errors,paintVisibility:result.paintVisibility,approval:result.approval,
      cells:result.candidates.map(c=>({model:c.modelLiteral,label:c.labelLiteral,quantity:c.quantityLiteral,
        unit:c.unitLiteral,status:c.status,reasons:c.reasons}))};
    console.log('REAL_PRESYS_GRID_QUARANTINE_EVIDENCE',JSON.stringify(receipt));
    expect(result.pdfSha256).toBe(expectedHash);
    // These are byte-derived literal candidates ONLY, not certified values.
    expect(result.candidates.map(c => [c.modelLiteral,c.labelLiteral,c.quantityLiteral,c.unitLiteral])).toEqual([
      ['TA-25N','Power Consumption','200',' W'],
      ['TA-35N','Power Consumption','300',' W'],
      ['TA-50N','Power Consumption','400',' W'],
      ['TA-25N','Weight','10.5',' kg'],
      ['TA-35N','Weight','10.5',' kg'],
      ['TA-50N','Weight','12.5',' kg'],
    ]);
    expect(result.candidates.filter(c=>c.status==='blocked')).toHaveLength(2);
    expect(result.candidates.filter(c=>c.status==='needs_review')).toHaveLength(4);
    expect(result.approval).toBe('not-created');
    expect('known' in result).toBe(false);
    expect(result.status).not.toBe('geometry_verified');
    expect(result.candidates.every(c=>c.status!=='geometry_verified')).toBe(true);
  });
});
