import { VNextError } from './diagnostics';

/** Domain U and renderer Q are deliberately separate; neither is serialized into authored mm. */
export type PhysicalLengthU = number;
export type PhysicalPixelQ = number;
const MAX = String(Number.MAX_SAFE_INTEGER);
export function safe(value: number): number {
  if (!Number.isSafeInteger(value)) throw new VNextError('PHYSICAL_ARITHMETIC_OVERFLOW');
  return value;
}
export const add = (a: number,b: number): number => safe(safe(a)+safe(b));
export const mul = (a: number,b: number): number => safe(safe(a)*safe(b));
export const sum = (values: readonly number[]): number => values.reduce(add,0);

function decimal(value: number): {negative:boolean;digits:string;scale:number} {
  if (!Number.isFinite(value)) throw new VNextError('PHYSICAL_LENGTH_INVALID');
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(Number.prototype.toString.call(value));
  if (!match) throw new VNextError('PHYSICAL_LENGTH_INVALID');
  return {negative:match[1]==='-', digits:(match[2]+(match[3]??'')).replace(/^0+(?=\d)/,''), scale:Number(match[4]??0)-(match[3]?.length??0)};
}
function increment(digits: string): string {
  const out = digits.split('');
  for (let i=out.length-1;i>=0;i--) {
    if(out[i]!=='9') {out[i]=String(Number(out[i])+1); return out.join('');}
    out[i]='0';
  }
  return '1'+out.join('');
}
function integerFromDigits(digits: string): number {
  const normalized=digits.replace(/^0+(?=\d)/,'');
  if(normalized.length>MAX.length || (normalized.length===MAX.length && normalized>MAX)) throw new VNextError('PHYSICAL_ARITHMETIC_OVERFLOW');
  return safe(Number(normalized));
}
/** Decimal digit arithmetic avoids an unsafe coefficient or enormous power-of-ten denominator. */
function scaledDecimal(value:number,shift:number,multiplier:number,denominator:number):number {
  const parsed=decimal(value);
  let carry=0;
  const product:string[]=[];
  for(let i=parsed.digits.length-1;i>=0;i--) {
    const n=add(mul(Number(parsed.digits[i]),multiplier),carry);
    product.push(String(n%10)); carry=Math.floor(n/10);
  }
  const digits=(carry?String(carry):'')+product.reverse().join('');
  const point=digits.length+parsed.scale+shift;
  const integer=point<=0?'0':digits.slice(0,point)+'0'.repeat(Math.max(0,point-digits.length));
  const fraction=point<0?'0'.repeat(-point)+digits:digits.slice(Math.max(0,point));
  let remainder=0;
  let quotient='';
  for(const digit of integer) {
    const n=add(mul(remainder,10),Number(digit));
    quotient+=String(Math.floor(n/denominator)); remainder=n%denominator;
  }
  // The first quotient fraction digit completely decides half-away rounding.
  const next=Math.floor(add(mul(remainder,10),Number(fraction[0]??'0'))/denominator);
  if(next>=5) quotient=increment(quotient);
  const magnitude=integerFromDigits(quotient);
  return magnitude===0?0:parsed.negative?-magnitude:magnitude;
}
export const mmToU = (mm:number):PhysicalLengthU => scaledDecimal(mm,4,1,1);
export const pxToQ = (px:number):PhysicalPixelQ => scaledDecimal(px,0,64,1);
export function roundRatio(numerator:number,denominator:number):number {
  safe(numerator); safe(denominator);
  if(denominator<=0) throw new VNextError('PHYSICAL_LENGTH_INVALID');
  const n=Math.abs(numerator);
  const base=Math.floor(n/denominator);
  const magnitude=add(base,mul(n%denominator,2)>=denominator?1:0);
  return magnitude===0?0:numerator<0?-magnitude:magnitude;
}
export const uToQ = (u:PhysicalLengthU):PhysicalPixelQ => roundRatio(mul(u,384),15875);
export const qToU = (q:PhysicalPixelQ):PhysicalLengthU => roundRatio(mul(q,15875),384);
export function minimumUForProjectedQ(targetQ:PhysicalPixelQ):PhysicalLengthU {
  safe(targetQ);
  if(targetQ<0)throw new VNextError('PHYSICAL_LENGTH_INVALID');
  if(targetQ===0)return 0;
  const threshold=add(mul(targetQ,2),-1);
  const whole=Math.floor(threshold/768),remainder=threshold%768;
  const tail=Math.floor(add(mul(remainder,15875),767)/768);
  const candidate=add(mul(whole,15875),tail);
  if(uToQ(candidate)<targetQ || (candidate>0&&uToQ(candidate-1)>=targetQ))throw new VNextError('PHYSICAL_ARITHMETIC_OVERFLOW');
  return candidate;
}
export function ptToQ(pt:number):PhysicalPixelQ {
  if(pt<=0) throw new VNextError('BORDER_THICKNESS_INVALID');
  const q=scaledDecimal(pt,0,256,3);
  if(q<=0) throw new VNextError('BORDER_THICKNESS_PROJECTS_TO_ZERO');
  return q;
}
export function qCss(q:PhysicalPixelQ):string {
  safe(q);
  const n=Math.abs(q), rest=n%64;
  const fraction=rest?'.'+String(mul(rest,15625)).padStart(6,'0').replace(/0+$/,''):'';
  return (q<0?'-':'')+String(Math.floor(n/64))+fraction+'px';
}
/** Exact rational ordering of positive authored decimals (used only after thickness-Q ties). */
export function compareDecimal(a:number,b:number):number {
  const x=decimal(a), y=decimal(b);
  const extentX=x.digits.length+x.scale, extentY=y.digits.length+y.scale;
  if(extentX!==extentY) return extentX>extentY?1:-1;
  const length=Math.max(x.digits.length,y.digits.length);
  const xd=x.digits.padEnd(length,'0'),yd=y.digits.padEnd(length,'0');
  return xd===yd?0:xd>yd?1:-1;
}
