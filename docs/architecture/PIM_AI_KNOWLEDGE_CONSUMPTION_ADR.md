# ADR: Contrato de Consumo de Conhecimento por IA e Preservação Estrita de Proveniência (PIM.AI.KNOWLEDGE.CONSUMPTION)

- **Status:** Aprovado / Implementado na Fundação
- **Data:** 2026-09-04
- **Autor:** Architecture & AI Knowledge Engineering Pair
- **Contexto:** Framework Synkra AIOS / PIM Core V2 / Mega Product Workspace Foundation

---

## 1. Contexto & Problema

Sistemas convencionais de PIM frequentemente tratam dados de produto de forma achatada (strings soltas de chave-valor) ou expõem internismos de banco de dados diretamente aos usuários e agentes de IA. Quando agentes LLM consomem catálogos industriais sem contratos tipados e sem proveniência formal, ocorrem dois riscos críticos:
1. **Alucinação de Especificações:** O modelo infere ou "completa" faixas e exatidões técnicas sem respaldo documental;
2. **Quebra de Integrações em Renomeações Humanas:** Quando um usuário altera o rótulo de uma especificação (ex: de "Estabilidade" para "Estabilidade Térmica"), sistemas ingênuos renomeiam a chave canônica, quebrando scripts, queries de IA e integrações de ERP/MES.

Para calibradores de processos industriais de alta precisão (Presys TA-25N, TA-35N, TA-50N, PCON), onde erros de milivolts ou décimos de grau Celsius afetam segurança e auditorias metrológicas (ISO/IEC 17025), a integridade da verdade e a rastreabilidade da fonte precisam ser invioláveis.

---

## 2. Decisões Arquiteturais Fundamentais

### 2.1 Separação em Quatro Camadas de Identidade

Para harmonizar a experiência humana com a precisão exigida por IA e software, estabelecemos quatro camadas estritas de identidade:

| Camada | Nome | Mutabilidade | Finalidade | Exemplos |
| :--- | :--- | :---: | :--- | :--- |
| **A** | **Machine Identity** | Imutável | Chaves primárias e integridade referencial relacional | `datum.id`, `dataset.id`, `module.id`, UUIDs |
| **B** | **Canonical Semantic Identity** | Estável / Controlada | Vocabulário canônico do ecossistema e software | `semanticKey` (`metrology.temperature.range`) |
| **C** | **Human Presentation** | Livremente Editável | Compreensão humana e customização de catálogo | `displayLabel`, títulos de seção, tabelas |
| **D** | **AI Semantic Aliases** | Livremente Expansível | Recuperação semântica, sinônimos e busca vetorial | `aliases[]` ("faixa térmica", "temperatura de trabalho") |

#### Invariante de Segurança
O usuário comum pode renomear livremente `"Estabilidade Térmica"` para `"Estabilidade de Bloco Seco"` na interface visual:
- O `displayLabel` é atualizado instantaneamente;
- O label antigo é automaticamente anexado aos `aliases`;
- A `canonicalSemanticKey` permanece estritamente **`metrology.temperature.stability`**;
- Nenhuma integração, agente de IA ou script é quebrado.

---

### 2.2 O Contrato Tipado `AiProductKnowledgeEnvelope`

A inteligência artificial não consome strings brutas desestruturadas nem JSON de banco sem contexto. O domínio exporta a função pura:
```ts
buildAiProductKnowledgeEnvelope({ workbook, effectiveKnowledge, sources, layout }): AiProductKnowledgeEnvelope
```

