// src/components/icons/corporate-icon.registry.ts
// Registro Canônico Central de Ícones Corporativos — PRESYS Catalog Studio (Fase 3A.3)
// Governança estrita: persistência por ID semântico imutável, imports nomeados (zero wildcard),
// busca normalizada (Unicode/acentos) e isolamento total entre decoração visual e claims regulatórios.

import type { LucideIcon } from 'lucide-react';
import {
  // Connectivity (8)
  Network,
  EthernetPort,
  Wifi,
  Radio,
  Bluetooth,
  Usb,
  Cable,
  Plug2,
  // Metrology (10)
  Gauge,
  Thermometer,
  Flame,
  Activity,
  Waves,
  Target,
  Scale,
  Ruler,
  Zap,
  Sliders,
  // Software & Data (9)
  Monitor,
  Database,
  Server,
  Cloud,
  Cpu,
  Binary,
  Settings,
  FileSpreadsheet,
  BarChart3,
  // Industrial (9)
  Factory,
  Cog,
  Wrench,
  CircuitBoard,
  Power,
  Box,
  Package,
  Layers,
  Workflow,
  // Safety & Quality (6)
  Shield,
  ShieldCheck,
  Lock,
  CheckCircle2,
  AlertTriangle,
  BadgeCheck,
  // Documentation (4)
  FileText,
  BookOpen,
  ClipboardList,
  Table2
} from 'lucide-react';

export type CorporateIconCategory =
  | 'connectivity'
  | 'metrology'
  | 'software_data'
  | 'industrial'
  | 'safety_quality'
  | 'documentation';

export interface CorporateIconCategoryMeta {
  id: CorporateIconCategory;
  label: string;
}

export const CORPORATE_ICON_CATEGORIES: CorporateIconCategoryMeta[] = [
  { id: 'connectivity', label: 'Conectividade' },
  { id: 'metrology', label: 'Metrologia' },
  { id: 'software_data', label: 'Software & Dados' },
  { id: 'industrial', label: 'Industrial' },
  { id: 'safety_quality', label: 'Segurança & Qualidade' },
  { id: 'documentation', label: 'Documentação' }
];

export interface CorporateIconDefinition {
  id: string; // ID semântico canônico persistido (ex: 'network', 'thermometer')
  label: string; // Label descritivo para UI do editor
  category: CorporateIconCategory;
  aliases: string[]; // Termos de busca em pt-BR e en (sem claims regulatórios específicos)
  component: LucideIcon;
}

