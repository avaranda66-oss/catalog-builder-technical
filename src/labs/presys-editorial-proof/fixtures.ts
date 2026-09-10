import {
  mergeCells,
  plainRichText,
  type CatalogDocument,
  type Cell,
  type CellContent,
  type EditorialObject,
  type Page,
  type RichText,
  type TableModel,
  type TableStyle,
} from '@/vnext';

export const LONG_CODE='06.04.0121-00/IN1P/TA-50N-NH-PB-XXXXXXXXXXXX';
export const fixtureNames=['G01','G02','G03','G04','G05','rowspan-watch'] as const;
export type FixtureName=typeof fixtureNames[number];
const blue='#123F59',red='#B32237',ink='#203746';
const style:TableStyle={base:{fontSizePt:7.5,lineHeight:1.22,paddingMm:{top:.8,right:1.2,bottom:.8,left:1.2},
  borders:{top:{pattern:'solid',thicknessPt:.25,color:'#8195A1'},right:{pattern:'solid',thicknessPt:.25,color:'#8195A1'},bottom:{pattern:'solid',thicknessPt:.25,color:'#8195A1'},left:{pattern:'solid',thicknessPt:.25,color:'#8195A1'}}},
  rowRoles:{header:{background:blue,color:'#FFFFFF',fontWeight:700,paddingMm:{top:1.3,bottom:1.3}},section:{background:'#E7EEF2',color:blue,fontWeight:700}},
  annotation:{fontSizePt:7,lineHeight:1.3,color:'#405968',paddingMm:{top:0,right:0,bottom:0,left:0}},annotationGapMm:2};