Cada informação técnica é empacotada em um `AiDatumEnvelope`:
- `datumId`: Identificador de máquina estável;
- `canonicalSemanticKey`: Chave canônica indexada;
- `displayLabel`: Nome legível humano;
- `aliases`: Sinônimos para matching contextual;
- `typedValue`: Valor técnico discriminado (`range`, `quantity`, `text`, `number`, etc.);
- `formattedValue`: Representação textual elegante com unidades SI;
- `status`: Status de ciclo de vida (`draft`, `verified`, `approved`, `conflicting`, `deprecated`);
- `owner` / `sourceOwner`: Origem de propriedade (`product` vs `family`);
- `moduleMemberships`: Módulos de engenharia aos quais pertence;
- `datasetMemberships`: Tabelas e matrizes em que está inserido (com coordenadas de linha e coluna);
- `evidenceReferences`: Rastro completo de evidências documentais;
- `sourceDocuments`: Metadados oficiais dos documentos citados (revisão, idioma, tipo);
- `canonicalDecision`: Rationale formal caso tenha havido divergência documental;
- `inheritanceProvenance`: Linhagem de herança da família e indicação de override;
- `hasProvenance`: Flag booleana estrita indicando se há respaldo documental comprovado.

---

### 2.3 Rastreabilidade de Proveniência em 6 Níveis (Zero-Loss Provenance)

Quando a IA ou o usuário questiona: *"Onde você encontrou essa informação?"*, o sistema responde deterministicamente no caminho completo:
```
Documento Oficial (Ex: Manual TA-25N EM0291-04)
 └── Seção (Ex: 1. Especificações Técnicas)
      └── Página (Ex: Pág. 6)
           └── Locator (Ex: Tabela 1.1 — Entradas Elétricas)
                └── Valor Observado (Ex: -25 a 140 °C)
                     └── TechnicalDatum (ID: dat_...)
```

### 2.4 Política Anti-Alucinação (Absence Signaling)
Se uma especificação for cadastrada sem vínculo documental direto:
- `evidenceReferences` é retornado como `[]`;
- `hasProvenance` é estritamente `false`;
- `summary.factsWithoutProvenance` é incrementado.

**Invariante:** O sistema **nunca** inventa títulos de manuais, números de página ou autores fictícios para "preencher" a proveniência. A ausência é explicitada com transparência para que o agente de IA possa alertar o usuário: *"Dado presente no cadastro, porém sem evidência documental associada"*.

---

### 2.5 Tratamento de Conflitos Documentais (`CanonicalDecision`)
Quando dois manuais ou fontes oficiais divergem (ex: manual em português indicando `0.01 °C` de resolução e catálogo internacional indicando `0.05 °C`):
1. O status efetivo é derivado automaticamente como `'conflicting'`;
2. A IA recebe ambos os valores observados em `evidenceReferences`;
3. Se a engenharia registrar uma `CanonicalDecision`:
   - A rationale técnica (`rationale`), o autor e a data ISO são preservados no envelope;
   - A IA pode explicar: *"Existe divergência entre o manual PT e EN, porém a engenharia homologou a versão PT com a seguinte justificativa: '...' "*.

---

### 2.6 Planejador de Renomeação Canônica em 10 Passos (`CanonicalRenamePlanner`)

Se for estritamente necessário renomear uma `canonicalKey` (ex: reestruturação de taxonomia da empresa):
1. O processo **não** é executado como input livre;
2. O sistema gera um `CanonicalRenamePlan` formal avaliando:
   - Validade sintática da nova chave;
   - Checagem fail-closed de colisão com datums e datasets existentes;
   - Mapeamento exaustivo de datums, datasets, saved views e table bindings afetados;
   - Inclusão mandatória da chave antiga no array de `deprecatedAliases` para manter retrocompatibilidade com chamadas existentes;
   - Registro de auditoria com autor, timestamp e justificativa de engenharia;
   - Geração de instruções determinísticas para rollback;
3. O plano pode ser inspecionado antes de qualquer persistência em banco.

---

## 3. Conclusão

Essa arquitetura garante que o PIM seja **amigável e acolhedor para usuários não-técnicos** ("Teste do Meu Pai" passa no modo Simples) enquanto permanece **rigoroso, tipado, auditável e livre de alucinações para agentes de Inteligência Artificial**.
