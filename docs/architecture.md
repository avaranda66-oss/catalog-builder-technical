# Arquitetura — Catalog Builder

**Versão:** v0.1 (discovery)  
**Status:** proposta para revisão do time

## Princípios

1. **CLI First:** contratos e operações do domínio são testáveis sem navegador; a UI observa e invoca esses serviços.
2. **Baseline preservado:** a camada visual antiga continua sendo a casca do produto.
3. **Fonte única:** produto, documento, revisão e mídia possuem identidade estável e proveniência.
4. **Falha explícita:** nenhuma integração externa fabrica dados ou anuncia sucesso sem confirmação.
5. **Stories:** cada mudança possui critérios de aceite, file list e gates AIOX.

## Camadas

```text
CLI / scripts de domínio
        ↓
Casos de uso e validadores (lib/)
        ↓
Adaptadores Supabase, Storage, IA e arquivos
        ↓
Estado de sessão do editor (features/)
        ↓
Componentes visuais do baseline antigo (app/, components/)
```

O sentido da dependência é de cima para baixo. Componentes não devem conhecer SQL, tokens de autenticação ou formato proprietário de um fornecedor.

## Domínio principal

- `Catalog`: publicação, idioma, marca, versão e estado.
- `Product`: identidade comercial, descrição, specs, variantes e status.
- `FieldDefinition`: contrato de campo técnico, unidade, validação e ordem.
- `CatalogPage` / `PageSection`: composição A4 dinâmica e estilo por bloco.
- `MediaAsset`: foto/diagrama privado, metadados, checksum e vínculo ao produto.
- `Review` / `CatalogVersion`: aprovação imutável e snapshot publicável.
- `AuditEvent`: ator, ação, entidade, antes/depois e origem.
- `ImportProposal` / `AiProposal`: proposta ainda não aplicada, com fonte e aceite humano.

## Supabase

Supabase será o adaptador compartilhado para Auth, Postgres e Storage privado. O esquema deve manter chaves estáveis, foreign keys, constraints, índices de pesquisa e RLS por equipe/catálogo. Migrations são aditivas por padrão; qualquer remoção exige decisão registrada e backup verificado.

## Concorrência e persistência

O editor mantém rascunho local e um `revision`/`updated_at` do servidor. Uma gravação envia a revisão observada; se ela mudou, o caso de uso retorna conflito e preserva o rascunho local para comparação. O autosave é um detalhe de UX, não substitui a operação explícita de salvar/publicar.

## Exportação

O documento renderizado recebe um snapshot imutável. A exportação usa a mesma árvore de páginas do preview com uma folha de impressão sem controles, e registra versão, usuário, horário e resultado.

## IA e importação

Importadores normalizam somente dados comprovados pelo arquivo. O serviço de IA recebe contrato limitado, timeout e tamanho máximo; sua saída vira `AiProposal` validada. A aplicação de qualquer proposta passa pelo mesmo caso de uso de atualização manual e gera auditoria.

## Decisões pendentes

- Escolher renderizador de PDF de servidor, navegador ou ambos.
- Definir estratégia de fila para arquivos grandes e chamadas de IA.
- Confirmar matriz de papéis e se haverá múltiplas organizações.
- Definir política de retenção e CDN para mídia privada.

