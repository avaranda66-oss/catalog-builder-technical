import { z } from 'zod';
import { mmToU } from './physical';
import { VNextError } from './diagnostics';

const id=z.string().min(1);
const finite=z.number().finite();
const positive=finite.positive();
const nonnegative=finite.nonnegative();
const integer=z.number().int().safe();
const color=z.string().regex(/^#[0-9a-fA-F]{6}$/);
const clean=z.string().min(1).refine(s=>![...s].some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)===127),'Control character');
const positiveMm=positive.superRefine((n,ctx)=>{
  try{if(mmToU(n)<=0)ctx.addIssue({code:'custom',message:'PHYSICAL_LENGTH_NONPOSITIVE'});}
  catch(error){ctx.addIssue({code:'custom',message:error instanceof VNextError?error.code:'PHYSICAL_LENGTH_INVALID'});}
});
const marks=['bold','italic','subscript','superscript'] as const;
export const RichTextSchema=z.object({paragraphs:z.array(z.object({
  id,inlines:z.array(z.discriminatedUnion('kind',[
    z.object({kind:z.literal('text'),id,text:clean,marks:z.array(z.enum(marks)).superRefine((values,ctx)=>{
      if(new Set(values).size!==values.length || values.some((m,i)=>i>0 && marks.indexOf(m)<marks.indexOf(values[i-1])) || values.includes('subscript') && values.includes('superscript'))
        ctx.addIssue({code:'custom',message:'INVALID_TEXT_MARKS'});
    })}).strict(),
    z.object({kind:z.literal('lineBreak'),id}).strict(),
  ])), list:z.object({kind:z.enum(['ordered','unordered']),level:z.union([z.literal(0),z.literal(1),z.literal(2),z.literal(3)])}).strict().optional(),
}).strict())}).strict().superRefine((rich,ctx)=>{
  const ids=rich.paragraphs.flatMap(p=>[p.id,...p.inlines.map(i=>i.id)]);
  if(new Set(ids).size!==ids.length)ctx.addIssue({code:'custom',message:'DUPLICATE_ID'});
});
export type RichText=z.infer<typeof RichTextSchema>;
export type TextMark=typeof marks[number];
export const CellContentSchema=z.discriminatedUnion('type',[
  z.object({type:z.literal('empty')}).strict(),
  z.object({type:z.literal('richText'),value:RichTextSchema}).strict(),
  z.object({type:z.literal('technicalCode'),value:z.string().min(1).refine(s=>![...s].some(c=>[0,10,13].includes(c.charCodeAt(0))))}).strict(),
  z.object({type:z.literal('measurement'),valueText:z.string().regex(/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/),unit:clean.refine(s=>s.trim().length>0),qualifier:z.enum(['approx','min','max']).optional()}).strict(),
  z.object({type:z.literal('marker'),legendEntryId:id}).strict(),
  z.object({type:z.literal('image'),assetId:id}).strict(),
]);
export type CellContent=z.infer<typeof CellContentSchema>;
export const CellContentPresentationSchema=z.object({
  wrapPolicy:z.enum(['wrap','nowrap']).optional(),
  image:z.object({fit:z.enum(['contain','cover']),targetWidthMm:positiveMm,targetHeightMm:positiveMm}).strict().optional(),
}).strict();
export type CellContentPresentation=z.infer<typeof CellContentPresentationSchema>;
export const BorderSchema=z.discriminatedUnion('pattern',[
  z.object({pattern:z.literal('none')}).strict(),
  z.object({pattern:z.literal('solid'),thicknessPt:positive,color}).strict(),
]);
export type Border=z.infer<typeof BorderSchema>;
const EdgesSchema=z.object({top:BorderSchema.optional(),right:BorderSchema.optional(),bottom:BorderSchema.optional(),left:BorderSchema.optional()}).strict();
export const CellStyleSchema=z.object({
  fontFamily:clean.optional(),fontSizePt:positive.optional(),lineHeight:positive.optional(),
  fontWeight:z.union([z.literal(400),z.literal(700)]).optional(),
  color:color.optional(),background:color.optional(),textAlign:z.enum(['left','center','right']).optional(),
  paddingMm:z.object({top:nonnegative.optional(),right:nonnegative.optional(),bottom:nonnegative.optional(),left:nonnegative.optional()}).strict().optional(),
  borders:EdgesSchema.optional(),
}).strict();
export type CellStyle=z.infer<typeof CellStyleSchema>;
export const TableStyleSchema=z.object({
  base:CellStyleSchema,
  rowRoles:z.object({header:CellStyleSchema.optional(),body:CellStyleSchema.optional(),section:CellStyleSchema.optional()}).strict(),
  annotation:CellStyleSchema,
  annotationGapMm:nonnegative,
}).strict();
export type TableStyle=z.infer<typeof TableStyleSchema>;
export const ColumnSchema=z.object({id,width:z.discriminatedUnion('mode',[
  z.object({mode:z.literal('fixed'),mm:positiveMm}).strict(),
  z.object({mode:z.literal('flex'),weight:integer.positive()}).strict(),
]),minMm:positiveMm,maxMm:positiveMm.optional(),style:CellStyleSchema.optional()}).strict();
export type Column=z.infer<typeof ColumnSchema>;
export const RowSchema=z.object({id,role:z.enum(['header','body','section']),heightPolicy:z.discriminatedUnion('mode',[
  z.object({mode:z.literal('AUTO')}).strict(),
  z.object({mode:z.literal('MIN_MM'),minMm:positiveMm}).strict(),
  z.object({mode:z.literal('FIXED_MM'),heightMm:positiveMm}).strict(),
]),style:CellStyleSchema.optional()}).strict();
export type Row=z.infer<typeof RowSchema>;
export const CellSchema=z.object({id,rowId:id,columnId:id,content:CellContentSchema,
  contentPresentation:CellContentPresentationSchema.optional(),
  span:z.object({rows:integer.positive(),columns:integer.positive()}).strict().optional(),
  coveredBy:id.optional(),annotationIds:z.array(id).optional(),style:CellStyleSchema.optional(),
}).strict().superRefine((cell,ctx)=>{
  if((cell.content.type==='image')!==Boolean(cell.contentPresentation?.image))
    ctx.addIssue({code:'custom',message:'CELL_IMAGE_PRESENTATION_INVALID'});
});
export type Cell=z.infer<typeof CellSchema>;
export const TableAnnotationSchema=z.object({id,kind:z.enum(['note','footnote','caption']),text:RichTextSchema}).strict();
export type TableAnnotation=z.infer<typeof TableAnnotationSchema>;
export const TableLegendEntrySchema=z.object({id,markerCode:clean,text:RichTextSchema}).strict();
export type TableLegendEntry=z.infer<typeof TableLegendEntrySchema>;
export const TableModelSchema=z.object({
  id,columns:z.array(ColumnSchema).min(1),rows:z.array(RowSchema).min(1),cells:z.array(CellSchema).min(1),
  style:TableStyleSchema,annotationIds:z.array(id).optional(),annotations:z.array(TableAnnotationSchema),legend:z.array(TableLegendEntrySchema),
}).strict();
export type TableModel=z.infer<typeof TableModelSchema>;
export const FrameSchema=z.object({xMm:finite,yMm:finite,widthMm:positiveMm,heightMm:positiveMm}).strict();
export type Frame=z.infer<typeof FrameSchema>;
export const AssetRefSchema=z.object({id,version:clean,sha256:z.string().regex(/^[a-f0-9]{64}$/),
  mime:z.enum(['image/png','image/jpeg','image/webp']),widthPx:integer.positive(),heightPx:integer.positive(),name:clean,alt:clean}).strict();
