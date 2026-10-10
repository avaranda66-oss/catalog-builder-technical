# Validação do MVP

Implementado um protótipo local funcional com planejamento simulado e composição determinística. **Não há IA operacional nem extração de PDF.**

## O que funciona

Especificações originais estruturadas → fontes verificadas → plano tipado → templates/comandos existentes → documento canônico multipágina → revisão de ausência/conflito → aprovação → salvamento/reabertura local → preflight/publicação/PDF existentes.

A fixture de três modelos gera automaticamente comparação térmica e elétrica em duas A4, sem o usuário criar linhas/colunas ou escolher geometria. Valores incluem zeros à esquerda, separadores locais diferentes, sinais/Unicode, descrições multilinha e vazio legítimo. A matriz inteira é verificada; duas dúvidas exigem disposição explícita.

A UI demonstra três etapas, exemplo ou JSON sintético local, pedido permitido/rejeição clara, proposta que não substitui o catálogo anterior, origem de 42 valores, ajuste compacto revisável/reversível, edição manual opcional, aprovação e Library local.

Persistência usa adaptador compatível CatalogRepository/CAS com Web Locks e registro atômico de documento/fontes/plano/decisões/aprovação. Reabrir valida tudo. Não usa a Library cloud de produção.

## Evidência concluída neste checkpoint

- 32 testes focados incorporados; suíte completa: 304 arquivos, 3.602 PASS e um skip.
- Lint/typecheck PASS; build e provas minificadas em curso.
- Prova DEV: fluxo, histórico, CAS/save/reopen, dois A4 e 96 células por texto/posição PASS.
- IAB nativo: fluxo até publicação READY, screenshot preservado.
- PDF real DEV renderizado e inspecionado por root/QA, sem cortes, sobreposição ou controles impressos.
- Defeitos confirmados de captura assíncrona, replay/NOT_FOUND, cancelamento, pedido ignorado, origem exibida, cabeçalho e política de impressão corrigidos.

Provas finais Chromium/Edge, ledger independente, commit/CI/Preview da nova candidata continuam pendentes aqui. RELEASE_READINESS e o handoff mantêm o estado terminal exato; PASS da PR #67 não certifica o MVP.

## Limitações deliberadas

Somente JSON original sintético, pedidos simulados limitados e dois estilos aprovados. Sem PDF/image intake, OCR, modelo externo, imagem de produto, tradução gerada, paginação genérica ou integração à produção.

A origem usa hash do conteúdo estruturado de páginas, não bytes/autenticidade de PDF. Cada linha possui unidade/condição compartilhada; diferentes condições por modelo exigem linhas separadas em um plano futuro, nunca agregação silenciosa.

Edição técnica manual rompe a associação de origem e exige restaurar/regenerar. Layout de blocos limitados é legível, mas deixa espaço em branco; densidade editorial e facilidade humana aguardam piloto. As 9/11 ações são de agente, sem tempo ou ganho percentual humano medido.

## Próxima etapa autorizável

Após gates próprios e revisão da candidata, demonstrar o protótipo a Marc. Planejar a extração real separadamente com materiais/destino/minimização/acesso e orçamento explícitos antes de qualquer transmissão externa.

Não houve merge, migração, mudança de produção/Edge/Storage/auth/secrets, alteração de catálogo comercial ou chamada paga.
