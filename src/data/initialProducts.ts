import { Product } from '../domain/product.schema';

export const INITIAL_PRODUCTS: Product[] = [
  {
    id: 'prod-presys-ta-25n',
    code: 'TA-25N',
    family: 'Temperature Advanced Calibrators / Dry Block',
    model: 'TA-25N-Advanced',
    description: 'Calibrador de Temperatura Avançado tipo Bloco Seco Presys Série TA (-25 a 155 °C), com calibrador multissinais embutido (mA, mV, Ω, RTD, TC), probe externo CVD e comunicação HART.',
    specs: {
      range: '-25 to 155',
      unit: '°C',
      accuracy: '±0.1 °C (Int) / ±0.07 °C (Ext Ref) / ±0.05 °C (Ext Std)',
      output: '4-20 mA / HART / USB / Ethernet Web Server',
      powerSupply: '115 Vac ou 230 Vac (50/60 Hz) - 200 W',
      processConnection: 'Inserts Intercambiáveis Ø 25.4 x 124 mm (IN01 a IN1E / INCL Caneca)',
      protectionDegree: 'Chassi Metálico Industrial com Alça Superior',
      customSpecs: {
        operatingRange: '-25 to 155 °C (Continuous use up to 140 °C)',
        stability: '0.02 °C (0.04 °F)',
        resolution: '0.01 °C / 0.01 °F / 0.01 K',
        axialUniformity: '±0.05 °C',
        radialUniformity: '±0.01 °C',
        heatingTime: '10 min (25 to 140 °C)',
        coolingTime: '11 min (25 to -25 °C)',
        powerConsumption: '200 W',
        dimensions: '260 x 200 x 305 mm',
        weight: '10.5 kg',
        touchScreen: '5.7" Color Touchscreen',
        hartProtocol: 'HART Universal / Full-HART DD FieldComm Group',
        ceCompliance: 'CE Mark - EN 61010-1 / EN 61326-1'
      }
    },
    imageUrl: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=800&q=80',
    createdAt: '2026-09-01T12:00:00.000Z',
    updatedAt: '2026-09-01T12:00:00.000Z',
    version: 1
  },
  {
    id: 'prod-presys-ta-35n',
    code: 'TA-35N',
    family: 'Temperature Advanced Calibrators / Dry Block',
    model: 'TA-35N-Advanced',
    description: 'Calibrador de Temperatura Avançado tipo Bloco Seco Presys Série TA (-35 a 155 °C), com calibrador multissinais embutido (mA, mV, Ω, RTD, TC), probe externo CVD e comunicação HART.',
    specs: {
      range: '-35 to 155',
      unit: '°C',
      accuracy: '±0.1 °C (Int) / ±0.07 °C (Ext Ref) / ±0.05 °C (Ext Std)',
      output: '4-20 mA / HART / USB / Ethernet Web Server',
      powerSupply: '115 Vac ou 230 Vac (50/60 Hz) - 300 W',
      processConnection: 'Inserts Intercambiáveis Ø 25.4 x 124 mm (IN01 a IN1E / INCL Caneca)',
      protectionDegree: 'Chassi Metálico Industrial com Alça Superior',
      customSpecs: {
        operatingRange: '-35 to 155 °C (Continuous use up to 140 °C)',
        stability: '0.02 °C (0.04 °F)',
        resolution: '0.01 °C / 0.01 °F / 0.01 K',
        axialUniformity: '±0.06 °C',
        radialUniformity: '±0.01 °C',
        heatingTime: '16 min (25 to 140 °C)',
        coolingTime: '16 min (25 to -35 °C)',
        powerConsumption: '300 W',
        dimensions: '260 x 200 x 305 mm',
        weight: '10.5 kg',
        touchScreen: '5.7" Color Touchscreen',
        hartProtocol: 'HART Universal / Full-HART DD FieldComm Group',
        ceCompliance: 'CE Mark - EN 61010-1 / EN 61326-1'
      }
    },
    imageUrl: 'https://images.unsplash.com/photo-1581092335397-9583fe92d232?auto=format&fit=crop&w=800&q=80',
    createdAt: '2026-09-01T12:00:00.000Z',
    updatedAt: '2026-09-01T12:00:00.000Z',
    version: 1
  },
  {
    id: 'prod-presys-ta-50n',
    code: 'TA-50N',
    family: 'Temperature Advanced Calibrators / Dry Block',
    model: 'TA-50N-Advanced',
    description: 'Calibrador de Temperatura Avançado tipo Bloco Seco Presys Série TA (-50 a 155 °C), com estágio Peltier reforçado, calibrador multissinais embutido, probe externo CVD e comunicação HART.',
    specs: {
      range: '-50 to 155',
      unit: '°C',
      accuracy: '±0.1 °C (Int) / ±0.07 °C (Ext Ref) / ±0.05 °C (Ext Std)',
      output: '4-20 mA / HART / USB / Ethernet Web Server',
      powerSupply: '115 Vac ou 230 Vac (50/60 Hz) - 400 W',
      processConnection: 'Inserts Intercambiáveis Ø 25.4 x 124 mm (IN01 a IN1E / INCL Caneca)',
      protectionDegree: 'Chassi Metálico Industrial Reforçado com Alça',
      customSpecs: {
        operatingRange: '-50 to 155 °C (Continuous use up to 140 °C)',
        stability: '0.02 °C (0.04 °F)',
        resolution: '0.01 °C / 0.01 °F / 0.01 K',
        axialUniformity: '±0.07 °C',
        radialUniformity: '±0.02 °C',
        heatingTime: '11 min (25 to 140 °C)',
        coolingTime: '25 min (25 to -50 °C)',
        powerConsumption: '400 W',
        dimensions: '315 x 200 x 305 mm',
        weight: '12.5 kg',
        touchScreen: '5.7" Color Touchscreen',
        hartProtocol: 'HART Universal / Full-HART DD FieldComm Group',
        ceCompliance: 'CE Mark - EN 61010-1 / EN 61326-1'
      }
    },
    imageUrl: 'https://images.unsplash.com/photo-1581092162384-8987c1d64718?auto=format&fit=crop&w=800&q=80',
    createdAt: '2026-09-01T12:00:00.000Z',
    updatedAt: '2026-09-01T12:00:00.000Z',
    version: 1
  },
  {
    id: 'prod-presys-pcon-y18',
    code: 'PCON-Y18',
    family: 'Process & Pressure Calibrators',
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
  }
];
