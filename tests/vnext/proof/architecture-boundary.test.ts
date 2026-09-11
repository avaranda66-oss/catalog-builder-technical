import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const repoRoot=resolve('.');
const vnextRoot=resolve(repoRoot,'src/vnext');
const approvedSharedRepoImports=new Set<string>();

const forbiddenAuthorities=[
  ['Legacy catalog store','src/stores/useCatalogStore'],
  ['Legacy library store','src/stores/useLibraryStore'],
  ['Legacy coupled auth store','src/stores/useAuthStore'],
  ['Legacy catalog schema authority','src/domain/catalog.schema'],
  ['Legacy A4 canvas','src/components/editor/A4Canvas'],
  ['Legacy A4 page flow','src/domain/page-flow-planner'],
  ['Legacy A4 render planning','src/domain/a4-render-plan'],
  ['Legcy table renderer','src/components/editor/table-core'],
  ['Legacy table adapters','src/domain/table-core/legacy-table'],
  ['Legacy specialized table renderer','src/components/editor/blocks/AccessoriesTableBlock'],
  ['Legacy specialized table renderer','src/components/editor/blocks/CustomTableBlock'],
  ['Legacy specialized table renderer','src/components/editor/blocks/ElectricalTableBlock'],
  ['Legacy specialized table renderer','src/components/editor/blocks/MatrixSpecTableBlock'],
  ['Legacy specialized table renderer','src/components/editor/blocks/OrderingCodesBlock'],
  ['Legacy specialized table renderer','src/components/editor/blocks/TechnicalTableBlock'],
  ['Legacy presence authority','src/stores/usePresenceStore'],
  ['Legacy presence authority','src/services/presence.service'],
  ['Legacy realtime authority','src/services/realtime.service'],
  ['Legacy realtime authority','src/services/product-workbook/product-workbook.realtime'],
  ['Legacy realtime authority','src/services/product-workbook/source-document.realtime'],
  ['Legacy editor view','src/components/editor/EditorView'],
  ['Legacy print document view','src/components/export/PrintDocumentView'],
  ['Legacy raster PDF service','src/services/pdf.service'],
] as const;

const browserIdentifiers=new Set([
  'document','window','HTMLElement','HTMLImageElement','ParentNode','CSS','getComputedStyle',
  'fetch','Response','FontFace','Blob','URL',
]);

function normalize(path:string):string {
  return path.split(String.fromCharCode(92)).join('/').replace(/\.(?:tsx?|jsx?|mjs|css)$/,'');
}

function filesUnder(directory:string):string[] {
  return readdirSync(directory).flatMap(name=>{
    const path=resolve(directory,name);
    return statSync(path).isDirectory()?filesUnder(path):/\.(?:tsx?|css)$/.test(name)?[path]:[];
  });
}

function specifiers(source:ts.SourceFile):string[] {
  const found:string[]=[];
  const visit=(node:ts.Node):void=>{
    if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier))found.push(node.moduleSpecifier.text);
    if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword&&node.arguments.length===1&&ts.isStringLiteral(node.arguments[0]))found.push(node.arguments[0].text);
    ts.forEachChild(node,visit);
  };
  visit(source);
  return found;
}

function repoTarget(file:string,specifier:string):string|undefined {
  if(specifier.startsWith('@/'))return resolve(repoRoot,'src',specifier.slice(2));
  if(specifier.startsWith('.'))return resolve(dirname(file),specifier);
  return undefined;
}

function localModule(file:string,specifier:string):string|undefined {
  const target=repoTarget(file,specifier);
  if(!target)return undefined;
  const candidates=[target,target+'.ts',target+'.tsx',target+'.css',resolve(target,'index.ts'),resolve(target,'index.tsx')];
  return candidates.find(candidate=>existsSync(candidate)&&statSync(candidate).isFile());
}

