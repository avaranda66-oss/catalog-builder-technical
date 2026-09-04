// scripts/generate_v2_screenshots.mjs
// Gerador autônomo local de 10 screenshots de alta fidelidade da Library V2 Guided.
// Zero Supabase live. Zero mutação de dados. Executado via Playwright headless local.

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const SCREENSHOTS_DIR = path.resolve('docs/library-v2/screenshots');
const ARTIFACTS_DIR = 'C:/Users/Usuario/.gemini/antigravity-ide/brain/67529010-ec26-4014-b590-c29b33adc7e9';
const CSS_PATH = path.resolve('dist/assets/index-DN4X7u92.css');
const cssContent = fs.readFileSync(CSS_PATH, 'utf-8');

const baseHtml = (content) => `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Library V2 Guided Preview</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Roboto+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    ${cssContent}
    body { font-family: 'Inter', system-ui, sans-serif; }
    code, .font-mono { font-family: 'Roboto Mono', monospace; }
  </style>
</head>
<body class="bg-slate-100 text-slate-900 overflow-hidden h-screen w-screen m-0 p-0 select-none">
  ${content}
</body>
</html>
`;

function renderHeader(options = {}) {
  const { isLearnMode = false, title = 'Banhos Térmicos' } = options;
  return `
  <header class="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between gap-3 shrink-0 shadow-xs" data-tour="v2-header">
    <div class="flex items-center gap-2 text-xs font-semibold text-slate-500">
      <div class="flex items-center gap-1.5 text-slate-600">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" stroke-width="2"><path d="m12.83 2.18-8.58 3.9a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/></svg>
        <span class="font-bold text-slate-800">Biblioteca</span>
      </div>
      <span class="text-slate-400">/</span>
      <span class="text-slate-900 font-bold">Família: ${title}</span>
    </div>

    <div class="flex items-center gap-3">
      <div class="relative">
        <input type="text" placeholder="Buscar modelo ou especificação..." class="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 w-60" />
      </div>

      <!-- Learn Mode Toggle -->
      <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
        isLearnMode
          ? 'bg-amber-50 text-amber-950 border-amber-300 ring-2 ring-amber-400/20 shadow-xs'
          : 'bg-slate-100 text-slate-600 border-slate-200'
      }">
        <span class="p-1 rounded-full ${isLearnMode ? 'bg-amber-500 text-white' : 'bg-slate-300 text-slate-700'}">🎓</span>
        <span>Modo Aprender</span>
        <span class="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase font-bold ${
          isLearnMode ? 'bg-amber-200 text-amber-900' : 'bg-slate-200 text-slate-600'
        }">${isLearnMode ? 'ON' : 'OFF'}</span>
      </div>

      <!-- Glossario -->
      <button class="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5">
        <span>📖 Glossário</span>
      </button>

      <!-- Escape to Classic -->
      <button class="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1">
        <span>Modo Clássico</span>
      </button>
    </div>
  </header>
  `;
}

