import type { CSSProperties } from 'react';
import type { RichText } from '../domain/editorial-model';
import type { ResolvedStyle } from './style';
import { mmToU,qCss,uToQ } from '../domain/physical';

export function typography(style:ResolvedStyle):CSSProperties {
  return {fontFamily:'"'+style.fontFamily+'"',fontSize:style.fontSizePt+'pt',lineHeight:style.lineHeight,fontWeight:style.fontWeight,color:style.color,textAlign:style.textAlign};
}

export function RichTextRenderer({rich,nowrap=false}:{rich:RichText;nowrap?:boolean}) {
  return <>{rich.paragraphs.map(paragraph=><p key={paragraph.id} data-paragraph-id={paragraph.id}
    style={{whiteSpace:nowrap?'pre':'pre-wrap',paddingLeft:paragraph.list?qCss(uToQ(mmToU((paragraph.list.level+1)*3))):undefined}}>
    {paragraph.list&&<span aria-hidden="true" className="list-marker">{paragraph.list.kind==='ordered'?'1.':'•'}</span>}
    {paragraph.inlines.map(inline=>inline.kind==='lineBreak'?<br key={inline.id} data-inline-id={inline.id}/>:<span key={inline.id} data-inline-id={inline.id}
      style={{fontWeight:inline.marks.includes('bold')?700:undefined,fontStyle:inline.marks.includes('italic')?'italic':undefined,
        verticalAlign:inline.marks.includes('superscript')?'super':inline.marks.includes('subscript')?'sub':undefined,
        fontSize:inline.marks.includes('superscript')||inline.marks.includes('subscript')?'75%':undefined}}>{inline.text}</span>)}
  </p>)}</>;
}
