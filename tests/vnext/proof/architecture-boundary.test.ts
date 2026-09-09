import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const repoRoot=resolve('.');
const vnextRoot=resolve(repoRoot,'src/vnext');
const approvedSharedRepoImports=new Set<string>();

const forbiddenAuthorities=[
  ['Legacy catalog store','src/stores/useCatalogStore'],
  ['Legacy library store','src/stores/useLibraryStore'],
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
});
