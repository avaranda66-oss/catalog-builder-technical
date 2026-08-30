import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'PCON Catalog Builder — Plataforma de Catálogos Técnicos Industriais',
  description:
    'Plataforma de gestão, edição e geração de catálogos e datasheets técnicos de metrologia e calibração de pressão.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR" className="h-full">
      <body className="h-full antialiased overflow-hidden select-none bg-[#FAFAFA]">
        {children}
      </body>
    </html>
  )
}
