# Glossário de Conceitos Explicados pela Ajuda Guiada

**Finalidade**: Exclusivamente Educacional / Editorial (Guided Help)  
**Status**: Referência de Vocabulário para Usuários e Operadores  
**Documento**: `LIBRARY_TERMINOLOGY_GLOSSARY.md`  
**Total de Termos**: 20 Conceitos Didáticos  
**Fonte de Implementação**: `src/features/guided-help/help-registry.ts`

> [!NOTE]
> Este glossário tem propósito estritamente pedagógico. Ele visa traduzir a terminologia de dados industriais e metrologia para uma linguagem clara e acessível, sem substituir as definições formais de domínio mantidas pelos esquemas de engenharia (`product.schema.ts`).

---

## Categoria 1: Estrutura de Produtos & Catálogo

### 1. Família de Produtos (`family`)
- **Termo Técnico**: `ProductFamily`
- **Sinônimos**: Linha de Produtos, Série, Grupo.
- **Definição**: Agrupamento lógico de produtos que compartilham o mesmo princípio de funcionamento, arquitetura de engenharia e conjunto base de especificações (ex: Banhos Térmicos Série TA).
- **Por que importa**: Evita retrabalho, pois os dados definidos na família são compartilhados com todos os modelos.

### 2. Modelo Físico (`product`)
- **Termo Técnico**: `ProductVariant` / `Product`
- **Sinônimos**: Código Comercial, Part Number, Modelo Real.
- **Definição**: O instrumento concreto comercializado e fabricado (ex: TA-25N ou TA-35N).
- **Por que importa**: Possui dimensões, faixas e alimentações elétricas específicas que constarão na nota fiscal e na folha de dados.

### 3. Fato Técnico (`technical-datum`)
- **Termo Técnico**: `SpecificationField` / `ProductDatum`
- **Sinônimos**: Dado Técnico, Especificação, Característica.
- **Definição**: Uma propriedade técnica ou metrológica do equipamento (ex: Faixa de Temperatura, Tensão de Alimentação).
- **Por que importa**: É o valor consultado pelo cliente para selecionar e homologar o instrumento.

### 4. Chave Semântica (`semantic-key`)
- **Termo Técnico**: `propertyKey`
- **Sinônimos**: ID do campo, Token de propriedade.
- **Definição**: Identificador único em formato computacional (ex: `specs.range`, `specs.accuracy`) usado internamente pelo sistema.
- **Por que importa**: Garante consistência automatizada nas tabelas e integrações de catálogo sem ambiguidades.

### 5. Regra de Herança (`inheritance`)
- **Termo Técnico**: `PrototypeInheritance`
- **Sinônimos**: Propagação de valor, Valor compartilhado.
- **Definição**: Mecanismo onde os modelos físicos herdam automaticamente as propriedades definidas na família.
- **Por que importa**: Centraliza a manutenção e garante que alterações gerais reflitam em toda a linha de produtos.

### 6. Sobrescrita / Exceção do Modelo (`override`)
- **Termo Técnico**: `FieldOverride`
- **Sinônimos**: Exceção técnica, Valor pontual.
- **Definição**: Situação em que um modelo físico específico possui uma especificação diferente do padrão geral da família.
- **Por que importa**: Permite flexibilidade de engenharia para modelos de alta capacidade sem quebrar o padrão dos demais.

---

## Categoria 2: Metrologia & Validação de Dados

### 7. Faixa de Medição / Trabalho (`measurement-range`)
- **Termo Técnico**: `OperatingRange`
- **Sinônimos**: Span, Intervalo operacional.
- **Definição**: Limite inferior e superior em que o instrumento opera com conformidade e segurança.
- **Por que importa**: Determina o limite de aplicação do instrumento na planta do cliente.

### 8. Incerteza / Exatidão (`uncertainty`)
- **Termo Técnico**: `AccuracySpecification`
- **Sinônimos**: Tolerância, Erro máximo permitido.
- **Definição**: Limite máximo de desvio do valor medido em relação ao padrão nacional de metrologia (ex: ± 0,1 °C).
- **Por que importa**: Fator decisivo em auditorias de qualidade laboratorial e industrial.

### 9. Estabilidade Térmica (`stability`)
- **Termo Técnico**: `ThermalStability`
- **Sinônimos**: Variação temporal, Drift.
- **Definição**: Capacidade do equipamento de manter o valor estável ao longo do tempo durante uma medição.
- **Por que importa**: Assegura calibrações reprodutíveis e confiáveis em laboratório.