function localGraph(entry:string):Set<string> {
  const seen=new Set<string>(),pending=[entry];
  while(pending.length){
    const file=pending.pop()!;
    if(seen.has(file))continue;
    seen.add(file);
    if(file.endsWith('.css'))continue;
    const text=readFileSync(file,'utf8');
    const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
    for(const specifier of specifiers(source)){
      const target=localModule(file,specifier);
      if(target&&!seen.has(target))pending.push(target);
    }
  }
  return seen;
}

function pureGraphViolations(entry:string):string[] {
  const violations:string[]=[];
  for(const file of localGraph(entry)){
    const relFile=normalize(relative(repoRoot,file));
    if(file.endsWith('.css')){violations.push(`${relFile}: CSS side effect in pure entry point`);continue;}
    if(relFile.startsWith('src/vnext/rendering/')||relFile.startsWith('src/vnext/publication/'))
      violations.push(`${relFile}: browser/publication layer reachable from pure entry point`);
    const text=readFileSync(file,'utf8');
    const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
    if(specifiers(source).some(specifier=>specifier==='react'||specifier.startsWith('react/')))
      violations.push(`${relFile}: React reachable from pure entry point`);
    const visit=(node:ts.Node):void=>{
      if(ts.isIdentifier(node)&&browserIdentifiers.has(node.text))violations.push(`${relFile}: browser authority ${node.text}`);
      ts.forEachChild(node,visit);
    };
    visit(source);
  }
  return violations;
}

function applicationGraphViolations(entry:string):string[] {
  const violations:string[]=[];
  const applicationBrowserIdentifiers=new Set(['window','HTMLElement','HTMLImageElement','ParentNode','CSS','getComputedStyle','localStorage','sessionStorage','fetch','Response','FontFace','Blob']);
  for(const file of localGraph(entry)){
    const relFile=normalize(relative(repoRoot,file));
    if(file.endsWith('.css')){violations.push(`${relFile}: CSS side effect in application entry point`);continue;}
    if(relFile.startsWith('src/vnext/rendering/')||relFile.startsWith('src/vnext/publication/')||relFile.startsWith('src/vnext/app/'))
      violations.push(`${relFile}: presentation/browser layer reachable from application entry point`);
    const text=readFileSync(file,'utf8');
    const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
    if(specifiers(source).some(specifier=>specifier==='react'||specifier.startsWith('react/')))
      violations.push(`${relFile}: React reachable from application entry point`);
    const visit=(node:ts.Node):void=>{
      if(ts.isIdentifier(node)&&applicationBrowserIdentifiers.has(node.text))violations.push(`${relFile}: browser authority ${node.text}`);
      ts.forEachChild(node,visit);
    };
    visit(source);
  }
  return violations;
}

