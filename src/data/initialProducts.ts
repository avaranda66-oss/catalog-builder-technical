import { Product } from '../domain/product.schema';

export const INITIAL_PRODUCTS: Product[] = [
  {
    id: 'prod-presys-pcon-y18',
    code: 'PCON-Y18',
    family: 'Calibradores de Processos & Pressão',
    model: 'PCON-Y18-Touch',
    description: 'Calibrador Automático de Pressão Presys com tela touch-screen colorida, bomba elétrica integrada, comunicação HART e módulo documentador.',
    specs: {
      range: '-0.9 a 70',
      unit: 'bar',
      accuracy: '±0.025% FE',
      output: '4-20 mA / 0-10 V / HART',
      powerSupply: 'Bateria Recarregável Li-Ion / 110-220 Vac',
      processConnection: '1/8" NPT Fêmea / Engate Rápido',
      protectionDegree: 'IP54 Estojo Robusto',
      customSpecs: {
        pressureSource: 'Bomba Elétrica Integrada',
        hartSupport: 'HART 7 Nativo com DD Integrado',
        documentation: 'Documentador de Processos Integrado (RBC)'
      }
    },
    imageUrl: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=800&q=80',
    createdAt: '2026-08-31T10:00:00.000Z',
    updatedAt: '2026-08-31T10:00:00.000Z',
    version: 1
  },
  {
    id: 'prod-presys-ta-650p',
    family: 'Calibradores de Temperatura & Blocos Secos',
    code: 'T-650P',
    model: 'T-650P-DryBlock',
    description: 'Calibrador de Temperatura Bloco Seco Presys Série T/TA de alta estabilidade e exatidão metrológica com entrada para termorresistência padrão Pt100.',
    specs: {
      range: 'Ambiente a +650',
      unit: '°C',
      accuracy: '±0.1 °C',
      output: 'USB / RS-232 / Ethernet',
      powerSupply: '110 / 220 Vac - 50/60 Hz',
      processConnection: 'Inserto Multi-furos 1/4", 3/8", 1/2"',
      protectionDegree: 'Gabinete Metálico Industrial',
      customSpecs: {
        stability: '±0.05 °C',
        radialUniformity: '±0.08 °C',
        wellDepth: '150 mm'
      }
    },
    imageUrl: 'https://images.unsplash.com/photo-1581092335397-9583fe92d232?auto=format&fit=crop&w=800&q=80',
    createdAt: '2026-08-31T10:00:00.000Z',
    updatedAt: '2026-08-31T10:00:00.000Z',
    version: 1
  },
  {
    id: 'prod-pcon-200',
    code: 'PCON-200',
    family: 'Transmissores de Pressão Relativa',
    model: 'PCON-200-G',
    description: 'Transmissor de pressão relativa industrial Presys com diafragma em Aço Inox 316L, display LCD retroiluminado e protocolo HART 7.',
    specs: {
      range: '0 a 100',
      unit: 'bar',
      accuracy: '±0.075% FS',
      output: '4-20 mA + HART',
      powerSupply: '12 a 45 Vdc',
      processConnection: '1/2" NPT Macho em Aço Inox 316L',
      protectionDegree: 'IP67 / NEMA 4X',
      customSpecs: {
        diaphragmMaterial: 'Aço Inox 316L (Opcional Hastelloy C-276)',
        display: 'LCD Digital 5 Dígitos com Bargraph',
        turnDown: '100:1'
      }
    },
    imageUrl: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=800&q=80',
    createdAt: '2026-08-31T10:00:00.000Z',
    updatedAt: '2026-08-31T10:00:00.000Z',
    version: 1
  },
  {
    id: 'prod-pcon-500',
    code: 'PCON-500',
    family: 'Transmissores de Pressão Diferencial',
    model: 'PCON-500-D',
    description: 'Transmissor de pressão diferencial de alta exatidão Presys para medição de vazão por placa de orifício e nível em tanques pressurizados.',
    specs: {
      range: '0 a 500',
      unit: 'mbar',
      accuracy: '±0.05% FS',
      output: '4-20 mA + HART 7',
      powerSupply: '12 a 45 Vdc',
      processConnection: '1/4" NPT com flange oval em Inox',
      protectionDegree: 'IP67',
      customSpecs: {
        maxStaticPressure: 'Até 160 bar',
        diaphragmMaterial: 'Hastelloy C-276',
        manifoldMount: 'Compatível com Manifold Presys 3/5 Vias'
      }
    },
    imageUrl: 'https://images.unsplash.com/photo-1581092162384-8987c1d64718?auto=format&fit=crop&w=800&q=80',
    createdAt: '2026-08-31T10:00:00.000Z',
    updatedAt: '2026-08-31T10:00:00.000Z',
    version: 1
  },
  {
    id: 'prod-psv-1000',
    code: 'PSV-1000',
    family: 'Válvulas de Controle & Posicionadores',
    model: 'PSV-1000-Smart',
    description: 'Posicionador eletropneumático inteligente Presys com controle microprocessado, auto-sintonia e feedback analógico 4-20 mA.',
    specs: {
      range: '1.4 a 7.0',
      unit: 'bar',
      accuracy: '±0.5% FS',
      output: 'Feedback 4-20 mA',
      powerSupply: 'Loop-powered 4-20 mA',
      processConnection: 'Flange ANSI 150# RF 2" / Conexão Ar 1/4" NPT',
      protectionDegree: 'IP66 / Ex-d IIC T6',
      customSpecs: {
        airSupply: 'Ar comprimido instrumentação 1.4 a 7.0 bar',
        autoTuning: 'Auto-Calibração One-Touch'
      }
    },
    imageUrl: 'https://images.unsplash.com/photo-1504917599217-d4dc5ebe6122?auto=format&fit=crop&w=800&q=80',
    createdAt: '2026-08-31T10:00:00.000Z',
    updatedAt: '2026-08-31T10:00:00.000Z',
    version: 1
  },
  {
    id: 'prod-temp-800',
    code: 'TT-800',
    family: 'Transmissores de Temperatura',
    model: 'TT-800-Head',
    description: 'Transmissor de temperatura universal Presys montagem em cabeçote para Pt100, Pt1000 e termopares tipo J/K/T/E/N/R/S/B.',
    specs: {
      range: '-200 a +850',
      unit: '°C',
      accuracy: '±0.1 °C ou ±0.1% FS',
      output: '4-20 mA linearizado à temperatura',
      powerSupply: '8 a 35 Vdc',
      processConnection: 'Cabeçote DIN Form B / Poço 1/2" NPT',
      protectionDegree: 'IP68 Cabeçote Alumínio',
      customSpecs: {
        sensorSupport: 'Pt100 (2/3/4 fios) e Termopares',
        galvanicIsolation: '1500 Vac'
      }
    },
    imageUrl: 'https://images.unsplash.com/photo-1581092335397-9583fe92d232?auto=format&fit=crop&w=800&q=80',
    createdAt: '2026-08-31T10:00:00.000Z',
    updatedAt: '2026-08-31T10:00:00.000Z',
    version: 1
  }
];
