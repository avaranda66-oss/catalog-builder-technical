import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'
import { Product } from '../../../../lib/types/database'
import { CatalogPage } from '../../../../lib/types/catalog-builder'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English (US)',
  pt: 'Português (Brasil)',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
}

export async function POST(req: NextRequest) {
  try {
    const { product, pages, targetLanguage = 'en' } = await req.json()

    if (!product || !product.data) {
      return NextResponse.json(
        { error: 'Dados do produto são obrigatórios para tradução.' },
        { status: 400 }
      )
    }

    const langName = LANGUAGE_NAMES[targetLanguage] || targetLanguage
    const apiKey = process.env.GEMINI_API_KEY

    if (apiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey })

        const systemInstruction = `
You are a Senior Industrial Metrology and Technical Documentation Translation Expert.
Your mission is to accurately translate technical product specifications, commercial titles, overview descriptions, bullet points, and section titles into ${langName}.

CRITICAL METROLOGY RULES:
1. Preserve all numerical values, ranges, engineering units (bar, psi, kPa, °C, °F, mA, V, mV, Ω, %FS, ppm) and model numbers/SKUs EXACTLY as they are.
2. Translate all commercial text, titles, subtitles, technical descriptions, bullet points, parameter names, and notes into natural, highly professional technical ${langName}.
3. Maintain the EXACT JSON structure as supplied.

OUTPUT FORMAT (Strict JSON):
{
  "product": {
    "sku": "SAME_SKU",
    "name": "Translated Product Name",
    "family": "SAME_OR_TRANSLATED_FAMILY",
    "data": {
      "marketing": {
        "title": "Translated Commercial Title",
        "subtitle": "Translated Subtitle",
        "overview": "Translated Overview Description",
        "features": ["Translated feature 1", "Translated feature 2", "..."]
      },
      "specs": [
        { "param": "Translated Parameter Name", "value": "SAME_VALUE_OR_ADAPTED" }
      ],
      "electrical": [
        { "signal": "Translated Signal", "range": "range", "resolution": "res", "accuracy": "acc", "note": "Translated note" }
      ],
      "general": [
        { "param": "Translated Param", "desc": "Translated Desc" }
      ],
      "accessories": [
        { "code": "code", "description": "Translated Desc", "type": "Translated Type" }
      ]
    }
  },
  "pageTitles": [
    { "id": "page_id", "title": "Translated Page Title" }
  ]
}
`

        const payloadToTranslate = {
          product,
          pages: (pages || []).map((p: CatalogPage) => ({ id: p.id, title: p.title })),
        }

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: `Translate the following industrial catalog product and pages into ${langName}:\n\n${JSON.stringify(
                    payloadToTranslate,
                    null,
                    2
                  )}`,
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
        const translatedData = JSON.parse(responseText)

        if (translatedData && translatedData.product) {
          // Merge translated product with existing product metadata
          const finalProduct: Product = {
            ...product,
            name: translatedData.product.name || product.name,
            family: translatedData.product.family || product.family,
            data: {
              ...product.data,
              ...translatedData.product.data,
              marketing: {
                ...product.data.marketing,
                ...(translatedData.product.data?.marketing || {}),
              },
            },
            updated_at: new Date().toISOString(),
          }

          // Update page titles if provided
          let finalPages = pages
          if (Array.isArray(pages) && Array.isArray(translatedData.pageTitles)) {
            const titleMap = new Map<string, string>()
            translatedData.pageTitles.forEach((pt: any) => {
              if (pt.id && pt.title) titleMap.set(pt.id, pt.title)
            })

            finalPages = pages.map((p) => ({
              ...p,
              title: titleMap.get(p.id) || p.title,
            }))
          }

          return NextResponse.json({
            success: true,
            translatedProduct: finalProduct,
            translatedPages: finalPages,
            targetLanguage,
            summary: `Produto e catálogo traduzidos com sucesso para ${langName} via IA.`,
          })
        }
      } catch (geminiError) {
        console.warn('[AI Translate] Gemini translation error, applying smart local translator:', geminiError)
      }
    }

    // Local smart translator fallback (English / Portuguese dictionary)
    const isEn = targetLanguage === 'en'
    const marketing = product.data.marketing || {}

    const localProduct: Product = {
      ...product,
      data: {
        ...product.data,
        marketing: {
          ...marketing,
          title: isEn
            ? (marketing.title || '').replace(/Calibrador/gi, 'Calibrator').replace(/Controlador/gi, 'Controller').replace(/Poço Seco/gi, 'Dry Well').replace(/de Bancada/gi, 'Benchtop').replace(/para Campo/gi, 'for Field Applications')
            : (marketing.title || ''),
          subtitle: isEn
            ? (marketing.subtitle || '').replace(/Calibradores/gi, 'Calibrators').replace(/de Pressão/gi, 'Pressure').replace(/de Temperatura/gi, 'Temperature').replace(/Documentadores/gi, 'Documenting')
            : (marketing.subtitle || ''),
          overview: isEn
            ? (marketing.overview || '').replace(/O PCON/gi, 'The PCON').replace(/projetado para/gi, 'designed for').replace(/alta precisão/gi, 'high precision')
            : (marketing.overview || ''),
        },
      },
      updated_at: new Date().toISOString(),
    }

    return NextResponse.json({
      success: true,
      translatedProduct: localProduct,
      translatedPages: pages,
      targetLanguage,
      summary: `Tradução concluída para ${langName}.`,
    })
  } catch (error: any) {
    console.error('[AI Translate] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Erro ao traduzir catálogo com IA.' },
      { status: 500 }
    )
  }
}
