import type { Column, Row } from '../domain/editorial-model';
import { add, minimumUForProjectedQ, mmToU, mul, safe, sum, uToQ } from '../domain/physical';
import { asDiagnostic, diagnostic, VNextError, type Diagnostic } from '../domain/diagnostics';

export type ColumnResult={ok:true;widthsU:number[];availableTrackWidthU:number}|{ok:false;code:string;details:string};
export function resolveColumns(columns:readonly Column[],availableTrackWidthMm:number):ColumnResult {
  try {
    const available=mmToU(availableTrackWidthMm);
    if(available<=0 || !columns.length)throw new VNextError('TABLE_WIDTH_INFEASIBLE');
    const limits=columns.map(column=>{
      const min=mmToU(column.minMm),max=column.maxMm===undefined?Number.MAX_SAFE_INTEGER:mmToU(column.maxMm);
      if(min<=0 || max<min)throw new VNextError('COLUMN_LIMIT_INVALID',column.id);
      const width=column.width.mode==='fixed'?mmToU(column.width.mm):min;
      if(width<min || width>max)throw new VNextError('COLUMN_LIMIT_INVALID',column.id);
      const weight=column.width.mode==='flex'?safe(column.width.weight):0;
      if(column.width.mode==='flex' && weight<=0)throw new VNextError('COLUMN_WEIGHT_INVALID',column.id);
      return {min,max,width,weight};
    });
    const widthsU=limits.map(c=>c.width);
    let remaining=add(available,-sum(widthsU));
    if(remaining<0)throw new VNextError('TABLE_WIDTH_INFEASIBLE','Fixed widths and minima exceed frame');
    while(remaining>0) {
      const active=limits.map((limit,i)=>({limit,i})).filter(({limit,i})=>limit.weight>0&&widthsU[i]<limit.max);
      if(!active.length)throw new VNextError('TABLE_WIDTH_INFEASIBLE','Maxima/fixed columns cannot fill frame');
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
    if(sum(widthsU)!==available||widthsU.some(w=>w<=0))throw new VNextError('TABLE_WIDTH_INFEASIBLE');
    return {ok:true,widthsU,availableTrackWidthU:available};
  } catch(error){const d=asDiagnostic(error);return {ok:false,code:d.code,details:d.details};}
}
export function projectTracks(widthsU:readonly number[],frameU:number):{frameQ:number;trackQ:number[]} {
  if(sum(widthsU)!==frameU || frameU<=0 || widthsU.some(w=>w<=0))throw new VNextError('TRACK_PROJECTION_INVARIANT');
  const frameQ=uToQ(frameU);
  const parts=widthsU.map((u,i)=>{const n=mul(u,384);return {i,base:Math.floor(n/15875),remainder:n%15875};});
  const trackQ=parts.map(p=>p.base),delta=add(frameQ,-sum(trackQ));
  if(delta<0||delta>parts.length)throw new VNextError('TRACK_PROJECTION_INVARIANT');
  parts.sort((a,b)=>b.remainder-a.remainder||a.i-b.i);
  for(let i=0;i<delta;i++)trackQ[parts[i].i]++;
  if(trackQ.some(q=>q<=0))throw new VNextError('TRACK_PROJECTION_NONPOSITIVE');
  if(sum(trackQ)!==frameQ)throw new VNextError('TRACK_PROJECTION_INVARIANT');
  return {frameQ,trackQ};
}
export interface SpanConstraint {cellId:string;row:number;column:number;span:number;requiredQ:number}
interface PrefixEdge {from:number;constraint:SpanConstraint}
export function resolveRows(rows:readonly Row[],constraints:readonly SpanConstraint[]):{heightsU:number[];diagnostics:Diagnostic[]} {
  const diagnostics:Diagnostic[]=[];
  const baseHeightsU=rows.map(row=>{
    const policy=row.heightPolicy;
    if(policy.mode==='AUTO')return 0;
    const authored=mmToU(policy.mode==='MIN_MM'?policy.minMm:policy.heightMm);
    if(authored<=0)throw new VNextError('ROW_MEASUREMENT_INVALID');
    return authored;
  });
  const basePrefixU=cumulative(baseHeightsU);
  const growableBeforeBoundary=[0];
  for(const row of rows)growableBeforeBoundary.push(add(growableBeforeBoundary[growableBeforeBoundary.length-1],row.heightPolicy.mode==='FIXED_MM'?0:1));
  const growableCount=growableBeforeBoundary[growableBeforeBoundary.length-1];
  const incoming:PrefixEdge[][]=Array.from({length:growableCount+1},()=>[]);
  for(const constraint of constraints) {
    const {row,span,requiredQ,column}=constraint;
    if(!Number.isSafeInteger(row)||!Number.isSafeInteger(column)||!Number.isSafeInteger(span)||row<0||column<0||span<1||row+span>rows.length||safe(requiredQ)<0)
      throw new VNextError('ROWSPAN_CONSTRAINT_INVALID');
    const from=growableBeforeBoundary[row],to=growableBeforeBoundary[row+span];
    if(to>from)incoming[to].push({from,constraint});
  }
  const extraPrefixU=Array(growableCount+1).fill(0) as number[];
  for(let end=1;end<extraPrefixU.length;end++) {
    let required=extraPrefixU[end-1];
    for(const edge of incoming[end]) {
      const {row,span,requiredQ}=edge.constraint;
      const startU=add(basePrefixU[row],extraPrefixU[edge.from]);
      const targetEndQ=add(uToQ(startU),requiredQ);
      const targetEndU=minimumUForProjectedQ(targetEndQ);
      required=Math.max(required,add(targetEndU,-basePrefixU[row+span]));
    }
    extraPrefixU[end]=safe(Math.max(0,required));
  }
  const heightsU=[...baseHeightsU];
  let growablePosition=0;
  rows.forEach((row,rowIndex)=>{
    if(row.heightPolicy.mode==='FIXED_MM')return;
    const extra=add(extraPrefixU[growablePosition+1],-extraPrefixU[growablePosition]);
    if(extra<0)throw new VNextError('ROWSPAN_CONSTRAINT_INVALID');
    heightsU[rowIndex]=add(heightsU[rowIndex],extra);
    growablePosition++;
  });
  const boundariesQ=cumulative(heightsU).map(uToQ);
  for(const constraint of constraints) {
    const availableQ=add(boundariesQ[constraint.row+constraint.span],-boundariesQ[constraint.row]);
    if(availableQ<constraint.requiredQ)diagnostics.push(diagnostic('ROW_CONTENT_OVERFLOW',`requiredQ=${constraint.requiredQ}, spanQ=${availableQ}`,{cellId:constraint.cellId}));
  }
  return {heightsU,diagnostics};
}
export function cumulative(values:readonly number[]):number[] {
  const out=[0];values.forEach(value=>out.push(add(out[out.length-1],value)));return out;
}
export function projectRows(heightsU:readonly number[]):{rowQ:number[];boundariesQ:number[]} {
  const boundariesQ=cumulative(heightsU).map(uToQ);
  const rowQ=heightsU.map((_,i)=>add(boundariesQ[i+1],-boundariesQ[i]));
  if(rowQ.some(q=>q<=0))throw new VNextError('ROW_PROJECTION_NONPOSITIVE');
  return {rowQ,boundariesQ};
}
