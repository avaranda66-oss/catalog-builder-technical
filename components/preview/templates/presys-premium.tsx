'use client'

import React from 'react'
import { Product, Catalog } from '../../../lib/types/database'
import { ShieldCheck, Check, Phone, Mail, Globe } from 'lucide-react'

interface TemplateProps {
  product: Product
  catalog: Catalog | null
  allProducts: Product[]
}

export const PresysPremiumTemplate: React.FC<TemplateProps> = ({
  product,
  catalog,
  allProducts,
}) => {
  const data = product.data || {}
  const marketing = data.marketing || {}
  const pressureSpecs = data.pressure_specs || {}
  const electricalSpecs = data.electrical_specs || []
  const generalSpecs = data.general_specs || []
  const accessories = data.accessories || []
  const variations = data.variations || []

  const brand = catalog?.brand || {
    companyName: 'Presys Instrumentos',
    primaryColor: '#003366',
    darkColor: '#001A33',
    website: 'www.presys.com.br',
    phone: '+55 (11) 3038-1300',
    email: 'vendas@presys.com.br',
  }

  return (
    <div className="bg-[#FFFFFF] text-[#171717] w-[210mm] min-h-[297mm] mx-auto select-none shadow-md print:shadow-none print:w-full">
      {/* =========================================================================
          PAGE 1: COVER & PRODUCT OVERVIEW
          ========================================================================= */}
      <section className="a4-page-sheet p-[15mm] flex flex-col justify-between h-[297mm] border-b border-[#E5E5E5] print:border-none relative">
        {/* Top Header Bar */}
        <div>
          <div className="flex items-center justify-between pb-3 border-b-2 border-[#003366]">
            <div className="flex items-center gap-3">
              <div className="bg-[#003366] text-white font-black text-lg px-3 py-1 tracking-widest">
                PRESYS
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#003366]">
                  Calibração e Instrumentação
                </span>
                <span className="text-[9px] text-[#737373] uppercase tracking-tight">
                  Metrology Instruments & Process Solutions
                </span>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs font-mono-data font-bold bg-[#1A1A2E] text-white px-2 py-0.5">
                {product.sku}
              </span>
            </div>
          </div>

          {/* Titles & Hero Category */}
          <div className="mt-4 mb-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#2563EB]">
              {marketing.subtitle || 'Controladores e Calibradores Automáticos de Pressão'}
            </span>
            <h1 className="text-xl font-black text-[#001A33] tracking-tight mt-0.5 leading-tight">
              {marketing.title || product.name}
            </h1>
          </div>

          {/* Main Visual & Key Highlights Grid */}
          <div className="grid grid-cols-12 gap-5 mt-4">
            {/* Left: Key Features */}
            <div className="col-span-7 space-y-3">
              <div className="bg-[#FAFAFA] p-3.5 border-l-4 border-[#003366] border border-[#E5E5E5]">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#003366] mb-2 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-[#003366]" />
                  Destaques e Capacidades Técnicas
                </h3>
                <ul className="space-y-1.5">
                  {(marketing.features || []).slice(0, 6).map((feat: string, i: number) => (
                    <li key={i} className="flex items-start gap-1.5 text-[11px] text-[#262626] leading-tight">
                      <span className="w-3.5 h-3.5 bg-[#003366] text-white flex items-center justify-center text-[9px] shrink-0 mt-0.5">
                        ✓
                      </span>
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Description Paragraph */}
              <div className="text-[11px] leading-relaxed text-[#333333] space-y-2">
                <p>{marketing.overview}</p>
              </div>
            </div>

            {/* Right: Technical Highlights Box */}
            <div className="col-span-5 flex flex-col gap-3">
              {/* Product Hero Badge */}
              <div className="h-44 bg-[#F8FAFC] border border-[#D4D4D4] flex flex-col items-center justify-center p-3 relative overflow-hidden">
                <div className="text-center">
                  <div className="w-16 h-16 bg-[#003366] text-white flex items-center justify-center font-bold text-base mx-auto mb-2 shadow-xs">
                    {product.sku.split('-')[1] || 'PCON'}
                  </div>
                  <span className="text-xs font-bold text-[#171717] uppercase tracking-wide block">
                    {product.sku}
                  </span>
                  <span className="text-[10px] text-[#737373]">
                    Gabinete Industrial de Alta Precisão
                  </span>
                </div>
              </div>

              {/* Quick Specs Summary Box */}
              <div className="border border-[#D4D4D4] bg-[#FFFFFF] p-2.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#525252] block border-b border-[#E5E5E5] pb-1 mb-2">
                  Resumo de Metrologia
                </span>
                <div className="space-y-1 text-[11px]">
                  <div className="flex justify-between py-0.5 border-b border-[#F5F5F5]">
                    <span className="text-[#737373]">Faixa:</span>
                    <span className="font-mono-data font-bold text-[#171717]">
                      {typeof pressureSpecs.control_range === 'object'
                        ? `${pressureSpecs.control_range?.min} a ${pressureSpecs.control_range?.max} ${pressureSpecs.control_range?.unit}`
                        : String(pressureSpecs.control_range || 'Vácuo a 210 bar')}
                    </span>
                  </div>
                  <div className="flex justify-between py-0.5 border-b border-[#F5F5F5]">
                    <span className="text-[#737373]">Estabilidade:</span>
                    <span className="font-mono-data font-bold text-[#171717]">
                      {typeof pressureSpecs.control_stability === 'object'
                        ? `± ${pressureSpecs.control_stability?.value} ${pressureSpecs.control_stability?.unit}`
                        : String(pressureSpecs.control_stability || '± 0,002% FS')}
                    </span>
                  </div>
                  <div className="flex justify-between py-0.5">
                    <span className="text-[#737373]">Exatidão:</span>
                    <span className="font-mono-data font-bold text-[#171717]">
                      {typeof pressureSpecs.display_accuracy === 'object'
                        ? `± ${pressureSpecs.display_accuracy?.value} ${pressureSpecs.display_accuracy?.unit}`
                        : String(pressureSpecs.display_accuracy || '± 0,012% FS')}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Page 1 Footer */}
        <div className="pt-3 border-t border-[#D4D4D4] flex items-center justify-between text-[10px] text-[#737373]">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <Globe className="w-3 h-3 text-[#003366]" /> {brand.website}
            </span>
            <span className="flex items-center gap-1">
              <Phone className="w-3 h-3 text-[#003366]" /> {brand.phone}
            </span>
            <span className="flex items-center gap-1">
              <Mail className="w-3 h-3 text-[#003366]" /> {brand.email}
            </span>
          </div>
          <span className="font-mono-data font-semibold">Página 1 de 2</span>
        </div>
      </section>

      {/* =========================================================================
          PAGE 2: SPECIFICATIONS, ELECTRICAL CALIBRATOR & ACCESSORIES
          ========================================================================= */}
      <section className="a4-page-sheet p-[15mm] flex flex-col justify-between h-[297mm] relative">
        <div>
          {/* Header */}
          <div className="flex items-center justify-between pb-2 border-b-2 border-[#003366]">
            <span className="text-xs font-black uppercase tracking-wider text-[#003366]">
              Especificações Técnicas Detalhadas — {product.sku}
            </span>
            <span className="text-[10px] font-mono-data text-[#737373]">
              Presys Industrial Datasheet
            </span>
          </div>

          {/* Section 1: Pressure & Metrology Comparison Table */}
          <div className="mt-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#003366] mb-1.5 pb-0.5 border-b border-[#003366]">
              1. Especificações de Controle de Pressão
            </h3>
            <table className="w-full border-collapse border border-[#D4D4D4] text-[10.5px]">
              <thead>
                <tr className="bg-[#1A1A2E] text-white">
                  <th className="p-2 border-r border-[#374151] w-1/3">Parâmetro Metrológico</th>
                  <th className="p-2">Especificação Técnica</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E5E5] font-mono-data">
                <tr className="bg-[#FAFAFA]">
                  <td className="p-2 font-sans font-semibold border-r border-[#E5E5E5]">Faixa de Controle</td>
                  <td className="p-2 font-bold text-[#003366]">
                    {typeof pressureSpecs.control_range === 'object'
                      ? `${pressureSpecs.control_range?.min} a ${pressureSpecs.control_range?.max} ${pressureSpecs.control_range?.unit}`
                      : String(pressureSpecs.control_range || 'Vácuo a 210 bar')}
                  </td>
                </tr>
                <tr>
                  <td className="p-2 font-sans font-semibold border-r border-[#E5E5E5]">Estabilidade de Controle</td>
                  <td className="p-2">
                    {typeof pressureSpecs.control_stability === 'object'
                      ? `± ${pressureSpecs.control_stability?.value} ${pressureSpecs.control_stability?.unit}`
                      : String(pressureSpecs.control_stability || '± 0,002% FS')}
                  </td>
                </tr>
                <tr className="bg-[#FAFAFA]">
                  <td className="p-2 font-sans font-semibold border-r border-[#E5E5E5]">Exatidão de Indicação</td>
                  <td className="p-2 font-bold">
                    {typeof pressureSpecs.display_accuracy === 'object'
                      ? `± ${pressureSpecs.display_accuracy?.value} ${pressureSpecs.display_accuracy?.unit}`
                      : String(pressureSpecs.display_accuracy || '± 0,012% FS')}
                  </td>
                </tr>
                <tr>
                  <td className="p-2 font-sans font-semibold border-r border-[#E5E5E5]">Tempo de Controle</td>
                  <td className="p-2">
                    {typeof pressureSpecs.control_speed === 'object'
                      ? `${pressureSpecs.control_speed?.value} ${pressureSpecs.control_speed?.unit}`
                      : String(pressureSpecs.control_speed || 'Aprox. 10 segundos')}
                  </td>
                </tr>
                <tr className="bg-[#FAFAFA]">
                  <td className="p-2 font-sans font-semibold border-r border-[#E5E5E5]">Fluidos Compatíveis</td>
                  <td className="p-2 font-sans">
                    {pressureSpecs.media_compatibility || 'Gás limpo e seco (ar, nitrogênio ou gases inertes)'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Section 2: Electrical Signals Calibrator */}
          {electricalSpecs.length > 0 && (
            <div className="mt-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#003366] mb-1.5 pb-0.5 border-b border-[#003366]">
                2. Calibrador de Processos Elétricos Integrado
              </h3>
              <table className="w-full border-collapse border border-[#D4D4D4] text-[10px]">
                <thead>
                  <tr className="bg-[#1A1A2E] text-white">
                    <th className="p-1.5 border-r border-[#374151]">Sinal / Função</th>
                    <th className="p-1.5 border-r border-[#374151]">Faixa de Medição</th>
                    <th className="p-1.5 border-r border-[#374151]">Resolução</th>
                    <th className="p-1.5 border-r border-[#374151]">Exatidão</th>
                    <th className="p-1.5">Observação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E5E5] font-mono-data">
                  {electricalSpecs.slice(0, 5).map((item: any, i: number) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-[#FAFAFA]' : 'bg-[#FFFFFF]'}>
                      <td className="p-1.5 font-sans font-semibold border-r border-[#E5E5E5]">{item.signal}</td>
                      <td className="p-1.5 border-r border-[#E5E5E5]">{item.range}</td>
                      <td className="p-1.5 border-r border-[#E5E5E5]">{item.resolution}</td>
                      <td className="p-1.5 font-bold border-r border-[#E5E5E5]">{item.accuracy}</td>
                      <td className="p-1.5 font-sans text-[#525252]">{item.note || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Section 3: General Specs & Accessories */}
          <div className="grid grid-cols-2 gap-4 mt-4">
            {/* General Specs */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#003366] mb-1.5 pb-0.5 border-b border-[#003366]">
                3. Especificações Gerais
              </h3>
              <table className="w-full border-collapse border border-[#D4D4D4] text-[10px]">
                <tbody className="divide-y divide-[#E5E5E5]">
                  {generalSpecs.slice(0, 6).map((item: any, i: number) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-[#FAFAFA]' : 'bg-[#FFFFFF]'}>
                      <td className="p-1.5 font-semibold text-[#525252] border-r border-[#E5E5E5] w-1/2">{item.param}</td>
                      <td className="p-1.5 font-mono-data text-[#171717]">{item.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Accessories */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#003366] mb-1.5 pb-0.5 border-b border-[#003366]">
                4. Acessórios
              </h3>
              <table className="w-full border-collapse border border-[#D4D4D4] text-[10px]">
                <tbody className="divide-y divide-[#E5E5E5]">
                  {accessories.slice(0, 5).map((acc: any, i: number) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-[#FAFAFA]' : 'bg-[#FFFFFF]'}>
                      <td className="p-1.5 font-mono-data font-bold text-[#003366] border-r border-[#E5E5E5] w-24">{acc.code}</td>
                      <td className="p-1.5 text-[#333333]">{acc.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Page 2 Footer */}
        <div className="pt-3 border-t border-[#D4D4D4] flex items-center justify-between text-[10px] text-[#737373]">
          <span>Presys Instrumentos — Todos os direitos reservados. Especificações sujeitas a alterações sem aviso prévio.</span>
          <span className="font-mono-data font-semibold">Página 2 de 2</span>
        </div>
      </section>
    </div>
  )
}
