# 🛠️ Technical Catalog Builder & Editor Platform (A4 Industrial Publishing)

> **Plataforma de Construção, Gestão e Edição de Catálogos Técnicos e Industriais de Alta Precisão (210 × 297 mm A4 Editorial)**.

Construída para atender aos padrões rigorosos de metrologia, calibração, instrumentação industrial e engenharia. Projetada para permitir a criação rápida, auditoria técnica e edição visual/manual livre de catálogos e datasheets de qualquer família de produtos.

---

## 🌟 Principais Funcionalidades

1. **Estrutura 100% Dinâmica e Genérica**:
   - Não acoplada a um produto fixo — suporta qualquer família de instrumentos (Pressão, Temperatura, Válvulas, Sensores, Elétrica, etc.).
   - Páginas A4 dinâmicas: adicione, remova, reordene e personalize quantas páginas forem necessárias.
   - Blocos modulares reutilizáveis (`hero_banner`, `specs_table`, `features_list`, `electrical_table`, `accessories_table`, `image_gallery`, `comparison_grid`, `custom_table`, etc.).

2. **Confluência Total (Sidebar ↔ Formulário ↔ Visual Preview)**:
   - As abas do formulário técnico de edição são geradas em tempo real a partir das páginas e seções cadastradas.
   - Renomeie, adicione ou remova blocos em qualquer lugar e a interface atualiza instantaneamente.

3. **Modo de Edição Visual Direto (WYSIWYG Industrial)**:
   - **Edição Inline**: Edite títulos, subtítulos, textos e células de tabela diretamente clicando na folha A4.
   - **Inspector de Bloco 🎨**: Controle granular de cores de destaque, cores de fundo, tamanhos de fonte (px), alinhamento de texto, margens (mm), padding (mm) e largura de coluna (100%, 50% lado a lado, 33%).
   - **Botão de Salvamento Manual**: Salve todas as alterações com confirmação visual.
   - **Zero Interferência no PDF**: Ao desativar o modo de edição, o layout fica limpo, milimétrico e 100% pronto para impressão/exportação em PDF.

4. **Planilha Técnica Integrada (Grid Mode)**:
   - Visualização de matriz tabular estilo Google Sheets / Excel para edição rápida em lote de produtos e especificações.

5. **Importador de Dados**:
   - Suporte a importação via arquivos de planilha (Excel/CSV) e extração assistida por IA com validação de esquema.

6. **Assistente de IA & Auditoria**:
   - Interface com Gemini para processamento de comandos de voz/texto, com sistema de aprovação humana (*Staged Changes*) antes de aplicar qualquer alteração nos dados técnicos.

---

## 🏗️ Arquitetura Técnica

```
catalog-builder/
├── app/
│   ├── api/ai/chat/          # Rota proxy para Gemini AI com system prompt metrológico
│   ├── globals.css           # Design tokens, CSS @page A4 e tipografia técnica
│   ├── layout.tsx            # Root layout
│   └── page.tsx              # Workspace central (Toolbar, Sidebar, Editor, Preview, Status)
├── components/
│   ├── ai/                   # Painel de IA, assistente e modal de staged changes
│   ├── data-grid/            # Planilha tabular técnica de produtos
│   ├── forms/                # Formulário unificado de seções e modal de importação Excel
│   ├── layout/               # Toolbar de precisão, Sidebar com abas Produtos/Páginas, StatusBar
│   ├── pages/                # Gerenciador de páginas, seletor de tipos de bloco
│   └── preview/              # Renderizador dinâmico de N páginas A4, seções individuais e BlockInspector
├── features/
│   └── editor/
│       └── editor-store.ts   # Zustand Store central com Immer, histórico Undo/Redo e ações dinâmicas
├── lib/
│   ├── data/                 # Presets do sistema, tokens padrão e sementes de demonstração
│   ├── types/
│   │   ├── catalog-builder.ts# Tipos fundamentais: CatalogPage, PageSection, SectionStyle, CatalogPreset
│   │   └── database.ts       # Tipos do banco de dados (Catalog, Product, FieldDefinition, AuditLog, AiRun)
│   └── validators/           # Regras de validação técnica e metrológica
└── supabase/
    └── schema.sql            # Schema PostgreSQL com triggers de auditoria automática e RLS
```

