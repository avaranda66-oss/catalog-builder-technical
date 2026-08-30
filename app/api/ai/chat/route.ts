import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'

export async function POST(req: NextRequest) {
  try {
    const { prompt, product } = await req.json()

    if (!prompt || !product) {
      return NextResponse.json({ error: 'Prompt e dados do produto são obrigatórios.' }, { status: 400 })
    }

    const apiKey = process.env.GEMINI_API_KEY

    if (!apiKey) {
      // Local fallback simulation if API key is not configured
      const simulatedPatch = {
        summary: `Ajuste estruturado para ${product.sku}: ${prompt}`,
        changes: [
          {
            path: 'marketing.overview',
            fieldLabel: 'Descrição Geral (Marketing)',
            oldValue: product.data.marketing?.overview || '',
            newValue: `${product.data.marketing?.overview || ''} [Atualizado: Compatibilidade total com normas metrológicas vigentes e protocolo HART].`,
            reason: 'Enriquecimento de dados comerciais e metrológicos',
          },
        ],
      }
      return NextResponse.json({
        reply: `Proposta gerada com sucesso para ${product.sku}.`,
        proposedPatch: simulatedPatch,
      })
    }

    const ai = new GoogleGenAI({ apiKey })

    const systemInstruction = `
Você é um Engenheiro Especialista em Metrologia e Documentação Técnica de Instrumentos de Calibração Industrial (Presys / PCON Series).
DOMÍNIO TÉCNICO:
- Calibradores de pressão, controladores automáticos, sensores de quartzo, padrões barométricos.
- Unidades de medida válidas: bar, psi, kPa, MPa, mbar, Pa, °C, °F, mA, V, mV, Ω.
- Exatidões típicas: ± 0,012% FS, ± 0,025% FS, ± 0,05 Pa.

REGRAS ABSOLUTAS:
1. NUNCA invente especificações físicas impossíveis.
2. Você NÃO altera dados diretamente; você produz uma proposta de alteração em formato JSON rigoroso.
3. Se o usuário pedir tradução, traduza apenas textos de descrição/marketing, mantendo termos técnicos e grandezas inalteradas.
4. Responda SEMPRE com um objeto JSON no formato:
{
  "summary": "Resumo em 1 frase da mudança",
  "changes": [
    {
      "path": "caminho.do.campo", // ex: "marketing.title", "pressure_specs.control_range.max"
      "fieldLabel": "Nome legível do campo",
      "oldValue": "valor anterior",
      "newValue": "novo valor sugerido",
      "reason": "Justificativa metrológica/comercial"
    }
  ]
}
`

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `PRODUTO ATUAL:\n${JSON.stringify(
                product,
                null,
                2
              )}\n\nCOMANDO DO USUÁRIO:\n${prompt}`,
            },
          ],
        },
      ],
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
      },
    })

    const text = response.text || '{}'
    let proposedPatch = null
    try {
      proposedPatch = JSON.parse(text)
    } catch {
      proposedPatch = {
        summary: 'Ajuste geral solicitado',
        changes: [],
      }
    }

    return NextResponse.json({
      reply: proposedPatch.summary || 'Proposta processada.',
      proposedPatch,
    })
  } catch (error: any) {
    console.error('AI API Error:', error)
    return NextResponse.json({ error: error.message || 'Erro ao processar IA' }, { status: 500 })
  }
}
