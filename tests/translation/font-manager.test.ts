// tests/translation/font-manager.test.ts
// Testes de Validação do Pipeline Tipográfico Multiscript Self-Hosted (Hotfix P0)

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FontManager, SCRIPT_SAMPLE_TEXT } from '@/translation/font-manager';
import { TranslationLayoutAuditor } from '@/translation/layout-qa.auditor';

describe('FontManager — Deterministic Multiscript Pipeline', () => {
  beforeEach(() => {
    FontManager.clearCache();
    vi.restoreAllMocks();
  });

  it('FONT-THAI-1: deve carregar a fonte self-hosted Noto Sans Thai para th-TH com sucesso', async () => {
    const res = await FontManager.ensureFontsLoadedForLocale('th-TH');

    expect(res.success).toBe(true);
    expect(res.script).toBe('Thai');
    expect(res.primaryFont).toBe('Noto Sans Thai');
    expect(res.source).toBe('bundled');
    expect(res.glyphCheck).toBe(true);
    expect(res.loadedFaces).toBeGreaterThanOrEqual(1);
  });

  it('FONT-RUSSIAN-1: deve carregar Noto Sans para script Cyrillic (ru-RU)', async () => {
    const res = await FontManager.ensureFontsLoadedForLocale('ru-RU');

    expect(res.success).toBe(true);
    expect(res.script).toBe('Cyrillic');
    expect(res.primaryFont).toBe('Noto Sans');
    expect(res.source).toBe('bundled');
    expect(res.glyphCheck).toBe(true);
  });

  it('FONT-CHINESE-1: deve carregar Noto Sans SC para script Han (zh-CN)', async () => {
    const res = await FontManager.ensureFontsLoadedForLocale('zh-CN');

    expect(res.success).toBe(true);
    expect(res.script).toBe('Han');
    expect(res.primaryFont).toBe('Noto Sans SC');
    expect(res.source).toBe('bundled');
    expect(res.glyphCheck).toBe(true);
  });

  it('FONT-ARABIC-1: deve carregar Noto Sans Arabic para script Arabic RTL (ar-SA)', async () => {
    const res = await FontManager.ensureFontsLoadedForLocale('ar-SA');

    expect(res.success).toBe(true);
    expect(res.script).toBe('Arabic');
    expect(res.primaryFont).toBe('Noto Sans Arabic');
    expect(res.source).toBe('bundled');
    expect(res.glyphCheck).toBe(true);
    expect(FontManager.getDirectionForLocale('ar-SA')).toBe('rtl');
  });

  it('FONT-SAMPLE-1: amostras de texto devem existir para todos os scripts metrológicos', () => {
    expect(SCRIPT_SAMPLE_TEXT.Thai).toBe('เครื่องสอบเทียบความดัน');
    expect(SCRIPT_SAMPLE_TEXT.Arabic).toBe('معاير الضغط');
    expect(SCRIPT_SAMPLE_TEXT.Han).toBe('压力校准仪');
    expect(SCRIPT_SAMPLE_TEXT.Cyrillic).toBe('Калибратор давления');
    expect(SCRIPT_SAMPLE_TEXT.Latin).toBe('Pressure Calibrator');
  });

  it('FONT-CACHE-1: clearCache deve invalidar cache e permitir recarregamento determinístico', async () => {
    const res1 = await FontManager.ensureFontsLoadedForLocale('th-TH');
    expect(res1.success).toBe(true);

    FontManager.clearCache('Thai');

    const res2 = await FontManager.ensureFontsLoadedForLocale('th-TH');
    expect(res2.success).toBe(true);
  });

  it('FONT-AUDITOR-1: TranslationLayoutAuditor deve aprovar quando o documento está em conformidade visual', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <div class="clean-export-page" style="height: 1123px; width: 794px;">
        <div data-printable-field="title">เครื่องสอบเทียบความดัน</div>
      </div>
    `;

    const qaResult = TranslationLayoutAuditor.auditLayout(container, 'th-TH');
    const missingFontIssues = qaResult.issues.filter((i) => i.type === 'MISSING_FONT');

    expect(missingFontIssues.length).toBe(0);
  });
});