---

## 📋 Modelo de Dados

### 1. `CatalogPage` & `PageSection`
```typescript
export interface CatalogPage {
  id: string
  title: string
  sort_order: number
  visible: boolean
  sections: PageSection[]
}

export interface PageSection {
  id: string
  type: SectionType // 'hero_banner' | 'specs_table' | 'features_list' | ...
  title: string
  config: Record<string, any>
  content: any
  style?: SectionStyle
  sort_order: number
  visible: boolean
}

export interface SectionStyle {
  backgroundColor?: string
  textColor?: string
  accentColor?: string
  borderColor?: string
  borderWidthPx?: number
  borderStyle?: 'solid' | 'dashed' | 'none'
  fontSizePx?: number
  titleFontSizePx?: number
  paddingMm?: number
  marginBottomMm?: number
  widthPercent?: number // 100, 50, 33
  align?: 'left' | 'center' | 'right' | 'justify'
  showBorder?: boolean
  hideHeader?: boolean
}
```

---

## 🚀 Como Executar Localmente

### Pré-requisitos
- Node.js 18+ ou 20+
- npm, pnpm ou bun

### Instalação

```bash
# 1. Clone o repositório
git clone https://github.com/avaranda66-oss/catalog-builder-technical.git

# 2. Acesse a pasta
cd catalog-builder-technical

# 3. Instale as dependências
npm install

# 4. Inicie o servidor de desenvolvimento com Turbopack
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000) no seu navegador.

## 🔁 Reconstrução AIOX

Esta branch (`codex/catalogbuilder-rebuild`) preserva o editor visual do commit `1e93d6d` e evolui domínio, persistência e colaboração por stories. O diretório original continua separado para comparação.

Documentos de decisão:

- `docs/briefing.md` — visão, requisitos confirmados e perguntas abertas;
- `docs/prd.md` — requisitos funcionais, não funcionais e roadmap;
- `docs/architecture.md` — camadas e fronteiras de infraestrutura;
- `docs/frontend/frontend-spec.md` — contrato de preservação visual;
- `docs/stories/` — critérios, file list e validação de cada fatia.

Comandos adicionais:

```bash
npm run health:check
npm run catalog:validate -- validate-product tests/fixtures/product-valid.json
npm test
npm run typecheck
npm run lint
```

### Verificação de Tipos

```bash
npx tsc --noEmit
```

---

## 🔍 Guia para Auditoria por Outros Modelos de IA (Perplexity, Claude, GPT)

Ao auditar este repositório, atente-se aos seguintes pontos-chave de arquitetura:
1. **Flexibilidade e Extensibilidade**: Avalie `lib/types/catalog-builder.ts` e `features/editor/editor-store.ts` para verificar como novas seções e presets podem ser adicionados sem alterar a camada de visualização.
2. **Separação de Preocupações**: A renderização A4 (`components/preview/dynamic-renderer.tsx`) é desacoplada do formulário de entrada (`components/forms/product-form.tsx`), permitindo alternância entre edição visual, edição assistida por formulário e edição por planilha.
3. **Integridade de Estado & Imutabilidade**: Zustand + Immer gerencia o estado atômico com histórico completo de Undo/Redo e salvamento de snapshots.
4. **Fidelidade de Impressão**: `app/globals.css` define `@page { size: A4 portrait; margin: 0; }` com dimensões CSS exatas de `210mm × 297mm` para exportação direta em PDF via browser sem quebras de página indesejadas.

---

## 📄 Licença

Proprietário / Uso Técnico Industrial.
