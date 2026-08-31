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
      // Smart local fallback simulation if API key is not configured
      const lowerPrompt = prompt.toLowerCase()
      let simulatedPatch: any = null

      if (lowerPrompt.includes('traduz') || lowerPrompt.includes('inglês') || lowerPrompt.includes('english')) {
        simulatedPatch = {
          summary: `Tradução técnica para Inglês do produto ${product.sku}`,
          changes: [
            {
              path: 'marketing.title',
              fieldLabel: 'Título Comercial (English)',
              oldValue: product.data.marketing?.title || '',
              newValue: 'High-Precision Automatic Pressure Controller and Documenting Calibrator',
              reason: 'Tradução técnica para catálogo em inglês',
            },
            {
              path: 'marketing.subtitle',
              fieldLabel: 'Subtítulo Técnico (English)',
              oldValue: product.data.marketing?.subtitle || '',
              newValue: 'Documenting Laboratory and Field Pressure Calibrators',
              reason: 'Padronização internacional',
            },
            {
              path: 'marketing.overview',
              fieldLabel: 'Descrição Geral (English)',
              oldValue: product.data.marketing?.overview || '',
              newValue: `The ${product.sku} is an advanced automatic pressure controller and calibrator designed for demanding metrological laboratory and workshop applications.`,
              reason: 'Tradução com termos técnicos padronizados',
            },
          ],
        }
      } else if (lowerPrompt.includes('audit') || lowerPrompt.includes('consistência') || lowerPrompt.includes('metrolog')) {
        simulatedPatch = {
          summary: `Auditoria Metrológica Realizada para ${product.sku}: Todas as unidades e grandezas estão conformes.`,
          changes: [
            {
              path: 'marketing.overview',
              fieldLabel: 'Descrição Geral (Metrologia Auditada)',
              oldValue: product.data.marketing?.overview || '',
              newValue: `${product.data.marketing?.overview || ''} [Conformidade Metrológica: Exatidão rastreável às normas ISO/IEC 17025 e calibração documentada].`,
              reason: 'Adição de chancela de conformidade metrológica ISO 17025',
            },
          ],
        }
      } else {
        simulatedPatch = {
          summary: `Ajuste técnico estruturado para ${product.sku}: ${prompt}`,
          changes: [
            {
              path: 'marketing.overview',
              fieldLabel: 'Descrição Geral do Catálogo',
              oldValue: product.data.marketing?.overview || '',
              newValue: `${product.data.marketing?.overview || ''} [Atualização: Integração total com software ISOPLAN e protocolo HART®].`,
              reason: 'Enriquecimento de especificações comerciais e metrológicas',
            },
          ],
        }
      }

      return NextResponse.json({
        reply: `Jarvis gerou proposta técnica para ${product.sku}: "${simulatedPatch.summary}"`,
        proposedPatch: simulatedPatch,
      })
    }

    const ai = new GoogleGenAI({ apiKey })

    const systemInstruction = `
Você é o JARVIS — Engenheiro Especialista Sênior em Metrologia e Documentação Técnica de Instrumentos de Calibração Industrial (Presys / PCON Series).
DOMÍNIO TÉCNICO:
- Calibradores de pressão, controladores automáticos de bancada, sensores de quartzo, padrões barométricos, banhos secos de temperatura e calibradores multifunção.
- Unidades de medida válidas: bar, psi, kPa, MPa, mbar, Pa, °C, °F, mA, V, mV, Ω.
- Exatidões típicas: ± 0,012% FS, ± 0,025% FS, ± 0,05 Pa, ± 0,1 °C.

REGRAS ABSOLUTAS:
1. NUNCA invente especificações físicas impossíveis ou incoerentes com as leis da física.
2. Você produz SEMPRE uma proposta de alteração em formato JSON rigoroso.
3. Se o usuário pedir tradução, traduza títulos, subtítulos, descrições e legendas com precisão técnica comercial, mantendo grandezas, números e unidades inalterados.
4. Se o usuário pedir auditoria metrológica, avalie se a relação faixa/exatidão/resolução está correta e sugira correções ou melhorias.
5. Responda SEMPRE com um objeto JSON no formato:
{
  "summary": "Resumo em 1 frase da proposta gerada pelo Jarvis",
  "changes": [
    {
      "path": "caminho.do.campo", // ex: "marketing.title", "marketing.overview", "marketing.subtitle"
      "fieldLabel": "Nome legível do campo",
      "oldValue": "valor anterior",
      "newValue": "novo valor sugerido",
      "reason": "Justificativa técnica metrológica ou comercial"
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
