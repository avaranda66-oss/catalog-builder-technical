// src/components/library-v2/LibraryV2Container.tsx
// Container Principal da Library V2 Guided com orquestração das 8 seções e do sistema de aprendizado.

import React, { useState } from 'react';
import { useLibraryStore } from '../../stores/useLibraryStore';
import { Product } from '../../domain/product.schema';
import {
  LearnModeProvider,
  ContextHelpDrawer,
  GlossaryDrawer,
  PageTour,
  TaskTutorialModal
} from '../guided-help/index';
import { LibraryV2Header } from './LibraryV2Header';
import { LibraryV2Sidebar, LibraryV2SectionId } from './LibraryV2Sidebar';

// 8 Seções Funcionais da Library V2
import { OverviewSection } from './sections/OverviewSection';
import { TechnicalDataSection } from './sections/TechnicalDataSection';
import { TechnicalTablesSection } from './sections/TechnicalTablesSection';
import { DocumentsSection } from './sections/DocumentsSection';
import { SourcesEvidenceSection } from './sections/SourcesEvidenceSection';
import { ConflictsSection } from './sections/ConflictsSection';
import { OrganizationSection } from './sections/OrganizationSection';
import { AdvancedSection } from './sections/AdvancedSection';

export interface LibraryV2ContainerProps {
  onSwitchToClassic: () => void;
}

export const LibraryV2Container: React.FC<LibraryV2ContainerProps> = ({ onSwitchToClassic }) => {
  const {
    products,
    families,
    selectedFamily,
    setSelectedFamily,
    getColumnsForFamily,
    addProduct
  } = useLibraryStore();

  const [activeSection, setActiveSection] = useState<LibraryV2SectionId>('overview');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');

  const availableFamilies = families.length > 0
    ? families.map((f) => f.name)
    : Array.from(new Set(products.map((p) => p.family || 'Geral')));

  const currentFamily = selectedFamily || availableFamilies[0] || '';
  const activeFamilyObj = families.find(
    (f) => f.name === currentFamily || f.slug === currentFamily || f.id === currentFamily
  );

  const familyColumns = currentFamily ? getColumnsForFamily(currentFamily) : [];

  const filteredProducts = products.filter((p) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      p.code?.toLowerCase().includes(term) ||
      p.model?.toLowerCase().includes(term) ||
      p.description?.toLowerCase().includes(term)
    );
  });

  const handleOpenAddProduct = async () => {
    const code = prompt('Digite o código do novo modelo (ex: TA-60N):');
    if (!code?.trim()) return;

    const newProd: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'version'> = {
      code: code.trim(),
      family: currentFamily,
      model: code.trim(),
      description: 'Novo modelo cadastrado via Library V2',
      specs: {
        range: '',
        unit: '',
        accuracy: '',
        output: '',
        powerSupply: '',
        processConnection: '',
        protectionDegree: '',
        customSpecs: {}
      },
      imageUrl: ''
    };
    await addProduct(newProd);
  };

  return (
    <LearnModeProvider>
      <div className="h-full flex flex-col bg-slate-100 font-sans text-slate-900 overflow-hidden select-none">
        {/* Cabeçalho da Library V2 */}
        <LibraryV2Header
          currentFamily={currentFamily}
          selectedProduct={selectedProduct}
          searchTerm={searchTerm}
          onSearchTermChange={setSearchTerm}
          onSwitchToClassic={onSwitchToClassic}
          onClearProductSelection={() => setSelectedProduct(null)}
        />

        {/* Corpo com Navegação Lateral e Seção Ativa */}
        <div className="flex-1 flex overflow-hidden">
          <LibraryV2Sidebar
            activeSection={activeSection}
            onSelectSection={setActiveSection}
            metrics={{
              productsCount: products.filter((p) => p.family === currentFamily || !p.family).length,
              specsCount: 7,
              tablesCount: 1,
              documentsCount: 2,
              sourcesCount: 3,
              conflictsCount: 0
            }}
          />

          {/* Área Principal de Conteúdo */}
          <main className="flex-1 overflow-y-auto p-6">
            <div className="max-w-6xl mx-auto">
              {activeSection === 'overview' && (
                <OverviewSection
                  currentFamily={currentFamily}
                  activeFamilyObj={activeFamilyObj}
                  families={families}
                  products={filteredProducts}
                  selectedProduct={selectedProduct}
                  onSelectFamily={setSelectedFamily}
                  onSelectProduct={setSelectedProduct}
                  onOpenAddProduct={handleOpenAddProduct}
                  onNavigateSection={(sec) => setActiveSection(sec as LibraryV2SectionId)}
                />
              )}

              {activeSection === 'technical-data' && (
                <TechnicalDataSection
                  currentFamily={currentFamily}
                  activeFamilyObj={activeFamilyObj}
                  selectedProduct={selectedProduct}
                  familyColumns={familyColumns}
                  onOpenAddDatum={() => alert('Formulário de nova especificação técnica')}
                  onOpenSourceDrawer={(key) => alert(`Inspecionando fonte do campo: ${key}`)}
                />
              )}

              {activeSection === 'technical-tables' && (
                <TechnicalTablesSection
                  currentFamily={currentFamily}
                  activeFamilyObj={activeFamilyObj}
                  products={filteredProducts}
                />
              )}

              {activeSection === 'documents' && (
                <DocumentsSection currentFamily={currentFamily} />
              )}

              {activeSection === 'sources' && (
                <SourcesEvidenceSection currentFamily={currentFamily} />
              )}

              {activeSection === 'conflicts' && (
                <ConflictsSection currentFamily={currentFamily} />
              )}

              {activeSection === 'organization' && (
                <OrganizationSection currentFamily={currentFamily} />
              )}

              {activeSection === 'advanced' && (
                <AdvancedSection currentFamily={currentFamily} />
              )}
            </div>
          </main>
        </div>

        {/* Componentes de Ajuda Contextual Globais */}
        <ContextHelpDrawer />
        <GlossaryDrawer />
        <PageTour />
        <TaskTutorialModal />
      </div>
    </LearnModeProvider>
  );
};
