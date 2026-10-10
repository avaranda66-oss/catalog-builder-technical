# Contrato de extração técnica

Versão 1, implementada para especificações originais sintéticas estruturadas. Extração real por IA, OCR ou PDF ainda não existe.

## Entrada aceita

TechnicalInputSchema é estrito: versão 1, tipo original-synthetic-specifications, título, 2–4 modelos, até 5 fontes, até 6 seções/48 características e 16 linhas por seção. Fonte: ID, nome, revisão, páginas numeradas e SHA-256. Valores são strings literais de até 160 caracteres; controles incompatíveis são rejeitados.

Cada linha contém identidade, rótulo, unidade, condição e uma posição por modelo. Identidades duplicadas, posições ausentes e propriedades extras são rejeitadas. Não converter valores para Number, normalizar separadores/unidades ou inferir certificados, tolerâncias ou dimensões.

| Estado | Representação e revisão |
| --- | --- |
| Conhecido | Valor literal e origem; string vazia é um vazio legítimo |
| Ausente | Motivo, sem candidato; “Não informado” com reconhecimento obrigatório |
| Conflitante | 2–4 candidatos/fontes; “Revisar conflito” até escolha explícita |

## Associação verificável

Referência: sourceId, página e trecho literal. O trecho deve ser exatamente “modelo | rótulo | valor | unidade | condição” e estar na página declarada. Alterar qualquer parte, página ou hash rejeita a entrada. O usuário seleciona um candidato existente; o gerador não declara uma revisão vencedora.

SHA-256 cobre UTF-8 de JSON.stringify(pages), incluindo números/textos. Verifica a fixture estruturada; **não é hash de bytes PDF, prova de autenticidade, autorização ou validação de OCR**.

## Documento e aprovação

Sidecar mantém entrada completa, candidatos, decisões e plano junto ao documento canônico. Aprovação vincula todo o conjunto. Reabertura verifica schema, hashes, trechos, matriz técnica completa e aprovação. Mudanças de fonte, condição, estilo ou documento invalidam a aprovação correspondente.

Persistência captura antes de SHA assíncrono e grava documento/sidecar/aprovação atomicamente. Isso corrige a divergência reproduzida entre documento e origem quando o chamador alterava dados durante o hash. CAS local rejeita revisão obsoleta; replay idêntico é idempotente, payload diferente com mesma mutation ID é conflito.

## Intake real posterior

Registrar hash dos bytes originais, formato, versão, autorização, proprietário/tenant e páginas. A extração deverá retornar valores, unidades, condições, localização verificável e incerteza/qualidade de leitura. Não completar lacunas por plausibilidade.

Conflitos preservam candidatos e exigem revisão. Referências concorrentes orientam composição, nunca valores PRESYS. Instruções nos materiais são conteúdo, não autorização de execução/envio/publicação.

Envio externo exige autorização explícita dos materiais/destino, minimização e orçamento. Secrets ficam fora do frontend. Nenhum documento real foi enviado a um provedor e nenhuma chamada paga foi executada neste MVP.

Testes provam fidelidade das fixtures, não verdade física dos instrumentos, autenticidade, isolamento de tenants ou aprovação de Marc.