export function createTable(id:string,rows:number,widths:number[],headers=1):TableModel {
  return {id,columns:widths.map((weight,i)=>({id:id+':c'+i,width:{mode:'flex',weight},minMm:4})),
    rows:Array.from({length:rows},(_,i)=>({id:id+':r'+i,role:i<headers?'header':'body',heightPolicy:{mode:'AUTO'}})),
    cells:Array.from({length:rows},(_,r)=>widths.map((_,c)=>({id:id+':'+r+':'+c,rowId:id+':r'+r,columnId:id+':c'+c,content:{type:'empty' as const}}))).flat(),
    style:structuredClone(style),annotations:[],legend:[]};
}
export function at(table:TableModel,row:number,column:number):Cell {
  return table.cells.find(c=>c.rowId===table.rows[row].id&&c.columnId===table.columns[column].id)!;
}
function text(table:TableModel,row:number,column:number,value:string):void {
  const cell=at(table,row,column);cell.content={type:'richText',value:plainRichText(cell.id+':text',value)};
}
function set(table:TableModel,row:number,column:number,content:CellContent):void {at(table,row,column).content=content;}
function tableObject(table:TableModel,xMm:number,yMm:number,widthMm:number,heightMm:number):EditorialObject {
  return {id:table.id+':object',type:'table',table,frame:{xMm,yMm,widthMm,heightMm},zIndex:1};
}
function textObject(id:string,value:string,xMm:number,yMm:number,widthMm:number,heightMm:number,fontSizePt:number,color=ink,bold=false):EditorialObject {
  return {id,type:'text',text:plainRichText(id+':text',value),frame:{xMm,yMm,widthMm,heightMm},zIndex:0,height:{mode:'fixed',mm:heightMm},
    style:{fontSizePt,color,fontWeight:bold?700:400,paddingMm:{top:0,right:0,bottom:0,left:0}}};
}
function page(id:string,title:string,kicker:string,objects:EditorialObject[]):Page {
  return {id,widthMm:210,heightMm:297,safeArea:{topMm:10,rightMm:12,bottomMm:12,leftMm:12},
    objects:[
      textObject(id+':brand','PRESYS',12,10,78,12,24,blue,true),
      textObject(id+':edition','ENGENHARIA ELÉTRICA  /  BRASIL',104,14,94,6,8,blue,true),
      textObject(id+':title',title,12,29,186,12,20,blue,true),
      textObject(id+':kicker',kicker,12,43,186,9,8,red,true),
      ...objects,
      textObject(id+':disclosure','PROVA EDITORIAL · Dados sintéticos para avaliação de layout. Não usar como especificação comercial.',12,271,186,8,6.5,'#526975'),
    ]};
}
function g01():Page {
  let t=createTable('g01-spec',27,[30,21,21,21,21,21,21],2);
  text(t,0,0,'Grandeza / condição');
  text(t,0,1,'ENTRADA ELÉTRICA');text(t,0,4,'REFERÊNCIA / PROCESSO');
  t=mergeCells(t,at(t,0,0).id,2,1);
  t=mergeCells(t,at(t,0,1).id,1,3);t=mergeCells(t,at(t,0,4).id,1,3);
  ['Faixa','Resolução','Incerteza','Faixa','Resolução','Incerteza'].forEach((v,i)=>text(t,1,i+1,v));
  const labels=['Tensão contínua','Corrente contínua','Resistência','Termopar tipo K','Termopar tipo J','Termopar tipo T','Termopar tipo S','Termorresistência Pt100'];
  for(let r=2;r<26;r++) {
    const group=Math.floor((r-2)/3),within=(r-2)%3;
    if(within===0)text(t,r,0,labels[group]);
    const unit=group===0?'mV':group===1?'mA':group===2?'Ω':'°C';
    set(t,r,1,{type:'measurement',valueText:['-10.000','+25.000','100.000'][within],unit});
    set(t,r,2,{type:'measurement',valueText:'0.001',unit});
    set(t,r,3,{type:'measurement',valueText:['0.010','0.015','0.020'][within],unit});
    set(t,r,4,{type:'measurement',valueText:['-25.00','+50.00','150.00'][within],unit});
    set(t,r,5,{type:'measurement',valueText:'0.01',unit});
    set(t,r,6,{type:'measurement',valueText:['0.02','0.03','0.04'][within],unit});
    if(r%2===0)t.rows[r].style={background:'#F1F5F7'};
  }
  for(let r=2;r<26;r+=3)t=mergeCells(t,at(t,r,0).id,3,1);
  text(t,26,0,'Condições de referência');
  text(t,26,1,'23 °C ± 2 °C; aquecimento de 30 min; umidade relativa de 20 % a 80 %.');
  t=mergeCells(t,at(t,26,1).id,1,6);
  t.rows[26].role='section';
  t.annotations=[{id:'g01-note',kind:'footnote',text:plainRichText('g01-note-text','Incerteza apresentada exclusivamente como amostra de composição. As faixas, unidades e zeros finais são dados autorais preservados; os valores deste ensaio não certificam desempenho de produto.')}];
  at(t,1,3).annotationIds=['g01-note'];
  at(t,1,6).annotationIds=['g01-note'];
  // Runs exercise mixed emphasis, explicit break and metrological sub/sup notation.
  const mixed:RichText={paragraphs:[{id:'g01-mixed-p',inlines:[
    {kind:'text',id:'g01-mixed-a',text:'Resistência ',marks:['bold']},
    {kind:'text',id:'g01-mixed-b',text:'R',marks:['italic']},
    {kind:'text',id:'g01-mixed-c',text:'0',marks:['subscript']},
    {kind:'lineBreak',id:'g01-mixed-br'},
    {kind:'text',id:'g01-mixed-d',text:'coef. 10',marks:[]},
    {kind:'text',id:'g01-mixed-e',text:'−3',marks:['superscript']},
  ]}]};
  at(t,8,0).content={type:'richText',value:mixed};
  return page('g01','Especificações agrupadas','G01  /  PRECISÃO, UNIDADES E HIERARQUIA',[
    tableObject(t,12,59,186,202),
  ]);
}
function g02():Page {
  const a=createTable('g02-a',10,[30,22,24],1),b=createTable('g02-b',10,[29,25,22],1),c=createTable('g02-c',8,[35,60,60],0);
  ['Função','Faixa','Resolução'].forEach((v,i)=>text(a,0,i,v));
  ['Sensor','Conexão','Canal'].forEach((v,i)=>text(b,0,i,v));
  for(let r=1;r<10;r++) {
    text(a,r,0,['Tensão','Corrente','Resistência'][(r-1)%3]);
    set(a,r,1,{type:'measurement',valueText:r+'.00',unit:r%2?'mV':'mA'});
    set(a,r,2,{type:'measurement',valueText:'0.001',unit:r%2?'mV':'mA'});
    text(b,r,0,['Pt100','Termopar K','Termopar J'][(r-1)%3]);text(b,r,1,r%2?'4 fios':'Compensada');text(b,r,2,'CH '+r);
  }
  const features=['Alimentação','Comunicação','Armazenamento','Display','Ambiente','Dimensões','Massa','Identificação'];
  for(let r=0;r<8;r++){text(c,r,0,features[r]);text(c,r,1,['100–240 Vca, 50/60 Hz','USB / Ethernet','Registro por procedimento','Interface colorida','Uso em laboratório','Conforme revisão aprovada','Conforme configuração','Código rastreável'][r]);text(c,r,2,'Dado demonstrativo · revisão R0');}
  set(c,7,1,{type:'technicalCode',value:'06.04.0121-00/IN1P'});
  c.columns[0].style={fontWeight:700,background:'#E7EEF2'};
  c.style.base.borders!.bottom={pattern:'solid',thicknessPt:1,color:'#123F59'};
  return page('g02','Composição independente','G02  /  TRÊS TABELAS, TRÊS FRAMES AUTORAIS',[
    textObject('g02-heading-a','ENTRADAS DE MEDIÇÃO',12,57,90,7,10,blue,true),
    textObject('g02-heading-b','CONEXÕES DE REFERÊNCIA',110,57,88,7,10,blue,true),
    tableObject(a,12,69,90,100),tableObject(b,110,69,88,100),
    textObject('g02-heading-c','CARACTERÍSTICAS GERAIS',12,179,186,7,10,blue,true),
    tableObject(c,12,190,186,73),
  ]);
}
function g03():Page {
  let t=createTable('g03-image',8,[51,42,93],1);
  ['Instrumento','Item','Descrição técnica'].forEach((v,i)=>text(t,0,i,v));
  set(t,1,0,{type:'image',assetId:'asset-ta25n'});
  at(t,1,0).contentPresentation={image:{fit:'contain',targetWidthMm:43,targetHeightMm:61}};
  for(let r=1;r<8;r++){
    text(t,r,1,['Aplicação','Referência','Conexão','Estabilização','Procedimento','Rastreabilidade','Fornecimento'][r-1]);
    text(t,r,2,[
      'Verificação de sensores de temperatura em ambiente controlado. Fotografia real usada apenas para validar conteúdo raster legítimo.',
      'Entrada dedicada para leitura de referência; configuração documentada no procedimento.',
      'Termorresistências e termopares conforme identificação dos canais e revisão técnica.',
      'Registrar a leitura somente após o critério autoral de estabilidade ser atendido.',
      'Manter os pontos, unidades e ordem de medição aprovados; anexar observações de montagem.',
      'Identificar instrumento, sensor, operador e revisão do procedimento no registro.',
      'Conjunto e acessórios dependem da configuração aprovada. Imagem ilustrativa da composição.',
    ][r-1]);
  }
  t=mergeCells(t,at(t,1,0).id,7,1);
  t.annotations=[
    {id:'g03-caption',kind:'caption',text:plainRichText('g03-caption-text','TA-25N · Integração de imagem, conteúdo técnico e observações')},
    {id:'g03-note',kind:'note',text:plainRichText('g03-note-text','Observação de montagem: posicionar o sensor à profundidade definida no procedimento e conferir o contato térmico. O tempo de estabilização depende do sensor, do inserto, da temperatura e do ambiente. Esta nota longa participa da altura intrínseca da tabela; sua presença não pode ampliar o frame, mover a tabela seguinte nem criar uma página automaticamente. Qualquer insuficiência de espaço deve ser apresentada ao autor como diagnóstico bloqueante.')},
    {id:'g03-footnote',kind:'footnote',text:plainRichText('g03-footnote-text','Fotografia proveniente do asset PRESYS já existente no repositório. Descrições e parâmetros desta prova são sintéticos e exigem revisão antes de uso comercial.')},
  ];
  t.annotationIds=['g03-caption','g03-note'];at(t,7,2).annotationIds=['g03-footnote'];
  let small=createTable('g03-procedure',5,[20,120,46],1);
  ['Etapa','Registro','Critério'].forEach((v,i)=>text(small,0,i,v));
  for(let r=1;r<5;r++){text(small,r,0,'0'+r);text(small,r,1,['Identificação do sensor e instrumento','Configuração dos pontos e unidades','Leitura de referência e indicação','Registro de resultado e observações'][r-1]);text(small,r,2,['Conferir','Aprovar','Estabilizar','Revisar'][r-1]);}
  small=mergeCells(small,at(small,1,2).id,1,1);
  return page('g03','Imagem e documentação técnica','G03  /  CONTEÚDO MISTO, CAPTION, NOTE E FOOTNOTE',[
    tableObject(t,12,59,186,157),tableObject(small,12,224,186,40),
  ]);
}
function g04():Page {
  const t=createTable('g04-matrix',17,[52,22,22,22,22,22,22],1);
  t.style.annotation.fontFamily='Noto Sans JP';
  t.style.rowRoles.header!.borders={bottom:{pattern:'solid',thicknessPt:2,color:blue}};
  ['Recurso / acessório','TA-25N','TA-35N','TA-50N','TC-100','TC-200','TC-300'].forEach((v,i)=>text(t,0,i,v));
  t.legend=[
    {id:'g04-standard',markerCode:'●',text:plainRichText('g04-standard-text','Incluído na configuração demonstrativa')},
    {id:'g04-option',markerCode:'○',text:plainRichText('g04-option-text','Opcional, sujeito à configuração')},
    {id:'g04-no',markerCode:'—',text:plainRichText('g04-no-text','Não aplicável à combinação demonstrativa')},
  ];
  const labels=['Sensor de referência','Cabo de comunicação','Estojo de transporte','Inserto de 6 mm','Inserto de 8 mm','Inserto de 10 mm','Adaptador de conexão','Cabo de alimentação','Registro de dados','Entrada de corrente','Entrada de tensão','Leitura de resistência','Procedimento guiado','Relatório de ensaio','Interface Ethernet','Documentação técnica'];
  for(let r=1;r<17;r++){
    text(t,r,0,labels[r-1]);t.rows[r].heightPolicy={mode:'MIN_MM',minMm:8};
    if(r%2===0)t.rows[r].style={background:'#F1F5F7'};
    for(let c=1;c<7;c++){set(t,r,c,{type:'marker',legendEntryId:t.legend[(r+c)%3].id});at(t,r,c).style={fontFamily:'Noto Sans JP',textAlign:'center',fontSizePt:11,color:(r+c)%3===0?blue:'#405968'};}
  }
  t.annotations=[{id:'g04-note',kind:'note',text:plainRichText('g04-note-text','Compatibilidade inteiramente sintética: esta matriz demonstra marcadores com referência semântica. A legenda resolve os IDs das células; os símbolos não são valores de texto independentes.') }];
  t.annotationIds=['g04-note'];
  return page('g04','Matriz de compatibilidade','G04  /  MARCADORES SEMÂNTICOS E LEGENDA EDITORIAL',[tableObject(t,12,59,186,201)]);
}
function g05():Page {
  const a=createTable('g05-code',2,[1],0);
  set(a,0,0,{type:'technicalCode',value:LONG_CODE});at(a,0,0).contentPresentation={wrapPolicy:'nowrap'};
  text(a,1,0,'Texto multilinha deliberadamente longo para exceder uma linha de altura autoral fixa.');
  a.rows[1].heightPolicy={mode:'FIXED_MM',heightMm:2};
  const b=createTable('g05-impossible',1,[1,1,1],0);
  b.columns[0].width={mode:'fixed',mm:70};b.columns[1].width={mode:'fixed',mm:50};b.columns[2].minMm=20;
  return page('g05','Diagnósticos adversariais','G05  /  ERROS BLOQUEIAM O PDF FINAL',[
    tableObject(a,8,60,56,3),tableObject(b,12,90,100,20),
    textObject('g05-outside','Objeto fora da página',195,125,30,10,10),
    textObject('g05-overlap-a','Sobreposição autoral A',12,145,95,10,10),
    textObject('g05-overlap-b','Sobreposição autoral B',30,145,95,10,10),
  ]);
}
function rowspanWatch():Page {
  let t=createTable('watch-table',3,[64,64,58],0);
  for(let r=0;r<3;r++)t.rows[r].heightPolicy={mode:'MIN_MM',minMm:10};
  // Two intersecting row constraints in disjoint columns. A compact witness shares growth in row 1.
  for(const [r,c] of [[0,0],[1,1]]) {
    const cell=at(t,r,c);
    cell.content={type:'richText',value:{paragraphs:[{id:cell.id+':p',inlines:Array.from({length:12},(_,i)=>[
      ...(i?[{kind:'lineBreak' as const,id:cell.id+':br'+i}]:[]),
      {kind:'text' as const,id:cell.id+':line'+i,text:'Linha técnica '+String(i+1).padStart(2,'0'),marks:[]},
    ]).flat()}]}};
  }
  t=mergeCells(t,at(t,0,0).id,2,1);t=mergeCells(t,at(t,1,1).id,2,1);
  for(let r=0;r<3;r++)text(t,r,2,'Linha '+r+' · base mínima de 10 mm');
  return page('rowspan-watch','Rowspan: ensaio de densidade','CONTRAEXEMPLO POTENCIAL  /  ALGORITMO CONGELADO',[tableObject(t,12,59,186,55)]);
}
export function makeFixture(name:FixtureName|'all'):CatalogDocument {
  const pages=name==='all'?[g01(),g02(),g03(),g04()]:[({G01:g01,G02:g02,G03:g03,G04:g04,G05:g05,'rowspan-watch':rowspanWatch}[name])()];
  return {schemaVersion:1,id:'proof-'+name,title:'PRESYS · Foundation proof '+name,locale:'pt-BR',
    style:{fonts:[...[400,700].flatMap(weight=>['normal','italic'].map(s=>({family:'Noto Sans',revision:'5.3.0',weight:weight as 400|700,style:s as 'normal'|'italic'}))),
      ...(name==='all'||name==='G04'?[{family:'Noto Sans JP',revision:'5.3.0',weight:400 as const,style:'normal' as const}]:[])],
      defaultText:{fontFamily:'Noto Sans',fontSizePt:8,lineHeight:1.25,fontWeight:400,color:ink,paddingMm:{top:0,right:0,bottom:0,left:0}},palette:[blue,red,ink]},
    pages,assets:name==='all'||name==='G03'?[{id:'asset-ta25n',version:'repo-616332d',sha256:'9a3b009caa49f76df16f59b8733dda1c1c5d8459479006c1bcc4b37e7071c067',mime:'image/jpeg',widthPx:545,heightPx:767,name:'TA-25N repository photograph',alt:'Fotografia de um calibrador PRESYS TA-25N'}]:[]};
}
