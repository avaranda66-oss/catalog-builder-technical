import { describe, expect, it } from 'vitest';
import { arsenalPresetMatchesQuery } from '../../../src/vnext/arsenal/contracts';
import {
  arsenalSearchStem,
  arsenalSearchTermMatchesWord,
  arsenalSignificantTerms,
} from '../../../src/vnext/arsenal/search-text';
import { arsenalQueryTerms, arsenalSearchScore, searchArsenalPresets } from '../../../src/vnext/arsenal/search';
import { builtinCoverPreset, headerBlockDraft, specTableDraft, teamPresetFromDraft } from './contract/fixtures';

describe('busca do arsenal — palavras', () => {
  it('singular aproximado do português', () => {
    expect(['capas', 'tabelas', 'cabecalhos', 'rodapes', 'paginas', 'estilos'].map(arsenalSearchStem))
      .toEqual(['capa', 'tabela', 'cabecalho', 'rodape', 'pagina', 'estilo']);
    expect(['opcoes', 'botoes', 'especiais', 'papeis', 'azuis', 'farois', 'imagens', 'itens', 'cores', 'luzes', 'meses']
      .map(arsenalSearchStem)).toEqual(['opcao', 'botao', 'especial', 'papel', 'azul', 'farol', 'imagem', 'item', 'cor', 'luz', 'mes']);
    expect(['cor', 'gas', 'tres', 'classe', 'mais', 'dois'].map(arsenalSearchStem)).toEqual(['cor', 'gas', 'tre', 'classe', 'mai', 'doi']);
  });

  it('casa por começo de palavra e pelo singular, nos dois sentidos', () => {
    expect(arsenalSearchTermMatchesWord('opcoes', 'opcao')).toBe(true);
    expect(arsenalSearchTermMatchesWord('opcao', 'opcoes')).toBe(true);
    expect(arsenalSearchTermMatchesWord('opco', 'opcoes')).toBe(true);
    expect(arsenalSearchTermMatchesWord('imagens', 'imagem')).toBe(true);
    expect(arsenalSearchTermMatchesWord('tabelas', 'tabela')).toBe(true);
    expect(arsenalSearchTermMatchesWord('', 'qualquer')).toBe(true);
    expect(arsenalSearchTermMatchesWord('rodape', 'capa')).toBe(false);
  });

  it('palavras pequenas não precisam aparecer, a menos que sejam tudo o que foi digitado', () => {
    expect(arsenalSignificantTerms(['pe', 'de', 'pagina'])).toEqual(['pe', 'pagina']);
    expect(arsenalSignificantTerms(['de'])).toEqual(['de']);
    expect(arsenalQueryTerms('  Tabela  COM notas ')).toEqual(['tabela', 'notas']);
  });
});

describe('busca do arsenal — presets', () => {
  const header = teamPresetFromDraft(headerBlockDraft(), { id: '55555555-5555-4555-8555-555555555551' });
  const table = teamPresetFromDraft(specTableDraft(), { id: '55555555-5555-4555-8555-555555555552', useCount: 3 });
  const cover = builtinCoverPreset();

  it('arsenalPresetMatchesQuery do contrato também tolera plurais e palavras pequenas', () => {
    expect(arsenalPresetMatchesQuery(header, 'cabeçalhos azuis')).toBe(true);
    expect(arsenalPresetMatchesQuery(header, 'barras superiores')).toBe(true);
    expect(arsenalPresetMatchesQuery(table, 'fichas tecnicas')).toBe(true);
    expect(arsenalPresetMatchesQuery(table, 'tabela de especificações')).toBe(true);
    expect(arsenalPresetMatchesQuery(table, 'tabela de capa')).toBe(false);
  });

  it('a frase inteira num sinônimo vale mais que palavras soltas', () => {
    expect(arsenalSearchScore(header, 'barra superior')).toBeGreaterThan(arsenalSearchScore(header, 'superior barra'));
    expect(arsenalSearchScore(header, 'rodape')).toBe(0);
    expect(arsenalSearchScore(header, '')).toBe(1);
  });

  it('sem texto: tudo, por categoria e uso; com texto: mais relevante primeiro', () => {
    expect(searchArsenalPresets([table, header, cover], '').map((preset) => preset.id)).toEqual([cover.id, table.id, header.id]);
    expect(searchArsenalPresets([cover, table, header], 'azul').map((preset) => preset.id)).toEqual([header.id, cover.id]);
    expect(searchArsenalPresets([cover, table, header], 'azul', { scope: 'builtin' })).toEqual([cover]);
    const newer = { ...header, id: '55555555-5555-4555-8555-555555555553', payloadSchemaVersion: 2 };
    expect(searchArsenalPresets([header, newer], 'cabecalho').length).toBe(2);
    expect(searchArsenalPresets([header, newer], 'cabecalho', { insertableOnly: true })).toEqual([header]);
  });
});
