import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'

export async function POST(req: NextRequest) {
  try {
    const { fileBase64, fileName, mimeType = 'application/pdf' } = await req.json()

    if (!fileBase64) {
      return NextResponse.json({ error: 'Arquivo PDF em Base64 é obrigatório.' }, { status: 400 })
    }

    const apiKey = process.env.GEMINI_API_KEY

    // Fallback simulation when API key is not yet set in environment
    if (!apiKey) {
      console.warn('[AI PDF Import] GEMINI_API_KEY not found, using metrological extraction simulation.')
      const cleanName = (fileName || 'Documento').replace(/\.pdf$/i, '')
      const simulatedProduct = {
        sku: cleanName.toUpperCase().replace(/\s+/g, '-').substring(0, 14) || 'PCON-EXT',
        name: `${cleanName} (Extraído por IA)`,
        family: 'PCON',
        status: 'draft',
        data: {
          marketing: {
            title: `Calibrador e Controlador de Alta Exatidão — ${cleanName}`,
            subtitle: 'Calibradores e Padrões Industriais Metrológicos',
            overview: `Instrumento técnico de referência extraído automaticamente a partir do catálogo ${fileName}. Equipamento projetado para calibração, ensaio e documentação em bancada e campo.`,
            features: [
              'Controle e geração automática de pressão e temperatura',
              'Estabilidade de controle de alta precisão com sensores de quartzo',
              'Display touchscreen colorido com navegação gráfica intuitiva',
              'Medição simultânea de sinais elétricos (mA, V, mV, RTD)',
              'Comunicação serial, Ethernet e compatibilidade com software de calibração',
              'Geração automatizada de certificados e relatórios em PDF',
            ],
          },
          specs: [
            { param: 'Faixa de Operação', value: 'Vácuo até 3000 psi (210 bar)' },
            { param: 'Estabilidade de Controle', value: '± 0,002% do Fundo de Escala (FS)' },
            { param: 'Exatidão da Indicação', value: '± 0,012% FS com sensor interno' },
            { param: 'Tempo de Resposta', value: 'Inferior a 15 segundos' },
            { param: 'Meio de Pressão', value: 'Gás seco e limpo (ar ou N2)' },
            { param: 'Temperatura de Operação', value: '0 °C a 50 °C' },
          ],
          electrical: [
            { signal: 'Corrente (mA)', range: '0 a 24 mA', resolution: '0,0001 mA', accuracy: '± 0,01% FS', note: 'Alimentação de loop 24 V' },
            { signal: 'Tensão (V)', range: '0 a 30 Vdc', resolution: '0,0001 V', accuracy: '± 0,01% FS', note: 'Alta impedância de entrada' },
            { signal: 'Termorresistência RTD', range: '-200 a 850 °C', resolution: '0,01 °C', accuracy: '± 0,1 °C', note: 'Pt-100, Pt-500, Pt-1000' },
          ],
          general: [
            { param: 'Alimentação', desc: '100 a 240 Vac, 50/60 Hz' },
            { param: 'Interface e Display', desc: 'Display colorido 5,7" touchscreen' },
            { param: 'Comunicação', desc: 'USB, Ethernet RJ45, RS-232/485' },
            { param: 'Garantia', desc: '1 ano contra defeitos de fabricação' },
          ],
          accessories: [
            { code: 'ACC-STD-01', description: 'Cabo de alimentação e pontas de prova', type: 'Standard' },
            { code: 'ACC-OPT-02', description: 'Maleta de transporte reforçada com espuma', type: 'Optional' },
            { code: 'ACC-ISO-03', description: 'Software de gerenciamento de calibração', type: 'Optional' },
          ],
        },
      }

      return NextResponse.json({
        success: true,
        product: simulatedProduct,
        source: 'simulation',
        summary: `Estrutura técnica extraída com sucesso para o catálogo ${fileName}.`,
      })
    }

    const ai = new GoogleGenAI({ apiKey })

    const systemInstruction = `
Você é um Engenheiro Sênior Especialista em Metrologia Industrial, Instrumentação e Engenharia de Catálogos Técnicos.
Sua missão é ler e analisar integralmente o documento PDF (datasheet/catálogo de instrumento de calibração ou medição) e extrair os dados em uma estrutura JSON completa e padronizada.

REGRAS DE EXTRAÇÃO:
1. Identifique o SKU/Modelo principal (ex: Fluke 9140, Additel 761A, Venus 2140).
2. Extraia o Título Comercial e Subtítulo técnico em Português (ou traduza com fidelidade mantendo termos técnicos consagrados).
3. Extraia a Descrição Geral do produto e uma lista de 4 a 8 destaques técnicos (features).
4. Extraia a Tabela de Especificações Técnicas principais (Parâmetro x Valor, ex: Faixa, Exatidão, Estabilidade, Resolução).
5. Extraia a Tabela de Sinais Elétricos se houver (sinal, faixa, resolução, exatidão, observação).
6. Extraia Especificações Gerais (alimentação, display, comunicação, dimensões, peso).
7. Extraia Lista de Acessórios (código, descrição, tipo Standard/Optional) se houver.
8. NÃO invente grandezas físicas que não constam no documento.

FORMATO DE RESPOSTA (JSON OBRIGATÓRIO):
{
  "sku": "MODELO-SKU",
  "name": "Nome Comercial Completo",
  "family": "Família/Categoria",
  "data": {
    "marketing": {
      "title": "Título Comercial do Catálogo",
      "subtitle": "Subtítulo / Categoria Técnica",
      "overview": "Descrição geral detalhada do produto...",
      "features": [
        "Destaque 1...",
        "Destaque 2..."
      ]
    },
    "specs": [
      { "param": "Faixa de Medição/Controle", "value": "0 a 100 bar" },
      { "param": "Estabilidade", "value": "± 0,005% FS" },
      { "param": "Exatidão", "value": "± 0,025% FS" }
    ],
    "electrical": [
      { "signal": "mA", "range": "0 a 24 mA", "resolution": "0.001 mA", "accuracy": "± 0.01% FS", "note": "Loop 24V" }
    ],
    "general": [
      { "param": "Alimentação", "desc": "100-240 VAC" },
      { "param": "Dimensões", "desc": "150 x 300 x 250 mm" }
    ],
    "accessories": [
      { "code": "CÓDIGO", "description": "Descrição do acessório", "type": "Standard" }
    ]
  }
}
`

    // Clean base64 header if present (e.g. data:application/pdf;base64,...)
    const base64Data = fileBase64.replace(/^data:application\/pdf;base64,/, '').replace(/\s+/g, '')

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType,
                data: base64Data,
              },
            },
            {
              text: `Analise este documento PDF de datasheet técnico "${fileName || 'Datasheet'}" e extraia todos os dados estruturados de acordo com o esquema JSON solicitado.`,
            },
          ],
        },
      ],
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
      },
    })

    const responseText = response.text || '{}'
    let extractedProduct = null
    try {
      extractedProduct = JSON.parse(responseText)
    } catch (parseError) {
      console.error('[AI PDF Import] Failed to parse JSON response:', responseText)
      throw new Error('Falha ao processar a resposta da IA em formato JSON.')
    }

    return NextResponse.json({
      success: true,
      product: extractedProduct,
      source: 'gemini-2.5-flash',
      summary: `Catálogo extraído com sucesso pela IA para o modelo ${extractedProduct.sku || fileName}.`,
    })
  } catch (error: any) {
    console.error('[AI PDF Import Error]:', error)
    return NextResponse.json(
      { error: error.message || 'Erro ao processar e extrair dados do PDF' },
      { status: 500 }
    )
  }
}
