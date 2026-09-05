# Especificação de Tours Interativos & Tutoriais de Tarefa

**Status**: Produção  
**Documento**: `LEARNING_TOURS.md`  
**Módulo**: `src/components/guided-help/PageTour.tsx` e `TaskTutorialModal.tsx`  
**Missão**: `LIBRARY.V2.GUIDED.UX1`

---

## 1. Visão Geral

O sistema de aprendizado da Library V2 conta com duas ferramentas ativas de capacitação:
1. **Tour da Tela (7 Passos)**: Visita guiada visual que percorre a anatomia da interface.
2. **Tutoriais de Tarefa (8 Guias)**: Roteiros passo a passo focados na execução de tarefas operacionais reais.

---

## 2. O Tour da Tela (7 Passos Canônicos)

O componente `PageTour.tsx` utiliza destacamento visual com overlay e cartão flutuante com posicionamento inteligente.

```
┌────────────────────────────────────────────────────────────┐
│                    PASSO 1: O CABEÇALHO                    │
│ "Aqui você visualiza a família ativa, realiza buscas       │
│  globais e acessa o botão do Modo Aprender."               │
│                                           [Próximo (2/7) >]│
└────────────────────────────────────────────────────────────┘
```

| Passo | Seletor DOM | Título | Mensagem Didática | Ação Esperada |
|---|---|---|---|---|
| **1** | `[data-tour="v2-header"]` | Cabeçalho & Família | Mostra a família selecionada, busca rápida e alternância entre modos de visualização. | Clique em "Próximo" |
| **2** | `[data-tour="v2-learn-mode"]` | Modo Aprender 🎓 | Ao ligar esta chave, badges explicativos e caixas de ajuda surgem em toda a interface. | Testar toggle |
| **3** | `[data-tour="v2-sidebar"]` | As 8 Seções de Engenharia | Menu lateral que divide o PIM em Visão Geral, Dados Técnicos, Tabelas, Documentos, Fontes, Conflitos, Organização e Avançado. | Navegar entre seções |
| **4** | `[data-tour="v2-metrics"]` | Painel de Integridade | Informa quantos modelos estão cadastrados, se há conflitos pendentes e o status de validação. | Visualizar contadores |
| **5** | `[data-tour="v2-models"]` | Modelos Físicos | Onde residem os itens reais (ex: TA-25N). Você pode clicar para inspecionar ou cadastrar novos. | Selecionar modelo |
| **6** | `[data-tour="v2-technical-data"]` | Especificações & Herança | Entenda de forma clara quais dados vêm da Família e quais são exceções exclusivas do modelo selecionado. | Inspecionar overrides |
| **7** | `[data-tour="v2-switch-classic"]` | Retorno ao Modo Clássico | A qualquer momento você pode alternar de volta para a experiência clássica com um único clique. | Concluir Tour |

---

## 3. Catálogo dos 8 Tutoriais de Tarefa

Os tutoriais são abertos pelo componente `TaskTutorialModal.tsx` e orientam o operador em passos numerados com dicas de boas práticas industriais.

### Tutorial 1: Cadastrar um novo modelo físico na família
- **Passo 1**: Selecione a família de equipamentos correta no cabeçalho ou na lista.
- **Passo 2**: Clique no botão "+ Adicionar Novo Modelo" na seção de Visão Geral.
- **Passo 3**: Digite o código comercial de fábrica (ex: TA-60N).
- **Passo 4**: O modelo é criado herdando 100% das especificações padrão da família.
- **Dica**: Siga o padrão de nomenclatura da empresa (ex: prefixo de linha + sufixo de faixa).

### Tutorial 2: Sobrescrever uma especificação técnica em um modelo (Override)
- **Passo 1**: Na Seção 2 (Informações Técnicas), selecione o modelo específico no dropdown ou card.
- **Passo 2**: Localize o campo desejado (ex: Faixa de Temperatura).
- **Passo 3**: Clique no campo e digite o valor exclusivo deste modelo.
- **Passo 4**: O sistema aplica automaticamente o badge dourado *"Exceção do Modelo (Override)"*.
- **Dica**: Evite sobrescrever campos se o valor puder ser compartilhado com a família inteira.

### Tutorial 3: Resolver um conflito documental entre dois manuais
- **Passo 1**: Acesse a Seção 6 (Conflitos / Revisões).
- **Passo 2**: Localize a especificação marcada com status de divergência.
- **Passo 3**: Analise as fontes em confronto (ex: Manual de 2024 informando 250 W vs Boletim de 2026 informando 300 W).
- **Passo 4**: Registre uma *Decisão Canônica*: selecione o valor aprovado pela engenharia, insira a justificativa técnica e assine.
- **Dica**: Decisões canônicas criam histórico imutável para auditorias futuras.

### Tutorial 4: Gerar e exportar uma matriz comparativa de modelos
- **Passo 1**: Acesse a Seção 3 (Tabelas Técnicas).
- **Passo 2**: Verifique as colunas de especificações que deseja comparar.
- **Passo 3**: Clique em "Exportar Matriz" ou "Inserir no Catálogo Editorial".
- **Dica**: Tabelas comparativas geradas na Library sincronizam em tempo real com as páginas do catálogo.

### Tutorial 5: Auditar a cadeia de custódia e proveniência de um dado
- **Passo 1**: Em qualquer especificação na Seção 2, clique no ícone de selo de procedência.
- **Passo 2**: O drawer de fontes exibe o documento mestre, a página e o recorte exato do texto oficial.
- **Dica**: Um dado com 100% de confiança possui evidência literal rastreável até o PDF original.

### Tutorial 6: Adicionar um novo documento técnico de referência
- **Passo 1**: Vá até a Seção 4 (Documentos).
- **Passo 2**: Faça o upload do manual ou folha de dados em formato PDF.
- **Passo 3**: Defina a versão, data de emissão e idioma do documento.
- **Dica**: Documentos aprovados alimentam automaticamente o banco de evidências metrológicas.

### Tutorial 7: Inspecionar o esquema JSON-LD para integração com ERP
- **Passo 1**: Vá até a Seção 8 (Avançado).
- **Passo 2**: Visualize o código estruturado no formato padronizado Schema.org.
- **Passo 3**: Use o botão "Copiar JSON-LD" para enviar ao time de integração de sistemas ou SEO.

### Tutorial 8: Alternar entre Library Classic e Library V2 Guided
- **Passo 1**: No canto superior direito, clique em "Modo Clássico" para abrir a interface tradicional densa.
- **Passo 2**: Para retornar à V2, clique no banner azul no topo da Library Classic.
- **Dica**: Seu trabalho, produtos selecionados e edições são 100% preservados durante a troca.