export const CORPORATE_ICON_DEFINITIONS: CorporateIconDefinition[] = [
  // ==========================================================================
  // 1. CONNECTIVITY (8 ícones)
  // ==========================================================================
  {
    id: 'network',
    label: 'Rede Corporativa',
    category: 'connectivity',
    aliases: ['rede', 'ethernet', 'lan', 'tcp/ip', 'comunicacao', 'network'],
    component: Network
  },
  {
    id: 'ethernet',
    label: 'Porta Ethernet',
    category: 'connectivity',
    aliases: ['rj45', 'ethernet', 'lan', 'cabo de rede', 'porta', 'conexao'],
    component: EthernetPort
  },
  {
    id: 'wifi',
    label: 'Wi-Fi / Sem Fio',
    category: 'connectivity',
    aliases: ['sem fio', 'wireless', 'wlan', 'sinal', 'radio', 'wifi'],
    component: Wifi
  },
  {
    id: 'radio',
    label: 'Rádio Frequência',
    category: 'connectivity',
    aliases: ['rf', 'wireless', 'antena', 'transmissao', 'telemetria', 'radio'],
    component: Radio
  },
  {
    id: 'bluetooth',
    label: 'Bluetooth',
    category: 'connectivity',
    aliases: ['ble', 'pareamento', 'sem fio', 'conexao curta', 'bluetooth'],
    component: Bluetooth
  },
  {
    id: 'usb',
    label: 'Conexão USB',
    category: 'connectivity',
    aliases: ['pendrive', 'usb-c', 'dados', 'cabo', 'serial', 'interface', 'usb'],
    component: Usb
  },
  {
    id: 'cable',
    label: 'Cabo Industrial',
    category: 'connectivity',
    aliases: ['fiacao', 'cabeamento', 'ligacao', 'chicote', 'linha', 'cable'],
    component: Cable
  },
  {
    id: 'plug',
    label: 'Conector / Plug',
    category: 'connectivity',
    aliases: ['tomada', 'alimentacao', 'borne', 'pino', 'terminal', 'plug'],
    component: Plug2
  },

  // ==========================================================================
  // 2. METROLOGY (10 ícones)
  // ==========================================================================
  {
    id: 'gauge',
    label: 'Manômetro / Pressão',
    category: 'metrology',
    aliases: ['pressao', 'bar', 'psi', 'medidor', 'manometro', 'vacuometro', 'gauge'],
    component: Gauge
  },
  {
    id: 'thermometer',
    label: 'Termômetro / Temperatura',
    category: 'metrology',
    aliases: ['temperatura', 'pt100', 'termopar', 'calor', 'grau', 'celsius', 'thermometer'],
    component: Thermometer
  },
  {
    id: 'flame',
    label: 'Calibração Térmica',
    category: 'metrology',
    aliases: ['banho seco', 'forno', 'aquecimento', 'alta temperatura', 'bloco termico', 'flame'],
    component: Flame
  },
  {
    id: 'activity',
    label: 'Sinal / Frequência',
    category: 'metrology',
    aliases: ['frequencia', 'pulso', 'oscilacao', 'forma de onda', 'onda', 'activity'],
    component: Activity
  },
  {
    id: 'waves',
    label: 'Ultrassom / Onda',
    category: 'metrology',
    aliases: ['nivel ultrassonico', 'vazao', 'onda', 'fluido', 'propagacao', 'waves'],
    component: Waves
  },
  {
    id: 'target',
    label: 'Exatidão / Mira',
    category: 'metrology',
    aliases: ['precisao', 'exatidao', 'classe', 'incerteza', 'ponto de ajuste', 'target'],
    component: Target
  },
  {
    id: 'scale',
    label: 'Balança / Peso',
    category: 'metrology',
    aliases: ['massa', 'peso', 'gravimetria', 'balanca', 'forca', 'scale'],
    component: Scale
  },
  {
    id: 'ruler',
    label: 'Dimensões / Curso',
    category: 'metrology',
    aliases: ['comprimento', 'deslocamento', 'curso', 'dimensao', 'distancia', 'ruler'],
    component: Ruler
  },
  {
    id: 'zap',
    label: 'Tensão / Loop Elétrico',
    category: 'metrology',
    aliases: ['loop 24v', '4-20ma', 'voltagem', 'corrente', 'eletrica', 'potencia', 'zap'],
    component: Zap
  },
  {
    id: 'sliders',
    label: 'Ajuste / Calibração',
    category: 'metrology',
    aliases: ['calibracao', 'span', 'zero', 'configuracao', 'trim', 'parametrizacao', 'sliders'],
    component: Sliders
  },

  // ==========================================================================
  // 3. SOFTWARE & DATA (9 ícones)
  // ==========================================================================
  {
    id: 'monitor',
    label: 'Painel / Display',
    category: 'software_data',
    aliases: ['display', 'ihm', 'tela', 'monitor', 'estacao', 'touch', 'interface'],
    component: Monitor
  },
  {
    id: 'database',
    label: 'Banco de Dados / Datalogger',
    category: 'software_data',
    aliases: ['memoria', 'registro', 'historico', 'datalogger', 'armazenamento', 'database'],
    component: Database
  },
  {
    id: 'server',
    label: 'Servidor Dedicado',
    category: 'software_data',
    aliases: ['host', 'concentrador', 'gateway', 'rede local', 'servidor', 'server'],
    component: Server
  },
  {
    id: 'cloud',
    label: 'Nuvem / Telemetria',
    category: 'software_data',
    aliases: ['nuvem', 'iot', 'sincronizacao', 'remoto', 'web', 'cloud'],
    component: Cloud
  },
  {
    id: 'cpu',
    label: 'Processador / DSP',
    category: 'software_data',
    aliases: ['microcontrolador', 'processamento', 'placa', 'core', 'chip', 'cpu'],
    component: Cpu
  },
  {
    id: 'binary',
    label: 'Comunicação Digital',
    category: 'software_data',
    aliases: ['protocolo', 'modbus', 'hart', 'profibus', 'bits', 'dados binarios', 'binary'],
    component: Binary
  },
  {
    id: 'settings',
    label: 'Parâmetros / Configuração',
    category: 'software_data',
    aliases: ['setup', 'ajuste', 'ferramenta', 'preferencias', 'opcoes', 'settings'],
    component: Settings
  },
  {
    id: 'file-data',
    label: 'Relatório / CSV',
    category: 'software_data',
    aliases: ['planilha', 'exportacao', 'dados', 'tabela', 'relatorio', 'csv', 'file-data'],
    component: FileSpreadsheet
  },
  {
    id: 'chart',
    label: 'Gráficos / Tendência',
    category: 'software_data',
    aliases: ['tendencia', 'grafico', 'analise', 'historico de variaveis', 'chart'],
    component: BarChart3
  },

  // ==========================================================================
  // 4. INDUSTRIAL (9 ícones)
  // ==========================================================================
  {
    id: 'factory',
    label: 'Planta Industrial',
    category: 'industrial',
    aliases: ['fabrica', 'instalacao', 'refinaria', 'usina', 'campo', 'planta', 'factory'],
    component: Factory
  },
  {
    id: 'cog',
    label: 'Engenharia / Mecânica',
    category: 'industrial',
    aliases: ['engrenagem', 'maquina', 'atuador', 'mecanismo', 'sistema', 'cog'],
    component: Cog
  },
  {
    id: 'wrench',
    label: 'Manutenção / Ferramenta',
    category: 'industrial',
    aliases: ['servico', 'reparo', 'chave', 'ferramenta', 'bancada', 'oficina', 'wrench'],
    component: Wrench
  },
  {
    id: 'circuit-board',
    label: 'Placa de Circuito',
    category: 'industrial',
    aliases: ['pcb', 'eletronica', 'smd', 'hardware', 'modulo eletronico', 'circuit-board'],
    component: CircuitBoard
  },
  {
    id: 'power',
    label: 'Alimentação / Chave',
    category: 'industrial',
    aliases: ['liga/desliga', 'energia', 'standby', 'fonte', 'alimentacao', 'power'],
    component: Power
  },
  {
    id: 'box',
    label: 'Módulo / Invólucro',
    category: 'industrial',
    aliases: ['gabinete', 'enclosure', 'modulo compacto', 'caixa', 'box'],
    component: Box
  },
  {
    id: 'package',
    label: 'Acessório / Embalagem',
    category: 'industrial',
    aliases: ['sobressalente', 'kit', 'peca', 'fornecimento', 'embalagem', 'package'],
    component: Package
  },
  {
    id: 'layers',
    label: 'Arquitetura em Camadas',
    category: 'industrial',
    aliases: ['multi-camada', 'modularidade', 'pilha', 'camadas', 'layers'],
    component: Layers
  },
  {
    id: 'workflow',
    label: 'Processo / Malha',
    category: 'industrial',
    aliases: ['malha de controle', 'automacao', 'rotina', 'fluxo', 'workflow'],
    component: Workflow
  },

  // ==========================================================================
  // 5. SAFETY & QUALITY (6 ícones) — Sem Claims Regulatórios Específicos
  // ==========================================================================
  {
    id: 'shield',
    label: 'Proteção',
    category: 'safety_quality',
    aliases: ['protecao', 'robustez', 'isolamento', 'barreira', 'escudo', 'shield'],
    component: Shield
  },
  {
    id: 'shield-check',
    label: 'Proteção Verificada',
    category: 'safety_quality',
    aliases: ['seguranca', 'protegido', 'blindado', 'confiabilidade', 'shield-check'],
    component: ShieldCheck
  },
  {
    id: 'lock',
    label: 'Bloqueio / Trava',
    category: 'safety_quality',
    aliases: ['trava', 'seguranca', 'senha', 'protecao de escrita', 'bloqueio', 'lock'],
    component: Lock
  },
  {
    id: 'check-circle',
    label: 'Verificado / Concluído',
    category: 'safety_quality',
    aliases: ['aprovado', 'concluido', 'ok', 'sucesso', 'correto', 'check-circle'],
    component: CheckCircle2
  },
  {
    id: 'alert-triangle',
    label: 'Atenção / Alerta',
    category: 'safety_quality',
    aliases: ['alarme', 'aviso', 'cuidado', 'alerta', 'advertencia', 'alert-triangle'],
    component: AlertTriangle
  },
  {
    id: 'badge-check',
    label: 'Qualidade / Verificação',
    category: 'safety_quality',
    aliases: ['inspecao', 'qualidade', 'selo', 'verificado', 'padrao', 'badge-check'],
    component: BadgeCheck
  },

  // ==========================================================================
  // 6. DOCUMENTATION (4 ícones)
  // ==========================================================================
  {
    id: 'file-text',
    label: 'Manual / Folha de Dados',
    category: 'documentation',
    aliases: ['datasheet', 'manual', 'documento', 'instrucoes', 'texto', 'file-text'],
    component: FileText
  },
  {
    id: 'book-open',
    label: 'Guia Técnico',
    category: 'documentation',
    aliases: ['catalogo', 'guia rapido', 'documentacao completa', 'livro', 'book-open'],
    component: BookOpen
  },
  {
    id: 'clipboard',
    label: 'Procedimento / Lista',
    category: 'documentation',
    aliases: ['checklist', 'roteiro', 'prancheta', 'tarefas', 'clipboard'],
    component: ClipboardList
  },
  {
    id: 'table',
    label: 'Tabela de Especificações',
    category: 'documentation',
    aliases: ['tabela', 'especificacoes', 'matriz', 'parametros', 'grade', 'table'],
    component: Table2
  }
];

