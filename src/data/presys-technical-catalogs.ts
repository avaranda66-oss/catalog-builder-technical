// src/data/presys-technical-catalogs.ts
// Gerador Canônico dos Catálogos Técnicos PRESYS TA-25N, TA-35N e TA-50N.
// Padrão Table-First High-Density Metrology Catalog (Inspirado em Additel 875/761A).
// Fatos técnicos 100% comprovados pelo folder presys-ta-folder.pdf. Zero contaminação.

import { Catalog, CatalogPage } from '../domain/catalog.schema';
import { buildTableBlockFromPreset } from '../domain/technical-table-presets';

export interface PresysModelSpecs {
  model: 'TA-25N' | 'TA-35N' | 'TA-50N';
  range: string;
  rangeShort: string;
  displayAccuracy: string;
  resolution: string;
  stability: string;
  axialUniformity: string;
  radialUniformity: string;
  heatingTime: string;
  coolingTime: string;
  electricPower: string;
  wellDimensions: string;
  weight: string;
  dimensions: string;
  caseCode: string;
  heroImage: string;
}

export const PRESYS_SPECS: Record<'TA-25N' | 'TA-35N' | 'TA-50N', PresysModelSpecs> = {
  'TA-25N': {
    model: 'TA-25N',
    range: '-25 °C to +155 °C',
    rangeShort: '-25 a 155 °C',
    displayAccuracy: '± 0.1 °C Full range',
    resolution: '0.01 °C',
    stability: '± 0.02 °C',
    axialUniformity: '± 0.05 °C Full range',
    radialUniformity: '± 0.01 °C Full range',
    heatingTime: '10 min (25 °C to 140 °C)',
    coolingTime: '11 min (25 °C to -25 °C)',
    electricPower: '200 W',
    wellDimensions: 'Ø 25.4 mm (1”) x 124 mm',
    weight: '10.5 kg',
    dimensions: '260 x 200 x 305 mm',
    caseCode: '06.01.1031-00',
    heroImage: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=1400&q=85'
  },
  'TA-35N': {
    model: 'TA-35N',
    range: '-35 °C to +155 °C',
    rangeShort: '-35 a 155 °C',
    displayAccuracy: '± 0.1 °C Full range',
    resolution: '0.01 °C',
    stability: '± 0.02 °C',
    axialUniformity: '± 0.06 °C Full range',
    radialUniformity: '± 0.01 °C Full range',
    heatingTime: '16 min (25 °C to 140 °C)',
    coolingTime: '16 min (25 °C to -35 °C)',
    electricPower: '300 W',
    wellDimensions: 'Ø 25.4 mm (1”) x 124 mm',
    weight: '10.5 kg',
    dimensions: '315 x 200 x 305 mm',
    caseCode: '06.01.1031-00',
    heroImage: 'https://images.unsplash.com/photo-1581092335397-9583fe92d232?auto=format&fit=crop&w=1400&q=85'
  },
  'TA-50N': {
    model: 'TA-50N',
    range: '-50 °C to +155 °C',
    rangeShort: '-50 a 155 °C',
    displayAccuracy: '± 0.1 °C Full range',
    resolution: '0.01 °C',
    stability: '± 0.02 °C',
    axialUniformity: '± 0.07 °C Full range',
    radialUniformity: '± 0.02 °C Full range',
    heatingTime: '11 min (25 °C to 140 °C)',
    coolingTime: '25 min (25 °C to -50 °C)',
    electricPower: '400 W',
    wellDimensions: 'Ø 25.4 mm (1”) x 124 mm',
    weight: '12.5 kg',
    dimensions: '315 x 200 x 305 mm',
    caseCode: '06.01.1032-00',
    heroImage: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=1400&q=85'
  }
};

/**
 * Constrói o catálogo técnico completo de 6 páginas para um modelo específico da série N.
 */
