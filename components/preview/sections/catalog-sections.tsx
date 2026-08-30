'use client'

import React from 'react'
import { PageSection } from '@/lib/types/catalog-builder'
import { DesignTokens, ContactInfo } from '@/lib/types/catalog-builder'
import { Product } from '@/lib/types/database'
import { useEditorStore } from '@/features/editor/editor-store'
import { Globe, Phone, Mail } from 'lucide-react'

// ============================================================================
// SHARED PROPS
// ============================================================================

export interface SectionProps {
  section: PageSection
  product: Product | null
  tokens: DesignTokens
  contact: ContactInfo
}

// ============================================================================
// HERO BANNER
// ============================================================================

export const HeroBannerSection: React.FC<SectionProps> = ({ section, product, tokens, contact }) => {
  const { isVisualEditMode, updateProductData, updateProductField } = useEditorStore()
  const sku = product?.sku || 'SKU'
  const marketing = product?.data?.marketing || {}
  const specs = product?.data?.specs || []
  const style = section.style || {}

  const primaryColor = style.accentColor || tokens.colors.primary
  const headerBg = style.backgroundColor && style.backgroundColor !== 'transparent' ? style.backgroundColor : tokens.colors.headerBg

  const features: string[] = marketing.features || [
    'Controle automático de alta exatidão',
    'Display touchscreen colorido',
    'Medição e calibração simultânea de sinais',
    'Relatórios automatizados em PDF',
  ]

  return (
    <div
      style={{
        padding: style.paddingMm ? `${style.paddingMm}mm` : undefined,
        marginBottom: style.marginBottomMm !== undefined ? `${style.marginBottomMm}mm` : undefined,
        backgroundColor: style.backgroundColor && style.backgroundColor !== 'transparent' ? style.backgroundColor : undefined,
      }}
    >
      {/* Header Bar */}
      <div className="flex items-center justify-between pb-3" style={{ borderBottom: `2px solid ${primaryColor}` }}>
        <div className="flex items-center gap-3">
          <div className="font-black text-lg px-3 py-1 tracking-widest text-white" style={{ backgroundColor: primaryColor }}>
            {contact.companyName?.split(' ')[0]?.toUpperCase() || 'EMPRESA'}
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: primaryColor }}>
              {section.content?.companyTag || contact.companyName || 'Calibração e Instrumentação'}
            </span>
            <span className="text-[9px] text-[#737373] uppercase tracking-tight">
              Technical Catalog & Data Sheet
            </span>
          </div>
        </div>
        <div className="text-right">
          {isVisualEditMode && product ? (
            <input
              type="text"
              value={sku}
              onChange={(e) => updateProductField(product.id, { sku: e.target.value })}
              className="text-xs font-bold px-2 py-0.5 text-white border border-blue-400 bg-[#1A1A2E] focus:outline-none"
              style={{ fontFamily: tokens.fonts.data }}
            />
          ) : (
            <span className="text-xs font-bold px-2 py-0.5 text-white" style={{ backgroundColor: headerBg, fontFamily: tokens.fonts.data }}>
              {sku}
            </span>
          )}
        </div>
      </div>

      {/* Title & Subtitle */}
      <div className="mt-3.5 mb-3">
        {isVisualEditMode && product ? (
          <input
            type="text"
            value={marketing.subtitle || ''}
            onChange={(e) => updateProductData(product.id, 'marketing.subtitle', e.target.value)}
            placeholder="Subtítulo da categoria..."
            className="w-full text-[10px] font-bold uppercase tracking-widest bg-transparent border-b border-dashed border-blue-400 focus:outline-none"
            style={{ color: tokens.colors.accent }}
          />
        ) : (
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: tokens.colors.accent }}>
            {marketing.subtitle || 'Instrumentos de Alta Precisão'}
          </span>
        )}

        {isVisualEditMode && product ? (
          <input
            type="text"
            value={marketing.title || product.name}
            onChange={(e) => {
              updateProductData(product.id, 'marketing.title', e.target.value)
              updateProductField(product.id, { name: e.target.value })
            }}
            placeholder="Título comercial do produto..."
            className="w-full font-black tracking-tight mt-1 leading-tight bg-transparent border-b border-dashed border-blue-400 focus:outline-none"
            style={{
              color: tokens.colors.dark,
              fontFamily: tokens.fonts.heading,
              fontSize: style.titleFontSizePx ? `${style.titleFontSizePx}px` : '20px',
            }}
          />
        ) : (
          <h1
            className="font-black tracking-tight mt-0.5 leading-tight"
            style={{
              color: tokens.colors.dark,
              fontFamily: tokens.fonts.heading,
              fontSize: style.titleFontSizePx ? `${style.titleFontSizePx}px` : '20px',
            }}
          >
            {marketing.title || product?.name || 'Título do Produto'}
          </h1>
        )}
      </div>

      {/* 2-Column Hero & Highlights Grid */}
      <div className="grid grid-cols-12 gap-4 mt-3">
        {/* Left Column: Key Features & Overview Description */}
        <div className="col-span-7 space-y-3">
          <div className="bg-[#FAFAFA] p-3 border-l-4 border border-[#E5E5E5]" style={{ borderLeftColor: primaryColor }}>
            <h3 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: primaryColor }}>
              Destaques e Recursos Técnicos
            </h3>
            <ul className="space-y-1.5">
              {features.slice(0, 6).map((feat, i) => (
                <li key={i} className="flex items-start gap-1.5 text-[11px] text-[#262626] leading-tight">
                  <span className="w-3.5 h-3.5 text-white flex items-center justify-center text-[9px] shrink-0 mt-0.5" style={{ backgroundColor: primaryColor }}>
                    ✓
                  </span>
                  <span>{feat}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Overview Text */}
          <div className="text-[11px] leading-relaxed text-[#333333] space-y-1.5" style={{ fontFamily: tokens.fonts.body }}>
            {isVisualEditMode && product ? (
              <textarea
                rows={3}
                value={marketing.overview || ''}
                onChange={(e) => updateProductData(product.id, 'marketing.overview', e.target.value)}
                placeholder="Descrição geral do produto na capa..."
                className="w-full p-2 text-xs border border-dashed border-blue-400 bg-transparent focus:outline-none"
              />
            ) : (
              <p>{marketing.overview || 'Instrumento de calibração metrológica de alto desempenho para indústria e laboratório.'}</p>
            )}
          </div>
        </div>

        {/* Right Column: Hero Product Badge & Quick Specs Box */}
        <div className="col-span-5 flex flex-col gap-2.5">
          {/* Product Hero Badge */}
          <div className="h-36 bg-[#F8FAFC] border border-[#D4D4D4] flex flex-col items-center justify-center p-3 text-center">
            <div className="w-14 h-14 text-white flex items-center justify-center font-bold text-sm mx-auto mb-1.5 shadow-xs" style={{ backgroundColor: primaryColor }}>
              {sku.split('-')[1] || sku.substring(0, 4)}
            </div>
            <span className="text-xs font-bold text-[#171717] uppercase tracking-wide block font-mono-data">
              {sku}
            </span>
            <span className="text-[9px] text-[#737373]">
              Gabinete Industrial de Alta Precisão
            </span>
          </div>

          {/* Quick Specs Summary Box */}
          <div className="border border-[#D4D4D4] bg-[#FFFFFF] p-2.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#525252] block border-b border-[#E5E5E5] pb-1 mb-1.5">
              Resumo de Especificações
            </span>
            <div className="space-y-1 text-[10.5px]">
              {specs.slice(0, 3).map((s: any, i: number) => (
                <div key={i} className="flex justify-between py-0.5 border-b border-[#F5F5F5] last:border-b-0">
                  <span className="text-[#737373] truncate mr-2">{s.param}:</span>
                  <span className="font-mono-data font-bold text-[#171717] text-right shrink-0">
                    {typeof s.value === 'object' ? JSON.stringify(s.value) : String(s.value || '—')}
                  </span>
                </div>
              ))}
              {specs.length === 0 && (
                <div className="text-[10px] text-[#A3A3A3] italic py-1 text-center">
                  Especificações adicionadas no editor
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// FEATURES LIST
// ============================================================================

export const FeaturesListSection: React.FC<SectionProps> = ({ section, product, tokens }) => {
  const { isVisualEditMode, updateProductData } = useEditorStore()
  const features = product?.data?.marketing?.features || section.content?.items || []
  const style = section.style || {}
  const primaryColor = style.accentColor || tokens.colors.primary

  return (
    <div
      className="p-3.5 border-l-4 border"
      style={{
        borderLeftColor: primaryColor,
        borderColor: style.showBorder ? style.borderColor || tokens.colors.border : '#E5E5E5',
        borderWidth: style.showBorder ? '1px' : undefined,
        borderLeftWidth: '4px',
        backgroundColor: style.backgroundColor || '#FAFAFA',
        padding: style.paddingMm ? `${style.paddingMm}mm` : undefined,
        marginBottom: style.marginBottomMm !== undefined ? `${style.marginBottomMm}mm` : undefined,
        textAlign: style.align || 'left',
      }}
    >
      {!style.hideHeader && (
        <h3
          className="font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5"
          style={{
            color: primaryColor,
            fontSize: style.titleFontSizePx ? `${style.titleFontSizePx}px` : '12px',
          }}
        >
          {section.title || 'Destaques e Capacidades Técnicas'}
        </h3>
      )}
      <ul className="space-y-1.5">
        {features.map((feat: string, i: number) => (
          <li
            key={i}
            className="flex items-start gap-1.5 leading-tight"
            style={{
              fontSize: style.fontSizePx ? `${style.fontSizePx}px` : '11px',
              color: style.textColor || '#262626',
            }}
          >
            <span
              className="w-3.5 h-3.5 text-white flex items-center justify-center text-[9px] shrink-0 mt-0.5"
              style={{ backgroundColor: primaryColor }}
            >
              ✓
            </span>
            {isVisualEditMode && product ? (
              <input
                type="text"
                value={feat}
                onChange={(e) => {
                  const updated = [...features]
                  updated[i] = e.target.value
                  updateProductData(product.id, 'marketing.features', updated)
                }}
                className="flex-1 bg-transparent border-b border-dashed border-blue-400 focus:outline-none"
              />
            ) : (
              <span>{feat}</span>
            )}
          </li>
        ))}
        {features.length === 0 && (
          <li className="text-[11px] text-[#A3A3A3] italic">Nenhum destaque adicionado.</li>
        )}
      </ul>
    </div>
  )
}

// ============================================================================
// TEXT BLOCK
// ============================================================================

export const TextBlockSection: React.FC<SectionProps> = ({ section, product, tokens }) => {
  const { isVisualEditMode, updateProductData, updateSectionContent } = useEditorStore()
  const text = section.content?.text || product?.data?.marketing?.overview || ''
  const style = section.style || {}

  return (
    <div
      className="leading-relaxed space-y-2"
      style={{
        fontFamily: tokens.fonts.body,
        fontSize: style.fontSizePx ? `${style.fontSizePx}px` : '11px',
        color: style.textColor || '#333333',
        backgroundColor: style.backgroundColor && style.backgroundColor !== 'transparent' ? style.backgroundColor : undefined,
        padding: style.paddingMm ? `${style.paddingMm}mm` : undefined,
        marginBottom: style.marginBottomMm !== undefined ? `${style.marginBottomMm}mm` : undefined,
        textAlign: style.align || 'left',
        border: style.showBorder ? `1px ${style.borderStyle || 'solid'} ${style.borderColor || tokens.colors.border}` : undefined,
      }}
    >
      {isVisualEditMode ? (
        <textarea
          rows={3}
          value={text}
          onChange={(e) => {
            if (product) updateProductData(product.id, 'marketing.overview', e.target.value)
          }}
          placeholder="Digite o texto deste bloco diretamente aqui..."
          className="w-full p-2 bg-transparent border border-dashed border-blue-400 focus:outline-none text-xs"
        />
      ) : (
        <p>{text || 'Insira um bloco de texto aqui.'}</p>
      )}
    </div>
  )
}

// ============================================================================
// SPECS TABLE (generic param × value)
// ============================================================================

export const SpecsTableSection: React.FC<SectionProps> = ({ section, product, tokens }) => {
  const { isVisualEditMode, updateProductData } = useEditorStore()
  const rows = section.content?.rows || product?.data?.specs || []
  const columns = section.config?.columns || ['Parâmetro Metrológico', 'Especificação Técnica']
  const style = section.style || {}
  const primaryColor = style.accentColor || tokens.colors.primary

  return (
    <div
      style={{
        padding: style.paddingMm ? `${style.paddingMm}mm` : undefined,
        marginBottom: style.marginBottomMm !== undefined ? `${style.marginBottomMm}mm` : undefined,
        backgroundColor: style.backgroundColor && style.backgroundColor !== 'transparent' ? style.backgroundColor : undefined,
        border: style.showBorder ? `1px ${style.borderStyle || 'solid'} ${style.borderColor || tokens.colors.border}` : undefined,
      }}
    >
      {!style.hideHeader && (
        <h3
          className="font-bold uppercase tracking-wider mb-1.5 pb-0.5"
          style={{
            color: primaryColor,
            borderBottom: `1px solid ${primaryColor}`,
            fontSize: style.titleFontSizePx ? `${style.titleFontSizePx}px` : '12px',
          }}
        >
          {section.title}
        </h3>
      )}
      <table
        className="w-full border-collapse border"
        style={{
          borderColor: style.borderColor || tokens.colors.border,
          fontSize: style.fontSizePx ? `${style.fontSizePx}px` : '10.5px',
        }}
      >
        <thead>
          <tr style={{ backgroundColor: tokens.colors.headerBg, color: tokens.colors.headerText }}>
            <th className="p-2 border-r border-[#374151] w-1/3 text-left">{columns[0]}</th>
            <th className="p-2 text-left">{columns[1]}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#E5E5E5]" style={{ fontFamily: tokens.fonts.data }}>
          {rows.map((row: any, i: number) => (
            <tr key={i} className={i % 2 === 0 ? 'bg-[#FAFAFA]' : 'bg-[#FFFFFF]'}>
              <td className="p-2 font-sans font-semibold border-r border-[#E5E5E5]">
                {isVisualEditMode && product ? (
                  <input
                    type="text"
                    value={row.param || ''}
                    onChange={(e) => {
                      const updated = [...rows]
                      updated[i] = { ...updated[i], param: e.target.value }
                      updateProductData(product.id, 'specs', updated)
                    }}
                    className="w-full bg-transparent border-b border-dashed border-blue-400 focus:outline-none"
                  />
                ) : (
                  row.param
                )}
              </td>
              <td className="p-2" style={{ color: i === 0 ? primaryColor : undefined, fontWeight: i === 0 ? 'bold' : 'normal' }}>
                {isVisualEditMode && product ? (
                  <input
                    type="text"
                    value={typeof row.value === 'object' ? JSON.stringify(row.value) : String(row.value || '')}
                    onChange={(e) => {
                      const updated = [...rows]
                      updated[i] = { ...updated[i], value: e.target.value }
                      updateProductData(product.id, 'specs', updated)
                    }}
                    className="w-full bg-transparent border-b border-dashed border-blue-400 focus:outline-none"
                  />
                ) : (
                  typeof row.value === 'object' ? JSON.stringify(row.value) : String(row.value || '')
                )}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={2} className="p-3 text-center text-[#A3A3A3] italic">Sem dados.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// ============================================================================
// ELECTRICAL TABLE
// ============================================================================

export const ElectricalTableSection: React.FC<SectionProps> = ({ section, product, tokens }) => {
  const rows = section.content?.rows || product?.data?.electrical || []
  const columns = section.config?.columns || ['Sinal', 'Faixa', 'Resolução', 'Exatidão', 'Observação']
  const style = section.style || {}
  const primaryColor = style.accentColor || tokens.colors.primary

  return (
    <div
      style={{
        padding: style.paddingMm ? `${style.paddingMm}mm` : undefined,
        marginBottom: style.marginBottomMm !== undefined ? `${style.marginBottomMm}mm` : undefined,
        backgroundColor: style.backgroundColor && style.backgroundColor !== 'transparent' ? style.backgroundColor : undefined,
        border: style.showBorder ? `1px ${style.borderStyle || 'solid'} ${style.borderColor || tokens.colors.border}` : undefined,
      }}
    >
      {!style.hideHeader && (
        <h3
          className="font-bold uppercase tracking-wider mb-1.5 pb-0.5"
          style={{
            color: primaryColor,
            borderBottom: `1px solid ${primaryColor}`,
            fontSize: style.titleFontSizePx ? `${style.titleFontSizePx}px` : '12px',
          }}
        >
          {section.title}
        </h3>
      )}
      <table
        className="w-full border-collapse border"
        style={{
          borderColor: style.borderColor || tokens.colors.border,
          fontSize: style.fontSizePx ? `${style.fontSizePx}px` : '10px',
        }}
      >
        <thead>
          <tr style={{ backgroundColor: tokens.colors.headerBg, color: tokens.colors.headerText }}>
            {columns.map((col: string, i: number) => (
              <th key={i} className="p-1.5 border-r border-[#374151] text-left last:border-r-0">{col}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#E5E5E5]" style={{ fontFamily: tokens.fonts.data }}>
          {rows.map((row: any, i: number) => (
            <tr key={i} className={i % 2 === 0 ? 'bg-[#FAFAFA]' : 'bg-[#FFFFFF]'}>
              <td className="p-1.5 font-sans font-semibold border-r border-[#E5E5E5]">{row.signal}</td>
              <td className="p-1.5 border-r border-[#E5E5E5]">{row.range}</td>
              <td className="p-1.5 border-r border-[#E5E5E5]">{row.resolution}</td>
              <td className="p-1.5 font-bold border-r border-[#E5E5E5]">{row.accuracy}</td>
              <td className="p-1.5 font-sans text-[#525252]">{row.note || '—'}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={columns.length} className="p-3 text-center text-[#A3A3A3] italic">Sem dados elétricos.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// ============================================================================
// GENERAL SPECS TABLE
// ============================================================================

export const GeneralSpecsTableSection: React.FC<SectionProps> = ({ section, product, tokens }) => {
  const rows = section.content?.rows || product?.data?.general || []
  const style = section.style || {}
  const primaryColor = style.accentColor || tokens.colors.primary

  return (
    <div
      style={{
        padding: style.paddingMm ? `${style.paddingMm}mm` : undefined,
        marginBottom: style.marginBottomMm !== undefined ? `${style.marginBottomMm}mm` : undefined,
        backgroundColor: style.backgroundColor && style.backgroundColor !== 'transparent' ? style.backgroundColor : undefined,
        border: style.showBorder ? `1px ${style.borderStyle || 'solid'} ${style.borderColor || tokens.colors.border}` : undefined,
      }}
    >
      {!style.hideHeader && (
        <h3
          className="font-bold uppercase tracking-wider mb-1.5 pb-0.5"
          style={{
            color: primaryColor,
            borderBottom: `1px solid ${primaryColor}`,
            fontSize: style.titleFontSizePx ? `${style.titleFontSizePx}px` : '12px',
          }}
        >
          {section.title}
        </h3>
      )}
      <table
        className="w-full border-collapse border"
        style={{
          borderColor: style.borderColor || tokens.colors.border,
          fontSize: style.fontSizePx ? `${style.fontSizePx}px` : '10px',
        }}
      >
        <tbody className="divide-y divide-[#E5E5E5]">
          {rows.map((item: any, i: number) => (
            <tr key={i} className={i % 2 === 0 ? 'bg-[#FAFAFA]' : 'bg-[#FFFFFF]'}>
              <td className="p-1.5 font-semibold text-[#525252] border-r border-[#E5E5E5] w-1/2">{item.param}</td>
              <td className="p-1.5 text-[#171717]" style={{ fontFamily: tokens.fonts.data }}>{item.desc}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={2} className="p-3 text-center text-[#A3A3A3] italic">Sem dados.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// ============================================================================
// ACCESSORIES TABLE
// ============================================================================

export const AccessoriesTableSection: React.FC<SectionProps> = ({ section, product, tokens }) => {
  const rows = section.content?.rows || product?.data?.accessories || []
  const style = section.style || {}
  const primaryColor = style.accentColor || tokens.colors.primary

  return (
    <div
      style={{
        padding: style.paddingMm ? `${style.paddingMm}mm` : undefined,
        marginBottom: style.marginBottomMm !== undefined ? `${style.marginBottomMm}mm` : undefined,
        backgroundColor: style.backgroundColor && style.backgroundColor !== 'transparent' ? style.backgroundColor : undefined,
        border: style.showBorder ? `1px ${style.borderStyle || 'solid'} ${style.borderColor || tokens.colors.border}` : undefined,
      }}
    >
      {!style.hideHeader && (
        <h3
          className="font-bold uppercase tracking-wider mb-1.5 pb-0.5"
          style={{
            color: primaryColor,
            borderBottom: `1px solid ${primaryColor}`,
            fontSize: style.titleFontSizePx ? `${style.titleFontSizePx}px` : '12px',
          }}
        >
          {section.title}
        </h3>
      )}
      <table
        className="w-full border-collapse border"
        style={{
          borderColor: style.borderColor || tokens.colors.border,
          fontSize: style.fontSizePx ? `${style.fontSizePx}px` : '10px',
        }}
      >
        <tbody className="divide-y divide-[#E5E5E5]">
          {rows.map((acc: any, i: number) => (
            <tr key={i} className={i % 2 === 0 ? 'bg-[#FAFAFA]' : 'bg-[#FFFFFF]'}>
              <td className="p-1.5 font-bold w-24 border-r border-[#E5E5E5]" style={{ fontFamily: tokens.fonts.data, color: primaryColor }}>{acc.code}</td>
              <td className="p-1.5 text-[#333333]">{acc.description}</td>
              {acc.type && (
                <td className="p-1.5 text-[10px] text-right w-20">
                  <span className={`px-1.5 py-0.5 ${acc.type === 'Standard' ? 'bg-[#ECFDF5] text-[#059669] border-[#A7F3D0]' : 'bg-[#F5F5F5] text-[#737373] border-[#D4D4D4]'} border`}>
                    {acc.type}
                  </span>
                </td>
              )}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={3} className="p-3 text-center text-[#A3A3A3] italic">Sem acessórios.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// ============================================================================
// COMPARISON GRID
// ============================================================================

export const ComparisonGridSection: React.FC<SectionProps & { allProducts?: Product[] }> = ({ section, tokens, allProducts }) => {
  const models = allProducts || []
  const style = section.style || {}
  const primaryColor = style.accentColor || tokens.colors.primary

  if (models.length < 2) {
    return (
      <div className="p-3 text-center text-[11px] text-[#A3A3A3] italic border border-dashed border-[#D4D4D4]">
        Adicione 2 ou mais produtos para gerar uma tabela comparativa.
      </div>
    )
  }

  const specKeys = models[0]?.data?.specs?.map((s: any) => s.param) || []

  return (
    <div
      style={{
        padding: style.paddingMm ? `${style.paddingMm}mm` : undefined,
        marginBottom: style.marginBottomMm !== undefined ? `${style.marginBottomMm}mm` : undefined,
        backgroundColor: style.backgroundColor && style.backgroundColor !== 'transparent' ? style.backgroundColor : undefined,
      }}
    >
      {!style.hideHeader && (
        <h3
          className="font-bold uppercase tracking-wider mb-1.5 pb-0.5"
          style={{
            color: primaryColor,
            borderBottom: `1px solid ${primaryColor}`,
            fontSize: style.titleFontSizePx ? `${style.titleFontSizePx}px` : '12px',
          }}
        >
          {section.title}
        </h3>
      )}
      <table
        className="w-full border-collapse border"
        style={{
          borderColor: style.borderColor || tokens.colors.border,
          fontSize: style.fontSizePx ? `${style.fontSizePx}px` : '10px',
        }}
      >
        <thead>
          <tr style={{ backgroundColor: tokens.colors.headerBg, color: tokens.colors.headerText }}>
            <th className="p-1.5 border-r border-[#374151] text-left">Parâmetro</th>
            {models.map((m) => (
              <th key={m.id} className="p-1.5 border-r border-[#374151] text-center last:border-r-0">{m.sku}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#E5E5E5]">
          {specKeys.map((param: string, i: number) => (
            <tr key={i} className={i % 2 === 0 ? 'bg-[#FAFAFA]' : 'bg-[#FFFFFF]'}>
              <td className="p-1.5 font-semibold border-r border-[#E5E5E5]">{param}</td>
              {models.map((m) => {
                const spec = m.data?.specs?.find((s: any) => s.param === param)
                return (
                  <td key={m.id} className="p-1.5 text-center border-r border-[#E5E5E5] last:border-r-0" style={{ fontFamily: tokens.fonts.data }}>
                    {spec ? String(spec.value || '') : '—'}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ============================================================================
// CUSTOM TABLE
// ============================================================================

export const CustomTableSection: React.FC<SectionProps> = ({ section, tokens }) => {
  const columns = section.config?.columns || ['Coluna 1', 'Coluna 2']
  const rows = section.content?.rows || []
  const style = section.style || {}
  const primaryColor = style.accentColor || tokens.colors.primary

  return (
    <div
      style={{
        padding: style.paddingMm ? `${style.paddingMm}mm` : undefined,
        marginBottom: style.marginBottomMm !== undefined ? `${style.marginBottomMm}mm` : undefined,
        backgroundColor: style.backgroundColor && style.backgroundColor !== 'transparent' ? style.backgroundColor : undefined,
      }}
    >
      {!style.hideHeader && (
        <h3
          className="font-bold uppercase tracking-wider mb-1.5 pb-0.5"
          style={{
            color: primaryColor,
            borderBottom: `1px solid ${primaryColor}`,
            fontSize: style.titleFontSizePx ? `${style.titleFontSizePx}px` : '12px',
          }}
        >
          {section.title}
        </h3>
      )}
      <table
        className="w-full border-collapse border"
        style={{
          borderColor: style.borderColor || tokens.colors.border,
          fontSize: style.fontSizePx ? `${style.fontSizePx}px` : '10px',
        }}
      >
        <thead>
          <tr style={{ backgroundColor: tokens.colors.headerBg, color: tokens.colors.headerText }}>
            {columns.map((col: string, i: number) => (
              <th key={i} className="p-1.5 border-r border-[#374151] text-left last:border-r-0">{col}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#E5E5E5]">
          {rows.map((row: any[], ri: number) => (
            <tr key={ri} className={ri % 2 === 0 ? 'bg-[#FAFAFA]' : 'bg-[#FFFFFF]'}>
              {(Array.isArray(row) ? row : Object.values(row)).map((cell: any, ci: number) => (
                <td key={ci} className="p-1.5 border-r border-[#E5E5E5] last:border-r-0" style={{ fontFamily: tokens.fonts.data }}>
                  {String(cell || '')}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={columns.length} className="p-3 text-center text-[#A3A3A3] italic">Tabela vazia.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// ============================================================================
// CONTACT FOOTER
// ============================================================================

export const ContactFooterSection: React.FC<SectionProps> = ({ section, tokens, contact }) => {
  const info = section.content || contact
  const style = section.style || {}
  const primaryColor = style.accentColor || tokens.colors.primary

  return (
    <div
      className="pt-3 flex items-center justify-between text-[10px] text-[#737373]"
      style={{
        borderTop: `1px solid ${style.borderColor || tokens.colors.border}`,
        backgroundColor: style.backgroundColor && style.backgroundColor !== 'transparent' ? style.backgroundColor : undefined,
        padding: style.paddingMm ? `${style.paddingMm}mm` : undefined,
        marginBottom: style.marginBottomMm !== undefined ? `${style.marginBottomMm}mm` : undefined,
      }}
    >
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1">
          <Globe className="w-3 h-3" style={{ color: primaryColor }} /> {info.website || contact.website}
        </span>
        <span className="flex items-center gap-1">
          <Phone className="w-3 h-3" style={{ color: primaryColor }} /> {info.phone || contact.phone}
        </span>
        <span className="flex items-center gap-1">
          <Mail className="w-3 h-3" style={{ color: primaryColor }} /> {info.email || contact.email}
        </span>
      </div>
      <span className="text-[10px] text-[#A3A3A3]">
        {contact.companyName} — Todos os direitos reservados.
      </span>
    </div>
  )
}

// ============================================================================
// IMAGE GALLERY
// ============================================================================

export const ImageGallerySection: React.FC<SectionProps> = ({ section, tokens }) => {
  const images = section.content?.images || []
  const cols = section.config?.columns || 3
  const style = section.style || {}
  const primaryColor = style.accentColor || tokens.colors.primary

  if (images.length === 0) {
    return (
      <div className="p-6 text-center text-[11px] text-[#A3A3A3] italic border border-dashed" style={{ borderColor: tokens.colors.border }}>
        Galeria vazia — adicione imagens no editor.
      </div>
    )
  }

  return (
    <div
      style={{
        padding: style.paddingMm ? `${style.paddingMm}mm` : undefined,
        marginBottom: style.marginBottomMm !== undefined ? `${style.marginBottomMm}mm` : undefined,
      }}
    >
      {!style.hideHeader && (
        <h3
          className="font-bold uppercase tracking-wider mb-1.5 pb-0.5"
          style={{
            color: primaryColor,
            borderBottom: `1px solid ${primaryColor}`,
            fontSize: style.titleFontSizePx ? `${style.titleFontSizePx}px` : '12px',
          }}
        >
          {section.title}
        </h3>
      )}
      <div className={`grid gap-2`} style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {images.map((img: any, i: number) => (
          <div key={i} className="border border-[#D4D4D4] bg-[#F8FAFC] flex flex-col items-center justify-center p-2">
            <div className="w-full h-20 bg-[#E5E5E5] flex items-center justify-center text-xs text-[#737373]">
              {typeof img === 'string' ? img : img.caption || `Imagem ${i + 1}`}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// ORDERING CODES
// ============================================================================

export const OrderingCodesSection: React.FC<SectionProps> = ({ section, tokens }) => {
  const segments = section.config?.segments || section.content?.segments || []
  const style = section.style || {}
  const primaryColor = style.accentColor || tokens.colors.primary

  return (
    <div
      style={{
        padding: style.paddingMm ? `${style.paddingMm}mm` : undefined,
        marginBottom: style.marginBottomMm !== undefined ? `${style.marginBottomMm}mm` : undefined,
      }}
    >
      {!style.hideHeader && (
        <h3
          className="font-bold uppercase tracking-wider mb-1.5 pb-0.5"
          style={{
            color: primaryColor,
            borderBottom: `1px solid ${primaryColor}`,
            fontSize: style.titleFontSizePx ? `${style.titleFontSizePx}px` : '12px',
          }}
        >
          {section.title}
        </h3>
      )}
      {segments.length > 0 ? (
        <div className="flex items-center gap-1 flex-wrap">
          {segments.map((seg: any, i: number) => (
            <div key={i} className="border border-[#D4D4D4] bg-[#FAFAFA] p-2 text-center min-w-[60px]">
              <span className="block text-xs font-bold" style={{ fontFamily: tokens.fonts.data, color: primaryColor }}>{seg.segment || seg.code}</span>
              <span className="block text-[9px] text-[#737373] mt-0.5">{seg.description || ''}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-3 text-center text-[11px] text-[#A3A3A3] italic border border-dashed" style={{ borderColor: tokens.colors.border }}>
          Configurar código de encomenda no editor.
        </div>
      )}
    </div>
  )
}

// ============================================================================
// BLANK SPACER
// ============================================================================

export const BlankSpacerSection: React.FC<SectionProps> = ({ section }) => {
  const height = section.config?.heightMm || section.style?.marginBottomMm || 20
  return <div style={{ height: `${height}mm` }} />
}