// Mapa indexado em memória para lookup O(1)
const ICON_BY_ID = new Map<string, CorporateIconDefinition>();
CORPORATE_ICON_DEFINITIONS.forEach((def) => {
  ICON_BY_ID.set(def.id, def);
});

/**
 * Normaliza strings de busca: trim, lowercase e remoção de acentos via Unicode NFD.
 */
export function normalizeIconSearchText(text: string): string {
  if (!text) return '';
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Obtém a definição canônica de um ícone a partir do seu semantic iconId.
 * Retorna undefined se o ID não fizer parte do catálogo aprovado.
 */
export function getCorporateIcon(iconId?: string | null): CorporateIconDefinition | undefined {
  if (!iconId) return undefined;
  return ICON_BY_ID.get(iconId.trim().toLowerCase());
}

/**
 * Realiza busca combinada por query (normalizada) e categoria opcional.
 */
export function searchCorporateIcons(
  query?: string,
  category?: CorporateIconCategory | 'all'
): CorporateIconDefinition[] {
  const normQuery = normalizeIconSearchText(query || '');

  return CORPORATE_ICON_DEFINITIONS.filter((def) => {
    // 1. Filtro de Categoria
    if (category && category !== 'all' && def.category !== category) {
      return false;
    }

    // 2. Se query estiver vazia, aceita todos da categoria
    if (!normQuery) {
      return true;
    }

    // 3. Match em id, label ou aliases
    if (normalizeIconSearchText(def.id).includes(normQuery)) return true;
    if (normalizeIconSearchText(def.label).includes(normQuery)) return true;
    return def.aliases.some((alias) => normalizeIconSearchText(alias).includes(normQuery));
  });
}
