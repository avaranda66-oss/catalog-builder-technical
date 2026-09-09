import type { Column, Row } from './proof-model';
import { add, mmToU, mul, safe, sum, uToQ } from './physical';
import { asDiagnostic, diagnostic, ProofError, type Diagnostic } from './diagnostics';

export type ColumnResult={ok:true;widthsU:number[];availableTrackWidthU:number}|{ok:false;code:string;details:string};
export function resolveColumns(columns:readonly Column[],availableTrackWidthMm:number):ColumnResult {
  try {
    const available=mmToU(availableTrackWidthMm);
    if(available<=0 || !columns.length)throw new ProofError('TABLE_WIDTH_INFEASIBLE');
    const limits=columns.map(column=>{
      const min=mmToU(column.minMm),max=column.maxMm===undefined?Number.MAX_SAFE_INTEGER:mmToU(column.maxMm);
      if(min<=0 || max<min)throw new ProofError('COLUMN_LIMIT_INVALID',column.id);
      const width=column.width.mode==='fixed'?mmToU(column.width.mm):min;
      if(width<min || width>max)throw new ProofError('COLUMN_LIMIT_INVALID',column.id);
      const weight=column.width.mode==='flex'?safe(column.width.weight):0;
      if(column.width.mode==='flex' && weight<=0)throw new ProofError('COLUMN_WEIGHT_INVALID',column.id);
      return {min,max,width,weight};
    });
    const widthsU=limits.map(c=>c.width);
    let remaining=add(available,-sum(widthsU));
    if(remaining<0)throw new ProofError('TABLE_WIDTH_INFEASIBLE','Fixed widths and minima exceed frame');
    while(remaining>0) {
      const active=limits.map((limit,i)=>({limit,i})).filter(({limit,i})=>limit.weight>0&&widthsU[i]<limit.max);
      if(!active.length)throw new ProofError('TABLE_WIDTH_INFEASIBLE','Maxima/fixed columns cannot fill frame');
      const weights=sum(active.map(a=>a.limit.weight));
      const shares=active.map(({limit,i})=>{
        const numerator=mul(remaining,limit.weight);
        return {i,base:Math.floor(numerator/weights),remainder:numerator%weights,capacity:add(limit.max,-widthsU[i])};
      });
      const capped=shares.filter(share=>share.base>=share.capacity);
      if(capped.length) {
        for(const share of capped){widthsU[share.i]=add(widthsU[share.i],share.capacity);remaining=add(remaining,-share.capacity);}
        continue;
      }
      for(const share of shares){widthsU[share.i]=add(widthsU[share.i],share.base);remaining=add(remaining,-share.base);}
      shares.sort((a,b)=>b.remainder-a.remainder||a.i-b.i);
      for(const share of shares) {
        if(!remaining)break;
        if(widthsU[share.i]<limits[share.i].max){widthsU[share.i]=add(widthsU[share.i],1);remaining--;}
      }
    }
    if(sum(widthsU)!==available||widthsU.some(w=>w<=0))throw new ProofError('TABLE_WIDTH_INFEASIBLE');
    return {ok:true,widthsU,availableTrackWidthU:available};
  } catch(error){const d=asDiagnostic(error);return {ok:false,code:d.code,details:d.details};}
}
export function projectTracks(widthsU:readonly number[],frameU:number):{frameQ:number;trackQ:number[]} {
  if(sum(widthsU)!==frameU || frameU<=0 || widthsU.some(w=>w<=0))throw new ProofError('TRACK_PROJECTION_INVARIANT');
  const frameQ=uToQ(frameU);
  const parts=widthsU.map((u,i)=>{const n=mul(u,384);return {i,base:Math.floor(n/15875),remainder:n%15875};});
  const trackQ=parts.map(p=>p.base),delta=add(frameQ,-sum(trackQ));
  if(delta<0||delta>parts.length)throw new ProofError('TRACK_PROJECTION_INVARIANT');
  parts.sort((a,b)=>b.remainder-a.remainder||a.i-b.i);
  for(let i=0;i<delta;i++)trackQ[parts[i].i]++;
  if(trackQ.some(q=>q<=0))throw new ProofError('TRACK_PROJECTION_NONPOSITIVE');
  if(sum(trackQ)!==frameQ)throw new ProofError('TRACK_PROJECTION_INVARIANT');
  return {frameQ,trackQ};
}
export interface SpanConstraint {cellId:string;row:number;column:number;span:number;requiredU:number}
export function resolveRows(rows:readonly Row[],intrinsicU:readonly number[],constraints:readonly SpanConstraint[]):{heightsU:number[];diagnostics:Diagnostic[]} {
  if(rows.length!==intrinsicU.length)throw new ProofError('ROW_MEASUREMENT_INVALID');
  const diagnostics:Diagnostic[]=[];
  const heightsU=rows.map((row,i)=>{
    const intrinsic=safe(intrinsicU[i]);
    if(intrinsic<0)throw new ProofError('ROW_MEASUREMENT_INVALID');
    const policy=row.heightPolicy;
    if(policy.mode==='AUTO')return intrinsic;
    const authored=mmToU(policy.mode==='MIN_MM'?policy.minMm:policy.heightMm);
    if(policy.mode==='MIN_MM')return Math.max(intrinsic,authored);
    if(intrinsic>authored)diagnostics.push(diagnostic('ROW_CONTENT_OVERFLOW',`requiredU=${intrinsic}, fixedU=${authored}`,{rowId:row.id}));
    return authored;
  });
  const sorted=[...constraints].sort((a,b)=>a.row-b.row||a.column-b.column||(a.cellId<b.cellId?-1:a.cellId>b.cellId?1:0));
  for(const constraint of sorted) {
    const {row,span,requiredU,cellId}=constraint;
    if(!Number.isSafeInteger(row)||!Number.isSafeInteger(span)||row<0||span<2||row+span>rows.length||safe(requiredU)<0)throw new ProofError('ROWSPAN_CONSTRAINT_INVALID');
    const deficit=Math.max(0,add(requiredU,-sum(heightsU.slice(row,row+span))));
    if(!deficit)continue;
    const eligible=rows.map((r,i)=>({r,i})).slice(row,row+span).filter(({r})=>r.heightPolicy.mode!=='FIXED_MM');
    if(!eligible.length){diagnostics.push(diagnostic('ROW_CONTENT_OVERFLOW',`Rowspan deficitU=${deficit}; all rows fixed`,{cellId}));continue;}
    const base=Math.floor(deficit/eligible.length),remainder=deficit%eligible.length;
    eligible.forEach(({i},index)=>{heightsU[i]=add(heightsU[i],add(base,index<remainder?1:0));});
  }
  return {heightsU,diagnostics};
}
export function cumulative(values:readonly number[]):number[] {
  const out=[0];values.forEach(value=>out.push(add(out[out.length-1],value)));return out;
}
export function projectRows(heightsU:readonly number[]):{rowQ:number[];boundariesQ:number[]} {
  const boundariesQ=cumulative(heightsU).map(uToQ);
  const rowQ=heightsU.map((_,i)=>add(boundariesQ[i+1],-boundariesQ[i]));
  if(rowQ.some(q=>q<=0))throw new ProofError('ROW_PROJECTION_NONPOSITIVE');
  return {rowQ,boundariesQ};
}
