// Disposable screen coordinates and fixture content. NOT a VNext document schema.
export type Item = { id: string; kind: 'text'|'image'|'table'|'shape'|'line'; name: string; x:number; y:number; w:number; h:number; text:string; fill:string; color:string; size:number; bold?:boolean; italic?:boolean; align?:'left'|'center'|'right'; font?:string; leading?:number; opacity?:number; radius?:number; fit?:string; crop?:number; alternate?:boolean; bleed?:boolean; rows?:string[][]; widths?:number[]; header?:boolean; title?:string; group?:string; note?:string; footnote?:string; section?:string; cells?:Record<string,{fill?:string;color?:string;align?:'left'|'center'|'right'}>; merges?:{r:number;c:number;rs:number;cs:number}[]; borders?:boolean; padding?:number };
export type Page = {id:string; name:string; objects:Item[]};
export const uid=()=>crypto.randomUUID();
export const make=(kind:Item['kind'], patch:Partial<Item>={}):Item=>({id:uid(),kind,name:({text:'Texto',image:'Imagem do produto',table:'Tabela técnica',shape:'Forma',line:'Linha'})[kind],x:48,y:90,w:490,h:70,text:kind==='text'?'Clique duas vezes para editar':'',fill:kind==='shape'?'#123e59':'#ffffff',color:'#16374b',size:28,...patch});
export const table=()=>make('table',{y:450,h:265,size:13,rows:[['Característica','Faixa','Resolução'],['Temperatura','−25 a 150 °C','0,01 °C'],['Estabilidade','±0,02 °C','—'],['Alimentação','100–240 V','50 / 60 Hz'],['Comunicação','USB / Ethernet','—']],widths:[42,32,26],header:true,borders:true,padding:10,cells:{},merges:[]});
export const cover=():Page=>({id:uid(),name:'Capa · TA-25N',objects:[
make('shape',{name:'Fundo da capa',x:0,y:0,w:595,h:842,fill:'#edf2f4',bleed:true}),
make('shape',{name:'Faixa PRESYS',x:0,y:0,w:19,h:842,fill:'#123e59',bleed:true}),
make('text',{name:'Logo editável',x:48,y:45,w:260,h:50,text:'PRESYS',size:32,bold:true}),
make('text',{name:'Categoria',x:48,y:119,w:460,h:35,text:'METROLOGIA • TEMPERATURA',size:12}),
make('text',{name:'Título da capa',x:48,y:177,w:490,h:116,text:'Precisão em cada\nmedição.',size:42,bold:true}),
make('text',{name:'Modelo',x:48,y:302,w:490,h:48,text:'TA-25N',size:30}),
make('image',{x:74,y:382,w:446,h:303}),
make('text',{name:'Contato',x:48,y:750,w:490,h:40,text:'PRESYS   •   Instrumentos e sistemas\nwww.presys.com.br',size:12})
]});
export const initial=():Page[]=>[cover(),{id:uid(),name:'Especificações',objects:[
make('text',{name:'Logo editável',x:48,y:38,w:250,h:32,text:'PRESYS',size:22,bold:true}),
make('text',{name:'Título da página',x:48,y:99,w:490,h:62,text:'Calibrador de temperatura',size:30,bold:true}),
make('text',{name:'Modelo e descrição',x:48,y:164,w:250,h:112,text:'TA-25N\nPrecisão e estabilidade para\nseu laboratório.',size:17,leading:1.5}),
make('image',{x:310,y:168,w:235,h:226}),
make('text',{name:'Introdução',x:48,y:297,w:220,h:94,text:'Desempenho confiável.\nOperação intuitiva.\nControle em cada etapa.',size:14,leading:1.65}),
table(),
make('text',{name:'Rodapé',x:48,y:782,w:490,h:22,text:'PRESYS   /   Catálogo técnico                                      02',size:10})
]}];
export function Product({alternate=false}:{alternate?:boolean}) {return <svg viewBox="0 0 440 300" role="img" aria-label="Ilustração demonstrativa de calibrador, não fotografia de produto"><defs><linearGradient id="body" x2="1" y2="1"><stop stopColor="#f7fafb"/><stop offset="1" stopColor="#afbdc6"/></linearGradient><linearGradient id="side"><stop stopColor="#536672"/><stop offset="1" stopColor="#8b9ba6"/></linearGradient></defs><ellipse cx="231" cy="270" rx="143" ry="16" fill="#102e43" opacity=".1"/><path d="M105 63 296 38 350 80 350 242 151 272 105 235Z" fill="url(#side)"/><path d="M105 63 296 38 296 219 105 244Z" fill="url(#body)"/><path d="M296 38 350 80 350 242 296 219Z" fill="#aebbc4"/><path d="M127 86 275 67 275 173 127 193Z" fill={alternate?'#17697a':'#123e59'}/><path d="M145 106 255 92 255 140 145 154Z" fill="#93d3d0"/><text x="154" y="135" transform="rotate(-7 154 135)" fontSize="22" fill="#16454f" fontFamily="monospace">25.000</text><circle cx="156" cy="174" r="6" fill="#f9fbfb"/><circle cx="180" cy="171" r="6" fill="#f9fbfb"/><circle cx="205" cy="168" r="6" fill="#f9fbfb"/><circle cx="249" cy="162" r="10" fill="#62a4ae"/><text x="145" y="219" transform="rotate(-7 145 219)" fontSize="14" fill="#214258" fontWeight="bold">PRESYS</text>{[0,1,2,3,4].map(i=><path key={i} d={`M311 ${114+i*15} 334 ${132+i*15}`} stroke="#798d9c" strokeWidth="4"/>)}</svg>}

