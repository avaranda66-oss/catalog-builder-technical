import { createPage, createSection, type CatalogPage } from '../types/catalog-builder'

export interface DocumentTemplate { id: string; name: string; description: string; createPages: () => CatalogPage[] }

export const DOCUMENT_TEMPLATES: DocumentTemplate[] = [
  { id: 'institutional', name: 'Apresentação institucional', description: 'Capa editorial, apresentação da empresa, galeria e contato. Conteúdo independente de produtos.', createPages: () => [
    createPage('Apresentação', [createSection('hero_banner', { config: { dataSource: 'section', showLogo: true, showImage: true }, content: { title: '', subtitle: '', overview: '', images: [] } })]),
    createPage('Empresa e soluções', [createSection('text_block', { title: 'Quem somos', content: { text: '' } }), createSection('image_gallery', { title: 'Estrutura e aplicações', content: { images: [] } }), createSection('contact_footer')]),
  ] },
  { id: 'technical', name: 'Ficha técnica de produto', description: 'Capa, especificações e sinais elétricos vinculados ao cadastro, sem copiar valores para o layout.', createPages: () => [
    createPage('Produto', [createSection('hero_banner'), createSection('contact_footer')]),
    createPage('Dados técnicos', [createSection('specs_table'), createSection('electrical_table')]),
    createPage('Instalação e acessórios', [createSection('general_specs_table'), createSection('accessories_table'), createSection('contact_footer')]),
  ] },
  { id: 'selection', name: 'Guia de seleção', description: 'Comparativo de modelos, notas de seleção e tabela de códigos de encomenda editável.', createPages: () => [
    createPage('Comparativo de modelos', [createSection('comparison_grid'), createSection('text_block', { title: 'Critérios de seleção', content: { text: '' } })]),
    createPage('Como especificar', [createSection('ordering_codes'), createSection('contact_footer')]),
  ] },
]

export function orderTemplatePages(pages: CatalogPage[]): CatalogPage[] {
  return pages.map((page, index) => ({ ...page, sort_order: index }))
}