export function buildPresysTechnicalCatalog(modelKey: 'TA-25N' | 'TA-35N' | 'TA-50N'): Catalog {
  const specs = PRESYS_SPECS[modelKey];
  const catalogId = `cat-presys-${modelKey.toLowerCase().replace(/[^a-z0-9]/g, '-')}-datasheet`;

  const pages: CatalogPage[] = [
    // =========================================================================
    // PÁGINA 1 — CAPA TÉCNICA EXCLUSIVA (FULL PAGE COVER ONLY)
    // =========================================================================
    {
      id: `p1-${modelKey}-cover`,
      pageNumber: 1,
      pageType: 'cover',
      title: `Capa Técnica ${modelKey}`,
      blocks: [
        {
          id: `b1-${modelKey}-hero`,
          type: 'full_page_cover',
          title: modelKey,
          subtitle: `Calibrador Avançado de Temperatura Tipo Bloco Seco (${specs.rangeShort})`,
          badgeText: 'PRESYS INSTRUMENTOS · READY FOR INDUSTRY 4.0 & DCC · EURAMET/cg-13/V03',
          imageUrl: specs.heroImage,
          customData: {
            coverStyle: 'clean_gradient',
            overlayOpacity: 35,
            textAlign: 'left',
            showLogoBox: true,
            showAccentLine: true,
            brandName: 'PRESYS',
            brandSubtitle: 'METROLOGIA & INSTRUMENTAÇÃO INDUSTRIAL',
            overview: `Calibrador de temperatura tipo bloco seco de alta exatidão com padrão interno, calibrador multissinais elétrico incorporado para medição de DUT e controle térmico automatizado para calibração de sensores com emissão direta de relatórios.`,
            footerLeft: 'www.presys.com.br · vendas@presys.com.br',
            footerRight: 'PRESYS INSTRUMENTS · ISO/IEC 17025 ACCREDITED'
          }
        }
      ]
    },

    // =========================================================================
    // PÁGINA 2 — DESTAQUES METROLÓGICOS (QUICK SPECS)
    // =========================================================================
    {
      id: `p2-${modelKey}-quickspecs`,
      pageNumber: 2,
      pageType: 'technical',
      title: `Destaques Metrológicos ${modelKey}`,
      blocks: [
        buildTableBlockFromPreset(
          `b2-${modelKey}-quickspec`,
          'quick_spec',
          [
            { id: 'qs-1', localOverrides: { parameter: 'Faixa de Operação (Operating Range)', value: specs.range }, order: 0 },
            { id: 'qs-2', localOverrides: { parameter: 'Exatidão do Display (Display Accuracy)', value: specs.displayAccuracy }, order: 1 },
            { id: 'qs-3', localOverrides: { parameter: 'Estabilidade Térmica (Stability)', value: specs.stability }, order: 2 },
            { id: 'qs-4', localOverrides: { parameter: 'Potência Elétrica (Electric Power)', value: specs.electricPower }, order: 3 },
            { id: 'qs-5', localOverrides: { parameter: 'Peso do Instrumento (Weight)', value: specs.weight }, order: 4 },
            { id: 'qs-6', localOverrides: { parameter: 'Dimensões Físicas (HxWxD)', value: specs.dimensions }, order: 5 },
            { id: 'qs-7', localOverrides: { parameter: 'Dimensões do Poço (Well Diameter x Depth)', value: specs.wellDimensions }, order: 6 }
          ],
          {
            title: `DESTAQUES METROLÓGICOS — PRESYS ${modelKey}`,
            subtitle: 'Condições de referência: temperatura ambiente de 23 °C e poço padrão Ø 25.4 mm (1") x 124 mm.'
          }
        )
      ]
    },

    // =========================================================================
    // PÁGINA 3 — ESPECIFICAÇÕES DE MEDIÇÃO ELÉTRICA & ENTRADAS
    // =========================================================================
    {
      id: `p3-${modelKey}-inputs`,
      pageNumber: 3,
      pageType: 'technical',
      title: 'Especificações Elétricas e Entradas',
      blocks: [
        buildTableBlockFromPreset(
          `b3-${modelKey}-meas-spec`,
          'measurement_spec',
          [
            // Seção RTD
            { id: 'ms-s1', kind: 'section', localOverrides: { function: 'TERMORRESISTÊNCIAS (RTD) — IEC 60751, JIS, CALLENDAR-VAN DUSEN, ITS-90' }, order: 0 },
            {
              id: 'ms-r1',
              localOverrides: {
                function: 'Pt-100',
                range: 'A COMPLETAR',
                accuracy: '± 0.1 °C',
                config: '2, 3 e 4 fios',
                notes: 'Tabelas IEC 60751, JIS, Callendar-Van Dusen ou ITS-90 selecionáveis'
              },
              order: 1
            },
            {
              id: 'ms-r2',
              localOverrides: {
                function: 'Pt-1000',
                range: 'A COMPLETAR',
                accuracy: '± 0.1 °C',
                config: '2, 3 e 4 fios',
                notes: 'Tabelas IEC 60751, JIS, Callendar-Van Dusen ou ITS-90 selecionáveis'
              },
              order: 2
            },

            // Seção Termopares
            { id: 'ms-s2', kind: 'section', localOverrides: { function: 'TERMOPARES (TC) — ESCALAS ITS-90 E IPTS-68' }, order: 3 },
            {
              id: 'ms-r3',
              localOverrides: {
                function: 'J, K, T, N, L',
                range: 'A COMPLETAR',
                accuracy: '± 0.2 °C @ 660 °C',
                config: 'Junta fria interna ou externa',
                notes: 'Tipos normatizados; tabelas adicionais configuráveis sob demanda'
              },
              order: 4
            },
            {
              id: 'ms-r4',
              localOverrides: {
                function: 'E',
                range: 'A COMPLETAR',
                accuracy: '± 0.1 °C @ 660 °C',
                config: 'Junta fria interna ou externa',
                notes: 'Alta sensibilidade termométrica'
              },
              order: 5
            },
            {
              id: 'ms-r5',
              localOverrides: {
                function: 'R, S, C',
                range: 'A COMPLETAR',
                accuracy: '± 0.7 °C @ 660 °C',
                config: 'Junta fria interna ou externa',
                notes: 'Termopares nobres e de alta temperatura'
              },
              order: 6
            },
            {
              id: 'ms-r6',
              localOverrides: {
                function: 'Compensação de Junta Fria (CJC)',
                range: 'A COMPLETAR',
                accuracy: '± 0.2 °C',
                config: 'Interna ou Manual (0.00 °C)',
                notes: 'Compensação automática em tempo real'
              },
              order: 7
            },

            // Seção Sinais de Processo e Controle
            { id: 'ms-s3', kind: 'section', localOverrides: { function: 'SINAIS DE PROCESSO, TRANSMISSORES E TERMOSTATOS' }, order: 8 },
            {
              id: 'ms-r7',
              localOverrides: {
                function: 'Corrente de Entrada (mA Input)',
                range: '-1 to 24.5 mA',
                accuracy: '± 0.01% FS',
                config: 'Bornes frontais mA',
                notes: 'Para DUT equipado com transmissor 4-20 mA; exibe corrente e valor escalado'
              },
              order: 9
            },
            {
              id: 'ms-r8',
              localOverrides: {
                function: 'Alimentação de Transmissor (TPS)',
                range: '24 Vdc regulada',
                accuracy: 'A COMPLETAR',
                config: 'Loop a 2 fios integrado',
                notes: 'Alimentação de loop de corrente de transmissores sob teste'
              },
              order: 10
            },
            {
              id: 'ms-r9',
              localOverrides: {
                function: 'Teste Automático de Termostatos',
                range: 'A COMPLETAR',
                accuracy: 'A COMPLETAR',
                config: 'Bornes RTD2/SW',
                notes: 'Verificação automática de ponto de atuação (trip), reset e histerese (deadband)'
              },
              order: 11
            },
            {
              id: 'ms-r10',
              localOverrides: {
                function: 'Sensor de Referência Externo',
                range: 'A COMPLETAR',
                accuracy: 'A COMPLETAR',
                config: 'Conector EXT. REF.',
                notes: 'Controle de temperatura do bloco via sonda externa com correção CVD ou ITS-90'
              },
              order: 12
            }
          ],
          {
            title: 'ESPECIFICAÇÕES DE MEDIÇÃO ELÉTRICA E ENTRADAS (DUT & REF)',
            subtitle: 'Calibrador multissinais de processos integrado ao bloco seco.'
          }
        ),
        buildTableBlockFromPreset(
          `b4-${modelKey}-notes-meas`,
          'technical_notes',
          [
            { id: 'nt-m1', localOverrides: { symbol: '[1]', note: 'Todas as especificações elétricas são referenciadas à temperatura ambiente de 23 °C.' }, order: 0 },
            { id: 'nt-m2', localOverrides: { symbol: '[2]', note: 'Parâmetros metrológicos não comprovados no catálogo oficial foram definidos estritamente como A COMPLETAR para posterior inserção manual.' }, order: 1 }
          ],
          {
            title: 'NOTAS TÉCNICAS DE MEDIÇÃO'
          }
        )
      ]
    },

    // =========================================================================
    // PÁGINA 4 — AUTOMAÇÃO, TAREFAS E METROLOGIA 4.0
    // =========================================================================
    {
      id: `p4-${modelKey}-automation`,
      pageNumber: 4,
      pageType: 'technical',
      title: 'Automação, Conectividade e Metrologia 4.0',
      blocks: [
        buildTableBlockFromPreset(
          `b5-${modelKey}-auto-tasks`,
          'capability_matrix',
          [
            {
              id: 'at-1',
              localOverrides: {
                feature: 'Criação e Execução de Tarefas Automáticas (Tasks)',
                standard: '●',
                optional: '—',
                notes: 'Criação via touchscreen, conexão remota com PC ou descrição em formato XML'
              },
              order: 0
            },
            {
              id: 'at-2',
              localOverrides: {
                feature: 'Ciclos Térmicos Programáveis (Up, Down, Up/Down)',
                standard: '●',
                optional: '—',
                notes: 'Configuração de setpoints, patamares de estabilização e número de repetições'
              },
              order: 1
            },
            {
              id: 'at-3',
              localOverrides: {
                feature: 'Registro Metrológico As-Found e As-Left',
                standard: '●',
                optional: '—',
                notes: 'Cálculo automático de erro absoluto e percentual de fundo de escala (% FS)'
              },
              order: 2
            },
            {
              id: 'at-4',
              localOverrides: {
                feature: 'Criptografia de Dados Conforme 21 CFR Part 11',
                standard: '●',
                optional: '—',
                notes: 'Garante integridade e inviolabilidade dos arquivos de calibração XML gerados'
              },
              order: 3
            },
            {
              id: 'at-5',
              localOverrides: {
                feature: 'Assinatura Digital Eletrônica em Tela',
                standard: '●',
                optional: '—',
                notes: 'Coleta de assinatura diretamente na tela sensível ao toque para laudo técnico'
              },
              order: 4
            },
            {
              id: 'at-6',
              localOverrides: {
                feature: 'Gerenciador de Acesso com Perfis de Usuário',
                standard: '●',
                optional: '—',
                notes: 'Direitos diferenciados para Operador, Técnico e Administrador com proteção por senha'
              },
              order: 5
            },
            {
              id: 'at-7',
              localOverrides: {
                feature: 'Geração e Impressão Direta de Relatórios de Calibração',
                standard: '●',
                optional: '—',
                notes: 'Emissão de documento completo em impressora USB conectada, sem necessidade de PC'
              },
              order: 6
            },
            {
              id: 'at-8',
              localOverrides: {
                feature: 'Data Logger em Formato Gráfico e Tabular',
                standard: '●',
                optional: '—',
                notes: 'Gravação temporal de ensaios com exportação direta para pen drive USB'
              },
              order: 7
            },
            {
              id: 'at-9',
              localOverrides: {
                feature: 'Interface Multilíngue (6 Idiomas Nativos)',
                standard: '●',
                optional: '—',
                notes: 'Inglês, Espanhol, Francês, Português, Italiano e Russo'
              },
              order: 8
            }
          ],
          {
            title: 'RECURSOS DE AUTOMAÇÃO, TAREFAS E RASTREABILIDADE',
            subtitle: 'Rotinas automáticas de calibração com controle metrológico integrado.'
          }
        ),
        buildTableBlockFromPreset(
          `b6-${modelKey}-connectivity`,
          'connectivity_spec',
          [
            {
              id: 'cn-1',
              localOverrides: {
                interface: 'Porta USB Host / Device',
                availability: '●',
                function: 'Conexão de pen drive (recuperação de tarefas XML, PDF, CSV), mouse e impressora'
              },
              order: 0
            },
            {
              id: 'cn-2',
              localOverrides: {
                interface: 'Rede Ethernet TCP/IP (LAN)',
                availability: '●',
                function: 'Acesso a arquivos via Windows File Sharing (CIFS/SMB) e WebApi REST via HTTP'
              },
              order: 1
            },
            {
              id: 'cn-3',
              localOverrides: {
                interface: 'Servidor Web Integrado (Porta 5000)',
                availability: '●',
                function: 'Acesso e monitoramento remoto via navegador padrão (Chrome, Firefox, Safari, Edge)'
              },
              order: 2
            },
            {
              id: 'cn-4',
              localOverrides: {
                interface: 'Acesso Remoto via Software VNC (RFB)',
                availability: '●',
                function: 'Espelhamento da tela de toque e operação remota a partir de computadores e tablets'
              },
              order: 3
            },
            {
              id: 'cn-5',
              localOverrides: {
                interface: 'Protocolo SCPI via USB / Serial',
                availability: '●',
                function: 'Comandos de programação padronizados para bancadas e softwares proprietários'
              },
              order: 4
            },
            {
              id: 'cn-6',
              localOverrides: {
                interface: 'Integração com Software ISOPLAN',
                availability: '●',
                function: 'Sincronização automatizada de calibração e gerenciamento com banco de dados metrológico'
              },
              order: 5
            },
            {
              id: 'cn-7',
              localOverrides: {
                interface: 'Comunicação Digital HART',
                availability: '○',
                function: 'Comunicação digital com transmissores HART (opções CH - Calibrador / FH - Full Configurator)'
              },
              order: 6
            },
            {
              id: 'cn-8',
              localOverrides: {
                interface: 'Comunicação Digital PROFIBUS PA',
                availability: '○',
                function: 'Acesso via Bluetooth e software PACTware para calibração de instrumentos Profibus (opção PB)'
              },
              order: 7
            },
            {
              id: 'cn-9',
              localOverrides: {
                interface: 'Comunicação Wi-Fi',
                availability: '○',
                function: 'Conexão sem fio através de adaptador roteador USB/Ethernet com suporte a hotspot 3G/4G'
              },
              order: 8
            }
          ],
          {
            title: 'CONECTIVIDADE, COMUNICAÇÃO E INDÚSTRIA 4.0',
            subtitle: 'Arquitetura aberta de 3 camadas: Física, Serviços e Aplicação.'
          }
        )
      ]
    },

    // =========================================================================
    // PÁGINA 5 — ESPECIFICAÇÕES TÉCNICAS PRINCIPAIS DO BLOCO SECO (HERO TABLE)
    // =========================================================================
    {
      id: `p5-${modelKey}-specs`,
      pageNumber: 5,
      pageType: 'technical',
      title: `Especificações Técnicas ${modelKey}`,
      blocks: [
        buildTableBlockFromPreset(
          `b7-${modelKey}-hero-specs`,
          'technical_spec',
          [
            // Seção Desempenho Térmico
            { id: 'ts-s1', kind: 'section', localOverrides: { parameter: 'DESEMPENHO TÉRMICO (THERMAL PERFORMANCE)' }, order: 0 },
            {
              id: 'ts-r1',
              localOverrides: {
                parameter: 'Faixa de Operação (Operating Range)',
                value: specs.range,
                condition: 'Temperatura ambiente: 23 °C'
              },
              order: 1
            },
            {
              id: 'ts-r2',
              localOverrides: {
                parameter: 'Exatidão do Display (Display Accuracy)',
                value: specs.displayAccuracy,
                condition: 'Em toda a faixa operacional'
              },
              order: 2
            },
            {
              id: 'ts-r3',
              localOverrides: {
                parameter: 'Resolução (Resolution)',
                value: specs.resolution,
                condition: 'Selecionável em °C, °F ou K'
              },
              order: 3
            },
            {
              id: 'ts-r4',
              localOverrides: {
                parameter: 'Estabilidade Térmica (Stability)',
                value: specs.stability,
                condition: 'Após estabilização do bloco'
              },
              order: 4
            },
            {
              id: 'ts-r5',
              localOverrides: {
                parameter: 'Uniformidade Axial Dry Block (Axial Uniformity)',
                value: specs.axialUniformity,
                condition: 'Na zona útil de 40 mm'
              },
              order: 5
            },
            {
              id: 'ts-r6',
              localOverrides: {
                parameter: 'Uniformidade Radial Dry Block (Radial Uniformity)',
                value: specs.radialUniformity,
                condition: 'Entre furos do inserto de prova'
              },
              order: 6
            },

            // Seção Dinâmica Térmica
            { id: 'ts-s2', kind: 'section', localOverrides: { parameter: 'DINÂMICA TÉRMICA (DYNAMIC PERFORMANCE)' }, order: 7 },
            {
              id: 'ts-r7',
              localOverrides: {
                parameter: 'Tempo de Aquecimento (Heating Time)',
                value: specs.heatingTime,
                condition: 'Bloco metálico com inserto'
              },
              order: 8
            },
            {
              id: 'ts-r8',
              localOverrides: {
                parameter: 'Tempo de Resfriamento (Cooling Time)',
                value: specs.coolingTime,
                condition: 'Bloco metálico com inserto'
              },
              order: 9
            },
            {
              id: 'ts-r9',
              localOverrides: {
                parameter: 'Ajuste de Rampa Térmica (Temperature Ramp)',
                value: 'Configurável pelo usuário',
                condition: 'Definição de taxa de subida/descida'
              },
              order: 10
            },

            // Seção Características Físicas e Elétricas
            { id: 'ts-s3', kind: 'section', localOverrides: { parameter: 'CARACTERÍSTICAS FÍSICAS, ELÉTRICAS E MECÂNICAS' }, order: 11 },
            {
              id: 'ts-r10',
              localOverrides: {
                parameter: 'Potência Elétrica Consumida (Electric Power)',
                value: specs.electricPower,
                condition: 'Alimentação 115 ou 230 Vac, 50/60 Hz'
              },
              order: 12
            },
            {
              id: 'ts-r11',
              localOverrides: {
                parameter: 'Dimensões do Poço (Well Diameter x Depth)',
                value: specs.wellDimensions,
                condition: 'Poço usinado de alta condutividade'
              },
              order: 13
            },
            {
              id: 'ts-r12',
              localOverrides: {
                parameter: 'Peso do Instrumento (Weight)',
                value: specs.weight,
                condition: 'Sem embalagem e acessórios'
              },
              order: 14
            },
            {
              id: 'ts-r13',
              localOverrides: {
                parameter: 'Dimensões Externas (HxWxD)',
                value: specs.dimensions,
                condition: 'Gabinete industrial com alça de transporte'
              },
              order: 15
            },
            {
              id: 'ts-r14',
              localOverrides: {
                parameter: 'Tela de Operação (Display)',
                value: '5.7" Touch Screen Color Display',
                condition: 'Processador Dual Core 1 GHz, 16 GB Flash'
              },
              order: 16
            },

            // Seção Normas e Parâmetros a Completar
            { id: 'ts-s4', kind: 'section', localOverrides: { parameter: 'CONFORMIDADE NORMATIVA E DADOS A COMPLETAR' }, order: 17 },
            {
              id: 'ts-r15',
              localOverrides: {
                parameter: 'Conformidade Metrológica Internacional',
                value: 'EURAMET/cg-13/V03, EA Guidelines',
                condition: 'Diretrizes europeias para blocos secos'
              },
              order: 18
            },
            {
              id: 'ts-r16',
              localOverrides: {
                parameter: 'Grau de Proteção do Invólucro (IP Rating)',
                value: 'A COMPLETAR',
                condition: 'Classificação oficial a preencher'
              },
              order: 19
            },
            {
              id: 'ts-r17',
              localOverrides: {
                parameter: 'Condições Ambientais de Operação Garantidas',
                value: 'A COMPLETAR',
                condition: 'Limites de temperatura e umidade'
              },
              order: 20
            },
            {
              id: 'ts-r18',
              localOverrides: {
                parameter: 'Condições de Armazenamento e Transporte',
                value: 'A COMPLETAR',
                condition: 'Limites de temperatura para transporte'
              },
              order: 21
            },
            {
              id: 'ts-r19',
              localOverrides: {
                parameter: 'Garantia de Fábrica',
                value: 'A COMPLETAR',
                condition: 'Prazo de garantia contratual'
              },
              order: 22
            }
          ],
          {
            title: `PRESYS ${modelKey} — ESPECIFICAÇÕES TÉCNICAS E METROLÓGICAS`,
            subtitle: 'Dados oficiais extraídos do folder técnico PRESYS. Valores metrológicos garantidos em 23 °C.'
          }
        ),
        buildTableBlockFromPreset(
          `b8-${modelKey}-notes-specs`,
          'technical_notes',
          [
            { id: 'nt-s1', localOverrides: { symbol: '[*]', note: 'Todas as especificações técnicas correspondem aos limites nominais de ensaio descritos no catálogo oficial PRESYS.' }, order: 0 },
            { id: 'nt-s2', localOverrides: { symbol: '[**]', note: 'Campos com estado A COMPLETAR são preservados como linhas editáveis na tabela para posterior preenchimento pela fábrica.' }, order: 1 }
          ],
          {
            title: 'NOTAS NORMATIVAS E DE REFERÊNCIA'
          }
        )
      ]
    },

    // =========================================================================
    // PÁGINA 6 — MATRIZ DE INSERTOS (SÉRIE N)
    // =========================================================================
    {
      id: `p6-${modelKey}-inserts`,
      pageNumber: 6,
      pageType: 'technical',
      title: 'Matriz de Insertos Mecânicos',
      blocks: [
        buildTableBlockFromPreset(
          `b9-${modelKey}-inserts-table`,
          'insert_matrix',
          [
            {
              id: 'ins-1',
              localOverrides: {
                insert: 'IN1P',
                geometry: '1 x 3mm, 1 x 6mm, 1 x 1/4", 1 x 8mm',
                code: '06.04.0121-00',
                notes: 'Multifuros misto métrico/imperial para ensaio simultâneo'
              },
              order: 0
            },
            {
              id: 'ins-2',
              localOverrides: {
                insert: 'IN1A',
                geometry: '1 x 1/8", 1 x 3/16", 2 x 1/4", 1 x 3/8"',
                code: '06.04.0122-00',
                notes: 'Multifuros imperial para sensores de processo'
              },
              order: 1
            },
            {
              id: 'ins-3',
              localOverrides: {
                insert: 'IN1E',
                geometry: '1 x 4mm, 1 x 6mm, 1 x 1/4", 1 x 8mm, 1 x 10mm',
                code: '06.04.0123-00',
                notes: 'Alta capacidade para calibração de até 5 sensores'
              },
              order: 2
            },
            {
              id: 'ins-4',
              localOverrides: {
                insert: 'IN01',
                geometry: '1 x 3/4"',
                code: '06.04.0011-00',
                notes: 'Orifício único para termômetros industriais de haste larga'
              },
              order: 3
            },
            {
              id: 'ins-5',
              localOverrides: {
                insert: 'IN02',
                geometry: '1 x 1/2"',
                code: '06.04.0012-00',
                notes: 'Orifício único para bainhas e sondas de média espessura'
              },
              order: 4
            },
            {
              id: 'ins-6',
              localOverrides: {
                insert: 'IN03',
                geometry: '1 x 6.0mm and 3 x 1/4"',
                code: '06.04.0013-00',
                notes: '4 orifícios para comparação de sensores com sonda padrão'
              },
              order: 5
            },
            {
              id: 'ins-7',
              localOverrides: {
                insert: 'IN04',
                geometry: '3 x 6.0mm and 1 x 1/4"',
                code: '06.04.0014-00',
                notes: '4 orifícios para sensores de 6 mm com canal de referência'
              },
              order: 6
            },
            {
              id: 'ins-8',
              localOverrides: {
                insert: 'IN05',
                geometry: '4 x 6.0mm',
                code: '06.04.0015-00',
                notes: '4 orifícios métricos de 6.0 mm'
              },
              order: 7
            },
            {
              id: 'ins-9',
              localOverrides: {
                insert: 'IN06',
                geometry: '2 x 6.0mm and 2 x 1/4"',
                code: '06.04.0016-00',
                notes: '4 orifícios balanceados métrico / imperial'
              },
              order: 8
            },
            {
              id: 'ins-10',
              localOverrides: {
                insert: 'IN07',
                geometry: '1 x 6.0mm, 1 x 8.0mm and 1 x 3/8"',
                code: '06.04.0017-00',
                notes: '3 orifícios para diâmetros escalonados'
              },
              order: 9
            },
            {
              id: 'ins-11',
              localOverrides: {
                insert: 'IN08',
                geometry: '1 x 6.0mm, 1 x 3.0mm and 2 x 1/4"',
                code: '06.04.0018-00',
                notes: '4 orifícios incluindo haste fina de 3.0 mm'
              },
              order: 10
            },
            {
              id: 'ins-12',
              localOverrides: {
                insert: 'IN09',
                geometry: 'Without hole, to be drilled by the client',
                code: '06.04.0019-00',
                notes: 'Bloco cego maciço para furação especial pelo cliente'
              },
              order: 11
            },
            {
              id: 'ins-13',
              localOverrides: {
                insert: 'IN10',
                geometry: 'Others, under ordering (Customized)',
                code: '06.04.0020-00',
                notes: 'Inserto usinado sob demanda (separação mínima de 3 mm entre furos)'
              },
              order: 12
            },
            {
              id: 'ins-14',
              localOverrides: {
                insert: 'INCL',
                geometry: 'Cup-like insert (for use with tiny steel balls)',
                code: '06.04.0086-00',
                notes: 'Inserto copo (3/4") preenchido com microesferas de aço para sensores com formato irregular'
              },
              order: 13
            }
          ],
          {
            title: `MATRIZ DE INSERTOS METROLÓGICOS — SÉRIE N (${modelKey})`,
            subtitle: 'Códigos de pedido oficiais para o poço padrão de Ø 25.4 mm (1") x 124 mm. Um inserto incluso de série.'
          }
        ),
        buildTableBlockFromPreset(
          `b10-${modelKey}-notes-inserts`,
          'technical_notes',
          [
            { id: 'nt-i1', localOverrides: { symbol: '[*]', note: 'O uso de insertos impróprios ou materiais não homologados pode causar danos ao bloco térmico e perda de exatidão.' }, order: 0 },
            { id: 'nt-i2', localOverrides: { symbol: '[**]', note: 'A PRESYS fabrica insertos especiais sob medida (IN10) com distância mínima obrigatória de 3 mm entre furações.' }, order: 1 }
          ],
          {
            title: 'OBSERVAÇÕES TÉCNICAS SOBRE INSERTOS'
          }
        )
      ]
    },

    // =========================================================================
    // PÁGINA 7 — FORNECIMENTO PADRÃO E ACESSÓRIOS
    // =========================================================================
    {
      id: `p7-${modelKey}-delivery`,
      pageNumber: 7,
      pageType: 'technical',
      title: 'Fornecimento Padrão e Acessórios',
      blocks: [
        buildTableBlockFromPreset(
          `b11-${modelKey}-std-delivery`,
          'standard_delivery',
          [
            {
              id: 'sd-1',
              localOverrides: {
                item: `Soft Carrying Case (Maleta de transporte macia para ${modelKey})`,
                qty: '01 un.',
                included: '■',
                notes: `Item incluso de fábrica (Código de reposição: ${specs.caseCode})`
              },
              order: 0
            },
            {
              id: 'sd-2',
              localOverrides: {
                item: 'Insert Extractor (Extrator de insertos)',
                qty: '01 un.',
                included: '■',
                notes: 'Ferramenta para extração segura de blocos aquecidos (Código: 02.06.0085-00)'
              },
              order: 1
            },
            {
              id: 'sd-3',
              localOverrides: {
                item: 'Insert Chosen (Inserto de prova escolhido pelo cliente)',
                qty: '01 un.',
                included: '■',
                notes: 'Escolha de um modelo dentre a lista de insertos da Série N (INxx)'
              },
              order: 2
            },
            {
              id: 'sd-4',
              localOverrides: {
                item: 'Cup-like Insert (Inserto tipo copo Ø 3/4")',
                qty: '01 un.',
                included: '■',
                notes: 'Inserto especial para uso com microesferas de aço (Código: 06.04.0086-00)'
              },
              order: 3
            },
            {
              id: 'sd-5',
              localOverrides: {
                item: 'Tiny Steel Balls Flask (Frasco de microesferas de aço)',
                qty: '01 un.',
                included: '■',
                notes: 'Recipiente com esferas para preenchimento de folgas térmicas (Código: 03.03.0144-00)'
              },
              order: 4
            },
            {
              id: 'sd-6',
              localOverrides: {
                item: 'Power Cable (Cabo de alimentação elétrico)',
                qty: '01 un.',
                included: '■',
                notes: 'Type B - US (01.14.0100-10) ou Type F - Europe/Brasil (01.14.0089-10)'
              },
              order: 5
            },
            {
              id: 'sd-7',
              localOverrides: {
                item: 'Lead Cable Kit (Kit de cabos e pontas de teste)',
                qty: '01 un.',
                included: '■',
                notes: 'Cabos flexíveis para conexão das entradas de sinais elétricos (Código: 06.07.0025-00)'
              },
              order: 6
            },
            {
              id: 'sd-8',
              localOverrides: {
                item: 'Technical Manual (Manual técnico de operação)',
                qty: '01 un.',
                included: '■',
                notes: 'A COMPLETAR'
              },
              order: 7
            },
            {
              id: 'sd-9',
              localOverrides: {
                item: 'Traceable Calibration Certificate (Certificado de calibração)',
                qty: '01 un.',
                included: '■',
                notes: 'Certificado rastreável emitido pela fábrica (A COMPLETAR)'
              },
              order: 8
            }
          ],
          {
            title: `FORNECIMENTO PADRÃO (STANDARD DELIVERY) — PRESYS ${modelKey}`,
            subtitle: 'Todos os calibradores tipo bloco seco são fornecidos completos com os seguintes itens:'
          }
        ),
        buildTableBlockFromPreset(
          `b12-${modelKey}-accessories`,
          'accessories',
          [
            {
              id: 'acc-1',
              localOverrides: {
                code: specs.caseCode,
                description: `Soft Carrying Case (Maleta macia de transporte para ${modelKey})`,
                applicability: `${modelKey}`
              },
              order: 0
            },
            {
              id: 'acc-2',
              localOverrides: {
                code: '02.06.0085-00',
                description: 'Insert Extractor (outros modelos)',
                applicability: 'TA-25N, TA-35N, TA-50N'
              },
              order: 1
            },
            {
              id: 'acc-3',
              localOverrides: {
                code: '03.03.0144-00',
                description: 'Tiny Steel Balls Flask (Frasco com microesferas de aço metálico)',
                applicability: 'Todos os modelos com inserto cup-like'
              },
              order: 2
            },
            {
              id: 'acc-4',
              localOverrides: {
                code: '06.07.0025-00',
                description: 'Lead Cable Kit (Kit de cabos com terminais e pinos banana)',
                applicability: 'Todos os modelos da série TA'
              },
              order: 3
            },
            {
              id: 'acc-5',
              localOverrides: {
                code: '01.14.0100-10',
                description: 'Power Cable Type B – US (Plugue padrão americano)',
                applicability: 'Alimentação 115 Vac'
              },
              order: 4
            },
            {
              id: 'acc-6',
              localOverrides: {
                code: '01.14.0089-10',
                description: 'Power Cable Type F – Europe Universal (Plugue padrão europeu/NBR)',
                applicability: 'Alimentação 230 Vac'
              },
              order: 5
            },
            {
              id: 'acc-7',
              localOverrides: {
                code: 'A COMPLETAR',
                description: 'Certificado de Calibração Acreditado ISO/IEC 17025 e Caracterização EURAMET',
                applicability: 'Opcional emitido pelo laboratório acreditado PRESYS'
              },
              order: 6
            }
          ],
          {
            title: 'CÓDIGOS DE ACESSÓRIOS E PEÇAS DE REPOSIÇÃO'
          }
        )
      ]
    },

    // =========================================================================
    // PÁGINA 8 — ESTRUTURA DE CODIFICAÇÃO DE PEDIDO
    // =========================================================================
    {
      id: `p8-${modelKey}-ordering`,
      pageNumber: 8,
      pageType: 'technical',
      title: 'Código de Pedido',
      blocks: [
        buildTableBlockFromPreset(
          `b13-${modelKey}-ordering-info`,
          'ordering_information',
          [
            {
              id: 'ord-1',
              localOverrides: {
                field: 'Alimentação Elétrica (Power Supply)',
                code: '1',
                meaning: '115 Vac, 50/60 Hz',
                status: '●'
              },
              order: 0
            },
            {
              id: 'ord-2',
              localOverrides: {
                field: 'Alimentação Elétrica (Power Supply)',
                code: '2',
                meaning: '230 Vac, 50/60 Hz',
                status: '●'
              },
              order: 1
            },
            {
              id: 'ord-3',
              localOverrides: {
                field: 'Inserto Incluso (Included Insert)',
                code: 'INxx',
                meaning: 'Escolha de um inserto da Série N (ex.: IN01 a IN10, IN1P, IN1A, IN1E, INCL)',
                status: '●'
              },
              order: 2
            },
            {
              id: 'ord-4',
              localOverrides: {
                field: 'Comunicação HART',
                code: 'NH',
                meaning: 'Sem comunicação HART (No HART Communication)',
                status: '●'
              },
              order: 3
            },
            {
              id: 'ord-5',
              localOverrides: {
                field: 'Comunicação HART',
                code: 'CH',
                meaning: 'Calibrador HART (comandos básicos: zero, span, trim mA)',
                status: '○'
              },
              order: 4
            },
            {
              id: 'ord-6',
              localOverrides: {
                field: 'Comunicação HART',
                code: 'FH',
                meaning: 'Configurador Full-HART com biblioteca DD da FieldComm Group',
                status: '○'
              },
              order: 5
            },
            {
              id: 'ord-7',
              localOverrides: {
                field: 'Comunicação PROFIBUS',
                code: 'NP',
                meaning: 'Sem comunicação PROFIBUS (No Profibus Communication)',
                status: '●'
              },
              order: 6
            },
            {
              id: 'ord-8',
              localOverrides: {
                field: 'Comunicação PROFIBUS',
                code: 'PB',
                meaning: 'Comunicação PROFIBUS PA via Bluetooth com suporte a software PACTware',
                status: '○'
              },
              order: 7
            }
          ],
          {
            title: `ESTRUTURA DE CODIFICAÇÃO DE PEDIDO — ${modelKey}`,
            subtitle: `Sintaxe: ${modelKey} - [ALIMENTAÇÃO] - IN [INSERTO] - [HART] - [PROFIBUS]`
          }
        )
      ]
    }
  ];

  return {
    id: catalogId,
    title: `PRESYS ${modelKey} — Datasheet Técnico`,
    subtitle: `Calibrador Avançado de Temperatura Tipo Bloco Seco (${specs.rangeShort})`,
    themeId: 'default-technical',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: 1,
    pages
  };
}