export type AssetRef=z.infer<typeof AssetRefSchema>;
export const DocumentStyleSchema=z.object({
  fonts:z.array(z.object({family:clean,revision:clean,weight:z.union([z.literal(400),z.literal(700)]),style:z.enum(['normal','italic'])}).strict()).min(1),
  defaultText:CellStyleSchema,palette:z.array(color).min(1),
}).strict();
export type DocumentStyle=z.infer<typeof DocumentStyleSchema>;
const objectBase={id,frame:FrameSchema,zIndex:integer,locked:z.boolean().optional()};
export const ImageFocalPointSchema=z.object({x:finite.min(0).max(1),y:finite.min(0).max(1)}).strict();
export type ImageFocalPoint=z.infer<typeof ImageFocalPointSchema>;
export const DEFAULT_IMAGE_FOCAL_POINT:Readonly<ImageFocalPoint>=Object.freeze({x:0.5,y:0.5});
export const EditorialObjectSchema=z.discriminatedUnion('type',[
  z.object({...objectBase,type:z.literal('table'),table:TableModelSchema}).strict(),
  z.object({...objectBase,type:z.literal('text'),text:RichTextSchema,style:CellStyleSchema}).strict(),
  z.object({...objectBase,type:z.literal('image'),assetId:id,fit:z.enum(['contain','cover']),focalPoint:ImageFocalPointSchema.optional()}).strict(),
  z.object({...objectBase,type:z.literal('shape'),shape:z.enum(['rectangle','ellipse']),style:z.object({fill:color.optional(),stroke:BorderSchema.optional()}).strict()}).strict(),
  z.object({...objectBase,type:z.literal('line'),axis:z.enum(['horizontal','vertical']),color}).strict(),
  z.object({...objectBase,type:z.literal('icon'),assetId:id}).strict(),
]);
export type EditorialObject=z.infer<typeof EditorialObjectSchema>;
export type TextObject=Extract<EditorialObject,{type:'text'}>;
export type ImageObject=Extract<EditorialObject,{type:'image'}>;
export type TableObject=Extract<EditorialObject,{type:'table'}>;
export type ShapeObject=Extract<EditorialObject,{type:'shape'}>;
export type LineObject=Extract<EditorialObject,{type:'line'}>;
export type IconObject=Extract<EditorialObject,{type:'icon'}>;
export const PageSchema=z.object({id,widthMm:z.literal(210),heightMm:z.literal(297),
  safeArea:z.object({topMm:nonnegative,rightMm:nonnegative,bottomMm:nonnegative,leftMm:nonnegative}).strict().optional(),
  objects:z.array(EditorialObjectSchema)}).strict();
export type Page=z.infer<typeof PageSchema>;
export const CatalogDocumentSchema=z.object({schemaVersion:z.literal(1),id,title:clean,locale:clean,
  style:DocumentStyleSchema,pages:z.array(PageSchema).min(1),assets:z.array(AssetRefSchema),
  source:z.object({documentId:id,serverVersion:integer.nonnegative()}).strict().optional(),
}).strict();
export type CatalogDocument=z.infer<typeof CatalogDocumentSchema>;

export function plainRichText(idPrefix:string,text:string):RichText {
  return {paragraphs:[{id:idPrefix+':p',inlines:text?[{kind:'text',id:idPrefix+':t',text,marks:[]}]:[]}]};
}