function ordinarySelectors(css:string):string[] {
  const source=css.replace(/\/\*[\s\S]*?\*\//g,'').replace(/@import\s+[^;]+;/g,'');
  const selectors:string[]=[];
  for(const match of source.matchAll(/([^{}]+)\{/g)){
    const prelude=match[1].trim();
    if(!prelude||prelude.startsWith('@'))continue;
    selectors.push(...prelude.split(',').map(selector=>selector.trim()).filter(Boolean));
  }
  return selectors;
}

function isWithin(root:string,target:string):boolean {
  const rel=relative(root,target);
  return rel===''||(!rel.startsWith('..')&&!resolve(root,rel).startsWith('\\\\'));
}

describe('VNext architecture boundary',()=>{
  it('keeps production ownership isolated from Legacy and proof infrastructure',()=>{
    const violations:string[]=[];
    for(const file of filesUnder(vnextRoot)){
      const relFile=normalize(relative(repoRoot,file));
      const text=readFileSync(file,'utf8');
      if(file.endsWith('.css')){
        for(const match of text.matchAll(/@import\s+['"]([^'"]+)['"]/g)){
          const target=repoTarget(file,match[1]);
          if(target&&!isWithin(vnextRoot,target))violations.push(`${relFile}: CSS import escapes VNext -> ${match[1]}`);
        }
        continue;
      }
      const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
      for(const specifier of specifiers(source)){
        const target=repoTarget(file,specifier);
        if(!target||isWithin(vnextRoot,target))continue;
        const normalized=normalize(relative(repoRoot,target));
        const authority=forbiddenAuthorities.find(([,prefix])=>normalized===prefix||normalized.startsWith(prefix+'/'));
        if(authority)violations.push(`${relFile}: ${authority[0]} -> ${specifier}`);
        else if(normalized.startsWith('src/labs/')||normalized.startsWith('tests/')||normalized.startsWith('scratch/'))
          violations.push(`${relFile}: reverse proof dependency -> ${specifier}`);
        else if(!approvedSharedRepoImports.has(normalized))
          violations.push(`${relFile}: unapproved repository dependency -> ${specifier}`);
      }
      if(relFile.startsWith('src/vnext/domain/')||relFile.startsWith('src/vnext/table/')){
        const visit=(node:ts.Node):void=>{
          if(ts.isIdentifier(node)&&browserIdentifiers.has(node.text))violations.push(`${relFile}: browser authority ${node.text}`);
          ts.forEachChild(node,visit);
        };
        visit(source);
        if(specifiers(source).some(specifier=>specifier==='react'||specifier.startsWith('react/')))
          violations.push(`${relFile}: React dependency in pure foundation`);
      }
    }
    expect(violations,violations.join('\n')).toEqual([]);
  });

  it('keeps the root, domain and table public entry points pure',()=>{
    const entries=[resolve(vnextRoot,'index.ts'),resolve(vnextRoot,'domain/index.ts'),resolve(vnextRoot,'table/index.ts')];
    const violations=entries.flatMap(entry=>pureGraphViolations(entry));
    expect(violations,violations.join('\n')).toEqual([]);
  });

  it('keeps the W1 application entry point pure and below presentation/runtime adapters',()=>{
    const entry=resolve(vnextRoot,'application/index.ts');
    const violations=applicationGraphViolations(entry);
    expect(violations,violations.join('\n')).toEqual([]);
  });

  it('keeps the VNext app graph isolated from Legacy application authorities',()=>{
    const entry=resolve(vnextRoot,'app/bootstrap.tsx');
    const violations:string[]=[];
    for(const file of localGraph(entry)){
      const relFile=normalize(relative(repoRoot,file));
      if(relFile==='src/App'||relFile==='src/legacy-main')violations.push(`${relFile}: Legacy bootstrap reachable from /v2`);
      const authority=forbiddenAuthorities.find(([,prefix])=>relFile===prefix||relFile.startsWith(prefix+'/'));
      if(authority)violations.push(`${relFile}: ${authority[0]} reachable from /v2`);
    }
    expect(violations,violations.join('\n')).toEqual([]);
  });

  it('selects the VNext or Legacy entry before either application graph is loaded',()=>{
    const file=resolve(repoRoot,'src/main.tsx');
    const text=readFileSync(file,'utf8');
    const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
    const staticImports=source.statements.flatMap(statement=>ts.isImportDeclaration(statement)&&ts.isStringLiteral(statement.moduleSpecifier)?[statement.moduleSpecifier.text]:[]);
    expect(staticImports).toEqual([]);
    expect(specifiers(source)).toEqual(expect.arrayContaining(['./vnext/app/bootstrap','./legacy-main']));
    expect(text).toContain("window.location.pathname === '/v2'");
  });

  it('does not expose an unrestricted whole-document mutation action',()=>{
    const applicationSource=filesUnder(resolve(vnextRoot,'application'))
      .filter(path=>/\.ts$/.test(path))
      .map(path=>readFileSync(path,'utf8'))
      .join('\n');
    expect(applicationSource).not.toMatch(
      /document\.replace|ReplaceDocument|SetDocument|PatchArbitraryJson|ApplyJsonPatchFromAI|JsonPatch|JSONPatch|setDocument\s*\(|setProperty\s*\(/
    );
  });

  it('scopes renderer CSS and leaves global page policy outside generic rendering',()=>{
    const css=readFileSync(resolve(vnextRoot,'rendering/styles.css'),'utf8');
    const selectors=ordinarySelectors(css);
    expect(selectors.length).toBeGreaterThan(0);
    expect(selectors.filter(selector=>!selector.startsWith('[data-editorial-root]'))).toEqual([]);
    expect(css).not.toMatch(/@page\b/i);
  });

  it('keeps arbitrary footer copy out of the production renderer contract',()=>{
    const file=resolve(vnextRoot,'rendering/DocumentRenderer.tsx'),text=readFileSync(file,'utf8');
    const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
    const declaration=source.statements.find((statement):statement is ts.InterfaceDeclaration=>ts.isInterfaceDeclaration(statement)&&statement.name.text==='DocumentRendererProps');
    const props=declaration?.members.flatMap(member=>ts.isPropertySignature(member)&&member.name&&ts.isIdentifier(member.name)?[member.name.text]:[])??[];
    expect(props.sort()).toEqual(['assetUrls','document','plans']);
    const rendererSource=filesUnder(resolve(vnextRoot,'rendering')).filter(path=>/\.tsx?$/.test(path)).map(path=>readFileSync(path,'utf8')).join('\n');
    expect(rendererSource).not.toMatch(/\bfooterLabel\b|PROVA EDITORIAL|editorial-page-number/);
  });

  it('keeps canonical rendering free of editor state and application mutation authority',()=>{
    const renderingFiles=filesUnder(resolve(vnextRoot,'rendering')).filter(path=>/\.tsx?$/.test(path));
    const violations:string[]=[];
    for(const file of renderingFiles) {
      const relFile=normalize(relative(repoRoot,file));
      const text=readFileSync(file,'utf8');
      const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
      for(const specifier of specifiers(source)) {
        const target=repoTarget(file,specifier);
        if(!target)continue;
        const normalized=normalize(relative(repoRoot,target));
        if(normalized.startsWith('src/vnext/application/')||normalized.startsWith('src/vnext/app/'))
          violations.push(`${relFile}: mutation/editor application layer import -> ${specifier}`);
      }
      if(/\b(selectedObjectIds|hoveredObjectId|activeHandle|dragPreview|snappingState|editorMode|contentEditable)\b/.test(text))
        violations.push(`${relFile}: editor interaction state in canonical rendering`);
    }
    expect(violations,violations.join('\n')).toEqual([]);
  });

  it('keeps W2.E template authority out of canonical domain, rendering, publication, and execution context',()=>{
    const canonicalSource=[
      ...filesUnder(resolve(vnextRoot,'domain')),
      ...filesUnder(resolve(vnextRoot,'rendering')),
      ...filesUnder(resolve(vnextRoot,'publication')),
    ].filter(path=>/\.tsx?$/.test(path)).map(path=>readFileSync(path,'utf8')).join('\n');
    expect(canonicalSource).not.toMatch(
      /\b(templateId|templateVersion|sourceTemplate|templateRegistry|TemplateRenderer|CoverRenderer|TemplatePage|TemplateObject|PresetRenderer)\b|page\.template\.insert|data-template/
    );

    const contracts=readFileSync(resolve(vnextRoot,'application/contracts.ts'),'utf8');
    const source=ts.createSourceFile('contracts.ts',contracts,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
    const context=source.statements.find((statement):statement is ts.InterfaceDeclaration=>
      ts.isInterfaceDeclaration(statement)&&statement.name.text==='ApplicationExecutionContext');
    const props=context?.members.flatMap(member=>
      ts.isPropertySignature(member)&&member.name&&ts.isIdentifier(member.name)?[member.name.text]:[])??[];
    expect(props).toEqual(['transactionId']);
  });

  it('keeps W2.F Group topology canonical, shallow, and outside editor/runtime side channels',()=>{
    const domainSource=filesUnder(resolve(vnextRoot,'domain')).filter(path=>/\.ts$/.test(path)).map(path=>readFileSync(path,'utf8')).join('\n');
    const applicationSource=filesUnder(resolve(vnextRoot,'application')).filter(path=>/\.ts$/.test(path)).map(path=>readFileSync(path,'utf8')).join('\n');
    const renderingSource=filesUnder(resolve(vnextRoot,'rendering')).filter(path=>/\.tsx?$/.test(path)).map(path=>readFileSync(path,'utf8')).join('\n');
    const allSource=filesUnder(vnextRoot).filter(path=>/\.tsx?$/.test(path)).map(path=>readFileSync(path,'utf8')).join('\n');
    const model=readFileSync(resolve(vnextRoot,'domain/editorial-model.ts'),'utf8');
    const tree=readFileSync(resolve(vnextRoot,'domain/object-tree.ts'),'utf8');
    const snapping=readFileSync(resolve(vnextRoot,'editor/snapping.ts'),'utf8');

    expect(model).toMatch(/GroupObjectSchema=.*objects:z\.array\(LeafEditorialObjectSchema\)\.min\(2\)/s);
    expect(tree).toContain('walkPageObjects');
    expect(tree).toContain('resolvedFrameU');
    expect(tree).not.toMatch(/react|HTMLElement|window|ParentNode|CSS|pointer/i);
    expect(domainSource+'\n'+applicationSource).not.toMatch(/\bselectedObjectIds\b/);
    expect(allSource).not.toMatch(/\b(parentId|memberIds)\b/);
    expect(applicationSource.match(/class\s+IdAllocator\b/g)?.length??0).toBe(1);
    expect(renderingSource).not.toMatch(/GroupRenderer|GroupDocumentRenderer|GroupPublicationRenderer/);
    expect(allSource).not.toMatch(/GroupTable(?:Engine|Layout)|GroupSnap(?:Engine|Solver)/);
    expect(snapping).not.toMatch(/\bgroup\b/i);
    expect(applicationSource).not.toMatch(/contentEditable|beforeinput|compositionstart|compositionend/i);
    expect(renderingSource).not.toMatch(/contentEditable|selectionPath|caret|composition/i);
  });

  it('keeps W2.G direct Text editing draft-only in the editor and canonical mutation in Application',()=>{
    const editor=readFileSync(resolve(vnextRoot,'app/EditorWorkspace.tsx'),'utf8');
    const textEditing=readFileSync(resolve(vnextRoot,'application/text-editing.ts'),'utf8');
    const applicationSource=filesUnder(resolve(vnextRoot,'application'))
      .filter(path=>/\.ts$/.test(path))
      .map(path=>readFileSync(path,'utf8'))
      .join('\n');
    const publicationSource=[
      ...filesUnder(resolve(vnextRoot,'rendering')),
      ...filesUnder(resolve(vnextRoot,'publication')),
    ].filter(path=>/\.tsx?$/.test(path)).map(path=>readFileSync(path,'utf8')).join('\n');

    expect(editor.match(/type:\s*'text\.setContent'/g)?.length??0).toBe(1);
    expect(editor).toContain('<textarea');
    expect(editor).not.toMatch(/contentEditable|innerHTML|createRange|selectionPath|DOM\s+Range/i);
    expect(textEditing).toContain("import type { CanonicalIdAllocator } from './document'");
    expect(textEditing).not.toMatch(/randomUUID|crypto\.|class\s+IdAllocator\b|\bframe\b/i);
    expect(applicationSource.match(/class\s+IdAllocator\b/g)?.length??0).toBe(1);
    expect(applicationSource).not.toMatch(/contentEditable|innerHTML|beforeinput|compositionstart|compositionend/i);
    expect(publicationSource).not.toMatch(/data-text-edit|vnext-text-symbols|Concluir|Cancelar|technicalSymbols/i);
    expect(editor+'\n'+textEditing).not.toMatch(/localStorage|sessionStorage|indexedDB|translation|translateText|persistDraft/i);
    expect(editor).not.toMatch(/parentGroup|childIndex|drill.?down/i);
  });
});
