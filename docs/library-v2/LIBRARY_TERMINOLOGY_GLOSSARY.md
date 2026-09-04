# Glossário Terminológico da Biblioteca Técnica

**Status**: Canônico  
**Documento**: `LIBRARY_TERMINOLOGY_GLOSSARY.md`  
**Total de Termos**: 21 Conceitos  
**Registro de Código**: `src/features/guided-help/help-registry.ts`

---

## Categoria 1: Modelo PIM & Estrutura

### 1. Família de Produtos (`product-family`)
- **Termo Técnico**: `ProductFamily`
- **Sinônimos**: Linha, Série, Grupo de Equipamentos.
- **Definição**: Agrupamento lógico de produtos que compartilham o mesmo princípio físico de operação, arquitetura básica e a maior parte das especificações técnicas (ex: Banhos Térmicos Série TA).
- **Por que importa**: Evita retrabalho ao cadastrar dezenas de instrumentos que compartilham 90% das mesmas características.

### 2. Modelo Físico (`physical-model`)
- **Termo Técnico**: `ProductVariant` / `Product`
- **Sinônimos**: Código Comercial, Part Number, Modelo Real.
- **Definição**: O item concreto que o cliente compra e que sai da linha de produção (ex: TA-25N ou TA-35N).
- **Por que importa**: Possui dimensões, faixas e alimentações elétricas específicas que constarão na nota fiscal e na folha de dados.

### 3. Fato Técnico (`technical-datum`)
- **Termo Técnico**: `SpecificationField` / `ProductDatum`
- **Sinônimos**: Dado Técnico, Especificação, Característica.
- **Definição**: Uma propriedade metrológica ou de engenharia do equipamento (ex: Faixa de Temperatura, Tensão de Alimentação).
- **Por que importa**: É a informação que o engenheiro do cliente usa para homologar o produto na planta.

### 4. Chave Semântica (`semantic-key`)
- **Termo Técnico**: `propertyKey`
- **Sinônimos**: ID do campo, Token de propriedade.
- **Definição**: Identificador único em formato de código de computador (ex: `specs.range`, `specs.accuracy`) usado internamente pelo sistema.
- **Por que importa**: Garante consistência automatizada nas tabelas e integrações de catálogo sem erros de digitação.

### 5. Regra de Herança (`inheritance`)
- **Termo Técnico**: `PrototypeInheritance`
- **Sinônimos**: Propagação de valor, Valor compartilhado.
- **Definição**: Mecanismo onde todos os modelos de uma família herdam automaticamente uma especificação definida na família-mãe.
- **Por que importa**: Se a garantia do banho térmico for de 2 anos, basta alterar na família para que todos os 10 modelos recebam o valor instantaneamente.

### 6. Sobrescrita / Exceção do Modelo (`override`)
- **Termo Técnico**: `FieldOverride`
- **Sinônimos**: Exceção técnica, Valor pontual.
- **Definição**: Quando um modelo físico específico precisa de um valor diferente da regra geral da família (ex: o TA-35N opera até 350 °C, enquanto a família opera até 250 °C).
- **Por que importa**: Permite flexibilidade de engenharia sem quebrar a consistência geral da família.

---

## Categoria 2: Metrologia & Validação de Dados

### 7. Faixa de Medição / Trabalho (`measurement-range`)
- **Termo Técnico**: `OperatingRange`
- **Sinônimos**: Span, Intervalo de trabalho.
- **Definição**: Limite inferior e superior em que o instrumento opera com segurança e conformidade metrológica.
- **Por que importa**: Determina onde o instrumento pode ser instalado na indústria.

### 8. Incerteza / Exatidão (`uncertainty`)
- **Termo Técnico**: `AccuracySpecification`
- **Sinônimos**: Tolerância, Erro máximo permitido.
- **Definição**: Limite máximo de desvio do valor medido em relação ao padrão nacional de metrologia (ex: ± 0,1 °C).
- **Por que importa**: Fator crítico para clientes auditados por normas como ISO/IEC 17025 e FDA.

### 9. Estabilidade Térmica (`stability`)
- **Termo Técnico**: `ThermalStability`
- **Sinônimos**: Variação temporal, Drift.
- **Definição**: Capacidade do banho ou calibrador de manter a mesma temperatura ao longo do tempo (ex: ± 0,05 °C ao longo de 30 min).
- **Por que importa**: Garante calibrações confiáveis e repetitivas em laboratórios.

### 10. Unidade de Engenharia (`metrological-unit`)
- **Termo Técnico**: `UnitOfMeasure`
- **Sinônimos**: Grandeza, Unidade SI.
- **Definição**: Símbolo oficial de medição associado a um valor numérico (ex: °C, bar, mA, V, mm).
- **Por que importa**: Evita desastres de interpretação como confusão entre Celsius e Fahrenheit ou Bar e PSI.