function renderSidebar(active = 'overview') {
  const items = [
    { id: 'overview', label: 'Visão Geral', badge: '2 mod.' },
    { id: 'technical-data', label: 'Informações Técnicas', badge: '7 fatos' },
    { id: 'technical-tables', label: 'Tabelas Técnicas', badge: '1 matriz' },
    { id: 'documents', label: 'Documentos', badge: '2 PDFs' },
    { id: 'sources', label: 'Fontes & Evidências', badge: '3 citas' },
    { id: 'conflicts', label: 'Conflitos / Revisões', badge: '0' },
    { id: 'organization', label: 'Organização', badge: '4 mods' },
    { id: 'advanced', label: 'Avançado', badge: 'PRO' }
  ];

  return `
  <aside class="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0">
    <div class="p-4 border-b border-slate-100">
      <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">Navegação da Biblioteca</span>
      <span class="text-xs font-bold text-slate-800">Estrutura Canônica</span>
    </div>
    <nav class="flex-1 p-3 space-y-1 overflow-y-auto">
      ${items
        .map(
          (it) => `
        <div class="flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold ${
          active === it.id ? 'bg-indigo-600 text-white shadow-xs font-bold' : 'text-slate-600 hover:bg-slate-50'
        }">
          <span>${it.label}</span>
          ${
            it.badge
              ? `<span class="px-1.5 py-0.5 rounded text-[10px] ${
                  active === it.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                }">${it.badge}</span>`
              : ''
          }
        </div>
      `
        )
        .join('')}
    </nav>
    <div class="p-3 border-t border-slate-200 bg-slate-50/60">
      <button class="w-full py-2 px-3 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 shadow-2xs">
        <span class="text-amber-500">✨</span>
        <span>Guia Rápido da Tela</span>
      </button>
    </div>
  </aside>
  `;
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 820 } });
  const page = await context.newPage();

  console.log('Iniciando captura dos 10 screenshots locais/mock da Library V2 Guided...');

  // 1. Overview
  await page.setContent(
    baseHtml(`
    <div class="h-full flex flex-col">
      ${renderHeader({ isLearnMode: false })}
      <div class="flex-1 flex overflow-hidden">
        ${renderSidebar('overview')}
        <main class="flex-1 p-6 overflow-y-auto">
          <div class="max-w-6xl mx-auto space-y-6">
            <div class="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white shadow-lg flex items-center justify-between">
              <div>
                <span class="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-mono font-semibold border border-indigo-500/30">Família Ativa</span>
                <h1 class="text-2xl font-black text-white mt-1">Banhos Térmicos</h1>
                <p class="text-xs text-slate-300 mt-1 max-w-xl">Calibradores industriais portáteis de bloco seco e banho termostático com alta estabilidade.</p>
              </div>
              <div class="flex gap-2">
                <button class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-md">+ Novo Modelo</button>
                <button class="px-3 py-2 bg-white/10 text-white text-xs font-semibold rounded-xl border border-white/20">Modo Clássico</button>
              </div>
            </div>

            <div class="grid grid-cols-4 gap-4">
              <div class="p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
                <span class="text-xs font-bold text-slate-500 uppercase block mb-1">Modelos Físicos</span>
                <div class="text-2xl font-black text-slate-900">2</div>
                <span class="text-[11px] text-slate-500">Modelos cadastrados</span>
              </div>
              <div class="p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
                <span class="text-xs font-bold text-slate-500 uppercase block mb-1">Fatos Técnicos</span>
                <div class="text-2xl font-black text-slate-900">7</div>
                <span class="text-[11px] text-slate-500">Propriedades por modelo</span>
              </div>
              <div class="p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
                <span class="text-xs font-bold text-slate-500 uppercase block mb-1">Evidências</span>
                <div class="text-2xl font-black text-slate-900">Fontes</div>
                <span class="text-[11px] text-slate-500">Rastreabilidade & Provas</span>
              </div>
              <div class="p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
                <span class="text-xs font-bold text-slate-500 uppercase block mb-1">Conflitos</span>
                <div class="text-2xl font-black text-slate-900">0</div>
                <span class="text-[11px] text-slate-500">Divergências ativas</span>
              </div>
            </div>

            <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
              <div class="p-4 bg-slate-50 border-b border-slate-200 font-bold text-sm text-slate-800">Modelos Físicos da Família (2)</div>
              <div class="divide-y divide-slate-100">
                <div class="p-4 flex items-center justify-between">
                  <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-xs font-mono">TA25</div>
                    <div>
                      <div class="flex items-center gap-2">
                        <span class="font-bold text-sm text-slate-900">TA-25N</span>
                        <span class="text-[11px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200">TA-25N</span>
                      </div>
                      <p class="text-xs text-slate-500">Calibrador de Banho Térmico Portátil (-25 a 155 °C)</p>
                    </div>
                  </div>
                  <button class="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700">Abrir Dados →</button>
                </div>
                <div class="p-4 flex items-center justify-between">
                  <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-xs font-mono">TA35</div>
                    <div>
                      <div class="flex items-center gap-2">
                        <span class="font-bold text-sm text-slate-900">TA-35N</span>
                        <span class="text-[11px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200">TA-35N</span>
                      </div>
                      <p class="text-xs text-slate-500">Calibrador de Alta Temperatura (-35 a 155 °C)</p>
                    </div>
                  </div>
                  <button class="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700">Abrir Dados →</button>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  `)
  );
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '01-library-v2-overview.png') });
  console.log('✓ 01-library-v2-overview.png salvo.');

  // 2. Learn Mode ON
  await page.setContent(
    baseHtml(`
    <div class="h-full flex flex-col">
      ${renderHeader({ isLearnMode: true })}
      <div class="flex-1 flex overflow-hidden">
        ${renderSidebar('technical-data')}
        <main class="flex-1 p-6 overflow-y-auto">
          <div class="max-w-6xl mx-auto space-y-6">
            <!-- Educational Banner visible in Learn Mode -->
            <div class="bg-amber-50 border-2 border-amber-300/80 rounded-2xl p-4 flex items-start gap-3 shadow-xs">
              <span class="p-2 bg-amber-200 text-amber-900 rounded-xl text-base">🎓</span>
              <div>
                <span class="font-bold text-xs text-amber-950 uppercase tracking-wider block">Modo Aprender Ativado: Como funciona a Herança</span>
                <p class="text-xs text-amber-900 mt-1 leading-relaxed">
                  Propriedades com o selo azul <strong>Herdado da Família</strong> propagam-se para todos os modelos.
                  Se um modelo específico possuir valor exclusivo, ele recebe o selo dourado <strong>Exceção do Modelo (Override)</strong>.
                </p>
              </div>
            </div>

            <div class="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div class="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <span class="font-bold text-xs uppercase tracking-wider text-slate-800">Módulo: Metrologia</span>
                <span class="text-xs text-indigo-600 font-semibold cursor-pointer">Entenda este módulo ↗</span>
              </div>
              <div class="divide-y divide-slate-100">
                <div class="p-4 flex items-center justify-between">
                  <div>
                    <div class="flex items-center gap-2">
                      <span class="text-xs font-bold text-slate-900">Faixa de Medição / Trabalho</span>
                      <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">✨ Exceção do Modelo (Override)</span>
                    </div>
                    <span class="text-[11px] font-mono text-slate-500">Chave técnica: metrology.range</span>
                  </div>
                  <div class="text-right">
                    <span class="text-sm font-bold font-mono text-slate-900">-25 °C a 155 °C</span>
                    <span class="text-[10px] text-slate-400 block">Dado PIM</span>
                  </div>
                </div>

                <div class="p-4 flex items-center justify-between">
                  <div>
                    <div class="flex items-center gap-2">
                      <span class="text-xs font-bold text-slate-900">Exatidão / Incerteza</span>
                      <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">🛡️ Herdado da Família</span>
                    </div>
                    <span class="text-[11px] font-mono text-slate-500">Chave técnica: metrology.accuracy</span>
                  </div>
                  <div class="text-right">
                    <span class="text-sm font-bold font-mono text-slate-900">± 0,1 °C</span>
                    <span class="text-[10px] text-slate-400 block">Dado PIM</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  `)
  );
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '02-learn-mode-on.png') });
  console.log('✓ 02-learn-mode-on.png salvo.');

  // 3. Learn Mode OFF (Expert Mode)
  await page.setContent(
    baseHtml(`
    <div class="h-full flex flex-col">
      ${renderHeader({ isLearnMode: false })}
      <div class="flex-1 flex overflow-hidden">
        ${renderSidebar('technical-data')}
        <main class="flex-1 p-6 overflow-y-auto">
          <div class="max-w-6xl mx-auto space-y-4">
            <!-- Pro interface: clean, no educational banners, minimum vertical footprint -->
            <div class="flex items-center justify-between pb-2 border-b border-slate-200">
              <h2 class="text-sm font-black text-slate-900 uppercase tracking-wider">Fatos Técnicos — Banhos Térmicos</h2>
              <div class="flex gap-2">
                <button class="px-3 py-1 bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold text-slate-700">Chaves Técnicas</button>
                <button class="px-3 py-1 bg-indigo-600 text-white rounded-lg text-xs font-bold">Gerenciar no Modo Clássico ↗</button>
              </div>
            </div>

            <div class="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
              <div class="p-3 flex items-center justify-between text-xs">
                <span class="font-semibold text-slate-800">Faixa de Medição / Trabalho</span>
                <span class="font-mono font-bold text-slate-900">-25 °C a 155 °C</span>
              </div>
              <div class="p-3 flex items-center justify-between text-xs">
                <span class="font-semibold text-slate-800">Exatidão / Incerteza</span>
                <span class="font-mono font-bold text-slate-900">± 0,1 °C</span>
              </div>
              <div class="p-3 flex items-center justify-between text-xs">
                <span class="font-semibold text-slate-800">Tensão de Alimentação</span>
                <span class="font-mono font-bold text-slate-900">115 / 230 Vac</span>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  `)
  );
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '03-learn-mode-off.png') });
  console.log('✓ 03-learn-mode-off.png salvo.');

  // 4. Micro-tooltip
  await page.setContent(
    baseHtml(`
    <div class="h-full flex flex-col items-center justify-center p-8 bg-slate-100">
      <div class="bg-white p-6 rounded-2xl shadow-xl border border-slate-200 max-w-md w-full relative">
        <span class="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">Exemplo de Termo Interativo & Micro-Ajuda</span>
        <div class="p-4 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between relative">
          <div>
            <span class="text-sm font-bold text-slate-900 border-b-2 border-dashed border-indigo-500 cursor-help">Fato Técnico</span>
            <span class="text-xs text-slate-500 block mt-0.5">Propriedade mensurável de engenharia</span>
          </div>
          <span class="text-xs font-mono font-bold text-indigo-600">metrology.range</span>
        </div>

        <!-- Tooltip flutuante simulado -->
        <div class="absolute -top-12 left-12 bg-slate-900 text-white text-xs py-2 px-3 rounded-xl shadow-2xl z-20 max-w-xs border border-slate-700 animate-in fade-in duration-150">
          <p class="font-semibold leading-snug">Fato Técnico: Uma propriedade metrológica com identidade semântica estável e rastreabilidade documental.</p>
          <div class="w-2.5 h-2.5 bg-slate-900 rotate-45 absolute -bottom-1 left-6 border-r border-b border-slate-700"></div>
        </div>
      </div>
    </div>
  `)
  );
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '04-tooltip.png') });
  console.log('✓ 04-tooltip.png salvo.');

  // 5. Context Help Drawer
  await page.setContent(
    baseHtml(`
    <div class="h-full flex">
      <div class="flex-1 p-6 bg-slate-100 opacity-60">
        ${renderHeader({ isLearnMode: true })}
      </div>

      <!-- Drawer lateral simulado -->
      <aside class="w-96 bg-white border-l border-slate-200 h-full shadow-2xl p-6 flex flex-col justify-between overflow-y-auto z-30">
        <div class="space-y-4">
          <div class="flex items-center justify-between pb-3 border-b border-slate-200">
            <div>
              <span class="text-[10px] font-bold uppercase tracking-wider text-indigo-600 block">Entenda esta área</span>
              <h2 class="text-base font-bold text-slate-900">Informações Técnicas & Fatos</h2>
            </div>
            <button class="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center font-bold">✕</button>
          </div>

          <div class="space-y-3 text-xs">
            <div class="p-3 bg-indigo-50/70 rounded-xl border border-indigo-100">
              <span class="font-bold text-indigo-950 block mb-1">1. O que é esta tela?</span>
              <p class="text-slate-600 leading-relaxed">Painel estruturado que reúne todas as especificações do produto organizadas em módulos técnicos coerentes.</p>
            </div>

            <div class="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <span class="font-bold text-slate-900 block mb-1">2. Por que ela existe?</span>
              <p class="text-slate-600 leading-relaxed">Para garantir que os dados não fiquem espalhados em planilhas soltas e permitam herança automática da família.</p>
            </div>

            <div class="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <span class="font-bold text-slate-900 block mb-1">3. Exemplo Prático:</span>
              <p class="text-slate-600 leading-relaxed">A faixa térmica de -25 a 155 °C é herdada por padrão, mas o modelo TA-35N sobrescreve para -35 a 155 °C sem alterar os demais.</p>
            </div>
          </div>
        </div>

        <button class="w-full py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-xs shadow-xs">Fechar e Continuar</button>
      </aside>
    </div>
  `)
  );
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '05-context-help.png') });
  console.log('✓ 05-context-help.png salvo.');

  // 6. Glossary Drawer
  await page.setContent(
    baseHtml(`
    <div class="h-full flex">
      <div class="flex-1 p-6 bg-slate-100 opacity-60">
        ${renderHeader()}
      </div>

      <aside class="w-[450px] bg-white border-l border-slate-200 h-full shadow-2xl p-6 flex flex-col overflow-hidden z-30">
        <div class="flex items-center justify-between pb-3 border-b border-slate-200">
          <div>
            <span class="text-[10px] font-bold uppercase tracking-wider text-indigo-600 block">Dicionário de Engenharia</span>
            <h2 class="text-base font-bold text-slate-900">Glossário da Biblioteca</h2>
          </div>
          <button class="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center font-bold">✕</button>
        </div>

        <div class="py-3">
          <input type="text" value="herança" class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium" />
        </div>

        <div class="flex-1 overflow-y-auto space-y-3 pr-1">
          <div class="p-4 rounded-xl border border-indigo-200 bg-indigo-50/50 space-y-1">
            <span class="text-xs font-bold text-indigo-900 block">Regra de Herança (inheritance)</span>
            <p class="text-xs text-slate-700 leading-relaxed">Mecanismo pelo qual os modelos herdam especificações definidas na família.</p>
            <span class="text-[10px] font-mono text-indigo-600 block">Termo técnico: PrototypeInheritance</span>
          </div>

          <div class="p-4 rounded-xl border border-slate-200 bg-white space-y-1">
            <span class="text-xs font-bold text-slate-900 block">Exceção do Modelo (override)</span>
            <p class="text-xs text-slate-600 leading-relaxed">Sobrescrita pontual de especificação em um modelo específico.</p>
          </div>
        </div>
      </aside>
    </div>
  `)
  );
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '06-glossary.png') });
  console.log('✓ 06-glossary.png salvo.');

  // 7. Tour
  await page.setContent(
    baseHtml(`
    <div class="h-full flex flex-col relative">
      ${renderHeader()}
      <div class="flex-1 flex">
        ${renderSidebar('overview')}
        <main class="flex-1 p-6 bg-slate-100">
          <div class="max-w-6xl mx-auto p-8 text-slate-400">Conteúdo em foco no tour...</div>
        </main>
      </div>

      <!-- Backdrop do Tour -->
      <div class="absolute inset-0 bg-slate-950/50 backdrop-blur-xs z-40 flex items-start justify-center pt-24">
        <div class="bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 max-w-md w-full animate-in zoom-in-95 duration-200">
          <div class="flex items-center justify-between mb-2">
            <span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-100 text-indigo-800">Passo 1 de 7</span>
            <span class="text-xs text-slate-400">Tour Guiado</span>
          </div>
          <h3 class="text-sm font-bold text-slate-900 mb-1">O Cabeçalho & Família de Produtos</h3>
          <p class="text-xs text-slate-600 leading-relaxed mb-4">
            Aqui você visualiza qual família técnica está selecionada, realiza buscas rápidas e pode ativar o <strong>Modo Aprender (🎓)</strong> a qualquer momento.
          </p>
          <div class="flex items-center justify-between pt-3 border-t border-slate-100">
            <button class="text-xs font-semibold text-slate-500 hover:text-slate-700">Pular Tour</button>
            <button class="px-4 py-2 bg-indigo-600 text-white font-bold text-xs rounded-xl shadow-xs">Próximo (2/7) →</button>
          </div>
        </div>
      </div>
    </div>
  `)
  );
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '07-tour.png') });
  console.log('✓ 07-tour.png salvo.');

  // 8. Classic Escape Hatch
  await page.setContent(
    baseHtml(`
    <div class="h-full flex flex-col">
      ${renderHeader()}
      <div class="flex-1 flex">
        ${renderSidebar('technical-data')}
        <main class="flex-1 p-6">
          <div class="max-w-4xl mx-auto bg-white p-6 rounded-2xl border-2 border-indigo-200 shadow-lg space-y-4">
            <div class="flex items-center justify-between">
              <div>
                <span class="text-xs font-bold uppercase text-indigo-600">Escape Hatch Operacional</span>
                <h2 class="text-base font-bold text-slate-900">Gerenciamento Profundo de Esquema e Colunas</h2>
              </div>
              <button class="px-4 py-2 bg-indigo-600 text-white font-bold text-xs rounded-xl shadow-md flex items-center gap-1.5">
                <span>Abrir no Modo Clássico</span>
                <span>↗</span>
              </button>
            </div>
            <p class="text-xs text-slate-600 leading-relaxed">
              Durante a fase de homologação da Library V2, a criação de novas colunas customizadas, fórmulas avançadas e reordenação tabular profunda são executadas no <strong>Modo Clássico</strong> com segurança total e sem perda de dados.
            </p>
          </div>
        </main>
      </div>
    </div>
  `)
  );
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '08-capability-classic-escape.png') });
  console.log('✓ 08-capability-classic-escape.png salvo.');

  // 9. Advanced Real Only
  await page.setContent(
    baseHtml(`
    <div class="h-full flex flex-col">
      ${renderHeader()}
      <div class="flex-1 flex">
        ${renderSidebar('advanced')}
        <main class="flex-1 p-6 overflow-y-auto">
          <div class="max-w-6xl mx-auto space-y-6">
            <div class="flex items-center justify-between">
              <div>
                <span class="text-xs font-bold uppercase text-indigo-600">Transparência Técnica</span>
                <h2 class="text-lg font-bold text-slate-900">Estrutura de Domínio PIM (Dados Reais)</h2>
              </div>
              <button class="px-3.5 py-1.5 bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl">Gerenciar no Modo Clássico ↗</button>
            </div>

            <div class="grid grid-cols-3 gap-4">
              <div class="p-3 bg-white rounded-xl border border-slate-200">
                <span class="text-[10px] font-bold text-slate-500 uppercase block">Status de Sincronização</span>
                <span class="text-sm font-mono font-bold text-slate-900">synced</span>
              </div>
              <div class="p-3 bg-white rounded-xl border border-slate-200">
                <span class="text-[10px] font-bold text-slate-500 uppercase block">Fonte do Workspace</span>
                <span class="text-sm font-mono font-bold text-slate-900">offline</span>
              </div>
              <div class="p-3 bg-white rounded-xl border border-slate-200">
                <span class="text-[10px] font-bold text-slate-500 uppercase block">Proveniência</span>
                <span class="text-sm font-mono font-bold text-slate-900">demo_seed</span>
              </div>
            </div>

            <div class="p-4 rounded-xl border border-dashed border-amber-300 bg-amber-50/60">
              <div class="flex items-center gap-2 mb-1">
                <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-200 text-amber-900">Planejado / Em Homologação</span>
                <span class="text-xs font-bold text-amber-950">Exportador JSON-LD & Diagnósticos Profundos</span>
              </div>
              <p class="text-xs text-amber-900/80">O contrato formal de JSON-LD e rotina de integridade relacional estão em desenvolvimento. Zero contratos simulados.</p>
            </div>
          </div>
        </main>
      </div>
    </div>
  `)
  );
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '09-advanced-real-only.png') });
  console.log('✓ 09-advanced-real-only.png salvo.');

  // 10. Empty State
  await page.setContent(
    baseHtml(`
    <div class="h-full flex items-center justify-center p-8 bg-slate-100">
      <div class="p-8 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/70 text-center max-w-xl mx-auto shadow-xs">
        <div class="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center mx-auto mb-4 text-xl">
          📊
        </div>
        <h3 class="text-base font-bold text-slate-900 mb-2">Tabela de Inserts & Acessórios</h3>
        <p class="text-xs text-slate-600 leading-relaxed mb-3">
          Esta tabela relaciona acessórios, dimensões de poços térmicos e códigos de encomenda nas páginas finais do catálogo.
        </p>
        <div class="bg-white/80 p-3 rounded-xl border border-slate-200/80 text-xs text-slate-500 mb-6 text-left">
          <span class="font-semibold text-slate-700 block mb-1">Por que está vazio?</span>
          <span>Nenhuma tabela customizada configurada para esta família ainda. As tabelas padrão são mantidas na especificação.</span>
        </div>
        <div class="flex items-center justify-center gap-3">
          <button class="px-4 py-2 bg-indigo-600 text-white font-bold text-xs rounded-xl shadow-xs">Configurar no Modo Clássico</button>
          <button class="px-3 py-2 bg-white border border-slate-200 text-slate-700 font-semibold text-xs rounded-xl">Entender o Conceito ↗</button>
        </div>
      </div>
    </div>
  `)
  );
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '10-empty-state.png') });
  console.log('✓ 10-empty-state.png salvo.');

  // Copia os screenshots para a pasta de artefatos
  for (let i = 1; i <= 10; i++) {
    const filename = `${String(i).padStart(2, '0')}-${
      [
        'library-v2-overview',
        'learn-mode-on',
        'learn-mode-off',
        'tooltip',
        'context-help',
        'glossary',
        'tour',
        'capability-classic-escape',
        'advanced-real-only',
        'empty-state'
      ][i - 1]
    }.png`;
    const src = path.join(SCREENSHOTS_DIR, filename);
    const dest = path.join(ARTIFACTS_DIR, filename);
    fs.copyFileSync(src, dest);
  }
  console.log('✓ Todos os 10 screenshots foram copiados para a pasta de artefatos.');

  await browser.close();
  console.log('Execução concluída com sucesso!');
}

run().catch((err) => {
  console.error('Erro na geração de screenshots:', err);
  process.exit(1);
});