### 10. Unidade de Engenharia (`metrological-unit`)
- **Termo Técnico**: `UnitOfMeasure`
- **Sinônimos**: Grandeza, Unidade SI.
- **Definição**: Símbolo oficial de medição associado a um valor numérico (ex: °C, bar, mA, V, mm).
- **Por que importa**: Evita ambiguidades entre escalas diferentes (ex: Celsius vs Fahrenheit).

### 11. Conexão ao Processo (`process-connection`)
- **Termo Técnico**: `ProcessMounting`
- **Sinônimos**: Rosca, Flange, Bloco equalizador, Insert.
- **Definição**: Acoplamento mecânico pelo qual o sensor ou calibrador se conecta ao processo industrial.
- **Por que importa**: Garante que o cliente selecione os adaptadores e poços compatíveis.

### 12. Grau de Proteção (`protection-degree`)
- **Termo Técnico**: `IngressProtection` / `IPRating`
- **Sinônimos**: Norma IP, Selamento de invólucro.
- **Definição**: Classificação conforme norma IEC 60529 que define a vedação contra poeira e água (ex: IP-54).
- **Por que importa**: Determina a adequação do instrumento a ambientes úmidos ou empoeirados.

---

## Categoria 3: Governança, Fontes & Evidências

### 13. Documento de Referência Primária (`source-document`)
- **Termo Técnico**: `SourceDocument`
- **Sinônimos**: Fonte de verdade, Manual mestre.
- **Definição**: Arquivo técnico emitido pela engenharia (manual, folha de dados ou memorial) de onde os fatos são extraídos.
- **Por que importa**: Garante embasamento documental auditável para cada valor publicado.

### 14. Trecho de Evidência (`evidence`)
- **Termo Técnico**: `EvidenceSnippet`
- **Sinônimos**: Citação, Recorte do manual.
- **Definição**: Trecho textual ou recorte de tabela do documento original com indicação de página e seção.
- **Por que importa**: Permite auditoria imediata da proveniência do dado em caso de revisão.

### 15. Conflito Documental (`conflict`)
- **Termo Técnico**: `DataDispute`
- **Sinônimos**: Divergência, Inconsistência técnica.
- **Definição**: Situação em que dois documentos ou fontes informam valores diferentes para a mesma propriedade.
- **Por que importa**: Evita que contradições de especificações cheguem ao catálogo final.

### 16. Decisão Canônica (`canonical-decision`)
- **Termo Técnico**: `CanonicalResolution`
- **Sinônimos**: Arbitragem de engenharia, Resolução técnica.
- **Definição**: Registro formal assinado pelo engenheiro responsável determinando o valor oficial adotado e a justificativa técnica.
- **Por que importa**: Cria histórico imutável e resolve disputas metrológicas permanentemente.

### 17. Trilha de Auditoria (`audit-trail`)
- **Termo Técnico**: `AuditLog`
- **Sinônimos**: Histórico de alterações, Linha do tempo.
- **Definição**: Registro cronológico de autoria, data e justificativa técnica de cada modificação.
- **Por que importa**: Conformidade com boas práticas de governança e rastreabilidade de dados.

---

## Categoria 4: Catálogo Editorial & Publicação

### 18. Bloco de Catálogo (`catalog-block`)
- **Termo Técnico**: `EditorialBlock`
- **Sinônimos**: Componente de página, Módulo editorial.
- **Definição**: Elemento visual do catálogo (tabela, bloco de especificações, imagem) vinculado aos dados da biblioteca.
- **Por que importa**: Sincroniza em tempo real as atualizações de especificações com o layout das páginas.

### 19. Matriz Comparativa (`dataset`)
- **Termo Técnico**: `TechnicalDataset` / `ComparisonTable`
- **Sinônimos**: Tabela de seleção, Grade comparativa.
- **Definição**: Grade onde linhas são especificações e colunas são os modelos da família, facilitando a comparação pelo comprador.
- **Por que importa**: É a principal ferramenta de decisão em propostas técnicas comerciais.

### 20. Módulo Técnico (`module`)
- **Termo Técnico**: `TechnicalModule`
- **Sinônimos**: Capítulo, Seção temática.
- **Definição**: Agrupamento temático de fatos técnicos (ex: Metrologia, Elétrica, Mecânica) que mantém a ordem de apresentação consistente.
- **Por que importa**: Organiza o caderno técnico em capítulos lógicos e legíveis.