### 11. Conexão ao Processo (`process-connection`)
- **Termo Técnico**: `ProcessMounting`
- **Sinônimos**: Rosca, Flange, Bloco equalizador, Insert.
- **Definição**: Interface física pela qual o sensor ou calibrador se acopla ao processo ou ao termômetro a ser calibrado.
- **Por que importa**: Garante que o usuário final compre os adaptadores e blocos compatíveis.

### 12. Grau de Proteção (`protection-degree`)
- **Termo Técnico**: `IngressProtection` / `IPRating`
- **Sinônimos**: Norma IP, Selamento mecânico.
- **Definição**: Classificação segundo a norma IEC 60529 que define o nível de proteção contra poeira e água (ex: IP-54, IP-67).
- **Por que importa**: Define se o equipamento pode ficar exposto a chuva, poeira ou respingos industriais.

---

## Categoria 3: Governança, Fontes & Auditoria

### 13. Documento de Referência Primária (`source-document`)
- **Termo Técnico**: `SourceDocument`
- **Sinônimos**: Fonte de verdade, Manual mestre.
- **Definição**: Arquivo PDF oficial emitido pela engenharia (manual, folha de dados ou memorial de cálculo) do qual os fatos foram extraídos.
- **Por que importa**: Nenhum dado entra no catálogo sem uma fonte oficial comprovada.

### 14. Trecho de Evidência (`evidence-snippet`)
- **Termo Técnico**: `EvidenceSnippet`
- **Sinônimos**: Citação, Trecho do manual.
- **Definição**: Recorte exato de texto ou tabela do documento original com número de página e data.
- **Por que importa**: Permite que qualquer auditor comprove visualmente a origem de cada número no catálogo.

### 15. Nível de Confiança da Evidência (`confidence-score`)
- **Termo Técnico**: `ProvenanceConfidence`
- **Sinônimos**: Grau de certeza, Confiabilidade.
- **Definição**: Métrica percentual que avalia a atualidade e a autoridade da fonte que informa aquele dado.
- **Por que importa**: Sinaliza dados antigos ou extraídos de documentos provisórios que precisam de validação.

### 16. Conflito Documental (`conflict`)
- **Termo Técnico**: `DataDispute`
- **Sinônimos**: Divergência, Inconsistência técnica.
- **Definição**: Situação em que dois documentos oficiais informam valores diferentes para a mesma especificação técnica.
- **Por que importa**: Impede que catálogos cheguem ao mercado com dados contraditórios.

### 17. Decisão Canônica (`canonical-decision`)
- **Termo Técnico**: `CanonicalResolution`
- **Sinônimos**: Arbitragem de engenharia, Valor oficial.
- **Definição**: Registro formal e imutável assinado pelo engenheiro responsável determinando qual valor é verdadeiro e qual foi descartado.
- **Por que importa**: Cria histórico técnico perene e elimina reincidência de dúvidas.

### 18. Trilha de Auditoria (`audit-trail`)
- **Termo Técnico**: `AuditLog`
- **Sinônimos**: Histórico de alterações, Linha do tempo.
- **Definição**: Registro cronológico de quem alterou qual especificação, em que data e com qual justificativa técnica.
- **Por que importa**: Conformidade com normas de governança e rastreabilidade total de dados.

---

## Categoria 4: Catálogo Editorial & Publicação

### 19. Bloco de Catálogo (`catalog-block`)
- **Termo Técnico**: `EditorialBlock`
- **Sinônimos**: Módulo de página, Componente de layout.
- **Definição**: Elemento visual do catálogo editorial (tabela, ficha de produto, diagrama) conectado em tempo real aos dados da biblioteca.
- **Por que importa**: Quando um dado é atualizado na Library, todos os blocos do catálogo editorial refletem a mudança imediatamente.

### 20. Matriz Comparativa (`comparative-matrix`)
- **Termo Técnico**: `ComparisonTable`
- **Sinônimos**: Tabela de seleção, Grade comparativa.
- **Definição**: Formato tabular onde as linhas são especificações e as colunas são os modelos da família, facilitando a escolha do cliente.
- **Por que importa**: É a tabela mais consultada por engenheiros de compras industriais.

### 21. Esquema Canônico JSON-LD (`json-ld-export`)
- **Termo Técnico**: `SchemaOrgProduct`
- **Sinônimos**: Dados estruturados, Metadados semânticos.
- **Definição**: Formato digital padrão da W3C / Schema.org que exporta os dados do produto para indexação em buscadores e integração com ERPs.
- **Por que importa**: Garante interoperabilidade universal dos dados do catálogo com qualquer sistema externo.
