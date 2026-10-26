# Decisões de arquitetura

Cada decisão abaixo precisa ser tomada antes ou durante a implementação e explicada no README com o trade-off. O formato é: contexto, opções, recomendação e o que registrar. Marque quando decidir.

## D1. Stack do backend

- [ ] Decidido

**Contexto.** O enunciado deixa livre: Node, rotas de API do Next, Xano, Supabase etc. Mas as financeiras "rodam dentro do seu backend" com delays de até 15 s, orquestração paralela com deadline e entrega progressiva. Em BaaS ou serverless isso exige funções com limites próprios e trabalho em background que morre com a resposta.

**Opções.** Node com TypeScript e Fastify ou Express; rotas de API do Next (só com servidor Node persistente, não serverless); BaaS.

**Recomendação.** A stack em que você é mais fluente, porque a edição ao vivo pesa mais que a elegância. Node com TypeScript num processo persistente atende todos os requisitos sem fricção.

**Registrar.** Por que não serverless ou BaaS: trabalho em background e deadline de 10 s.

## D2. Banco de dados

- [ ] Decidido

**Contexto.** PostgreSQL ou SQLite, com o projeto subindo em um único comando.

**Opções.** SQLite em arquivo (zero dependência, um único escritor); PostgreSQL via Docker Compose (mais real, mais um ponto de falha ao subir).

**Recomendação.** SQLite como padrão, com o ORM ou query builder permitindo trocar para PostgreSQL por variável de ambiente. Migrations rodando no boot.

**Registrar.** O trade-off do único escritor do SQLite com quatro callbacks gravando em paralelo, e como foi tratado (serialização ou transações curtas).

## D3. Entrega progressiva ao front

- [ ] Decidido

**Contexto.** A tela mostra cada financeira mudando de status enquanto as respostas chegam. A janela é de no máximo 10 s e são 4 financeiras. O README precisa explicar a escolha.

**Opções.**

| Opção | A favor | Contra |
|---|---|---|
| Polling (GET da consulta a cada 500 ms a 1 s) | Mais simples, funciona em qualquer backend, resolve reload de graça, fácil de testar e de alterar ao vivo | Até 1 s de atraso na percepção; 10 a 20 requisições por consulta |
| SSE | Unidirecional, leve, reconecta sozinho, sensação de tempo real | Precisa enviar snapshot inicial na conexão; cuidado com proxies e serverless; reconexão pode duplicar eventos |
| WebSocket | Bidirecional | Excesso para 4 eventos em 10 s |

**Recomendação.** Polling lendo o snapshot da consulta no banco. Se quiser mostrar domínio, SSE com snapshot inicial e fallback para polling. Em qualquer caso, a leitura vem do banco, não da memória do processo.

**Registrar.** A justificativa em função do problema: poucos eventos, janela curta, estado já persistido.

## D4. Orquestração

- [ ] Decidido

**Recomendação.**
- POST cria paciente e consulta, grava um resultado "consultando" por financeira, dispara a orquestração em background e devolve o id na hora.
- Deadline global de 10 s a partir da criação, lido de variável de ambiente.
- Cada adapter recebe `AbortSignal`, relógio e sorteio injetados. Resultado persistido no momento em que chega.
- Encerra quando as quatro responderem ou no deadline. Pendentes viram indisponível por timeout. Escritas tardias são ignoradas por transição de estado terminal.
- Consulta tem status próprio (`consultando`, `concluida`), `iniciado_em`, `concluido_em`, `deadline` e `cenario_forcado`.
- Toda leitura reconcilia: pendente com deadline vencido é devolvido como indisponível por timeout.

**Registrar.** Ordem erro-vs-delay da Delta, ausência de retry e tratamento de resposta tardia.

## D5. Modelo de dados

- [ ] Decidido

Quatro entidades, as mesmas que o enunciado manda guardar.

```
patients
  id, full_name, cpf (11 dígitos), birth_date, phone (dígitos),
  monthly_income_cents, created_at

consultations
  id, patient_id -> patients, treatment_amount_cents,
  status (consultando | concluida), started_at, deadline_at, finished_at,
  finish_reason (todas_responderam | timeout), forced_scenario (nullable),
  created_at

lender_results
  id, consultation_id -> consultations, lender (alfa | beta | gama | delta),
  status (consultando | aprovada | recusada | indisponivel),
  reason_code (nullable: timeout | http_500 | income_insufficient | age_below_min |
               amount_above_limit | forced),
  approved_amount_cents (nullable), monthly_rate (decimal, nullable),
  terms_months (JSON, nullable), latency_ms (nullable), raw_response (JSON, nullable),
  started_at, responded_at (nullable)
  unique (consultation_id, lender)

chosen_offers
  id, consultation_id -> consultations (unique), lender_result_id -> lender_results,
  term_months, financed_amount_cents, monthly_rate,
  installment_cents, total_cents, created_at
```

Observações: o valor do tratamento fica na consulta, não no paciente, porque "tentar um valor menor" cria nova consulta do mesmo paciente. Parcelas por prazo são derivadas e não precisam ser persistidas, exceto no snapshot da escolha. Taxa e prazos ficam no resultado para a escolha ser validada contra o que foi ofertado, não contra a tabela.

## D6. Contrato da API

- [ ] Decidido

Esboço. Nomes em inglês, respostas em JSON, dinheiro em centavos inteiros, taxa em decimal.

| Método e rota | Entrada | Saída | Observação |
|---|---|---|---|
| `POST /consultations` | dados do paciente, `treatmentAmountCents`, `scenario?` | `201 { consultationId }` | Cria paciente (ou reaproveita por CPF), cria consulta, dispara orquestração |
| `GET /consultations/:id` | | snapshot: consulta, 4 resultados com status, motivo, latência, ofertas calculadas por prazo, `deadlineAt`, escolha se houver | Fonte do polling e do bônus de retomar |
| `GET /consultations/:id/events` | | stream SSE com snapshot inicial e eventos por resultado | Só se escolher SSE |
| `POST /consultations/:id/choice` | `{ lender, termMonths }` | `201` com snapshot da escolha; `409` se já houver; `422` se inválida | Servidor valida e recalcula |
| `GET /lenders/metrics` | | por financeira: chamadas, taxa de erro, taxa de timeout, p50 e p95 de latência | Bônus; excluir cenários forçados |
| `GET /health` | | `200` | Para o Docker Compose |

Validação de entrada com `422` e erros por campo. Schema compartilhado com o front.

## D7. Cenários forçados

- [ ] Decidido

**Recomendação.** Campo `scenario` opcional no POST, com os presets abaixo, e um override granular por financeira para testes e para a alteração ao vivo. Seletor discreto na UI (visível em desenvolvimento ou via query string). O cenário fica gravado na consulta.

| Preset | Alfa | Beta | Gama | Delta |
|---|---|---|---|---|
| `all_approve` | regra natural, 0,5 s | regra natural, 1 s | regra natural, 1 s | aprova, 2 s |
| `delta_error` | natural | natural | natural | erro 500, 1 s |
| `delta_timeout` | natural | natural | natural | responde aos 12 s |
| `none_approve` | recusa forçada, 0,5 s | recusa forçada, 1 s | recusa forçada, 1 s | recusa forçada, 1,5 s |
| sem preset | tudo natural, com sorteio | | | |

Override granular: `{ lender: { outcome: approve | refuse | error | timeout | natural, delayMs? } }`. Os presets são atalhos sobre ele. Nos presets da Delta, as outras seguem a regra natural, e o README traz dados que as aprovam.

## D8. Financeiras como configuração e adapters

- [ ] Decidido

```
LenderConfig { id, name, minDelayMs, maxDelayMs, monthlyRate, termsMonths, decide(input) -> Approval | Refusal }
LenderClient { quote(request, { signal, clock, random, override }) -> Promise<LenderResult> }
```

Uma lista `lenders` registra as quatro. Adicionar a quinta é um objeto a mais. Erro 500 é um erro tipado lançado pelo adapter. A regra de cada financeira é função pura com teste próprio.

## D9. Dinheiro e cálculo

- [ ] Decidido

- Centavos inteiros em todo o backend e na API. Formatação pt-BR só na UI.
- Taxa como decimal (`0.0249`) com nome explícito (`monthlyRate`).
- Price como função pura: `installmentCents(pvCents, monthlyRate, n)`, half-up a centavos, com `i = 0` devolvendo `pv / n`. Total igual a parcela × n.
- Teto da Beta: 60% arredondado para baixo em centavos.
- Ordenação como função pura: `sortOffers(offers, criterion)` com desempate determinístico.

## D10. Front-end

- [ ] Decidido

- React com TypeScript. Vite ou Next, conforme fluência.
- Estado do formulário acima dos passos: um único formulário (por exemplo `react-hook-form` com `zod`) e passos só visuais. Validar por campo após o primeiro toque, validar o passo ao avançar e tudo no submit.
- Rota com o id da consulta (`/consultas/:id`) desde o início. O bônus de retomar após reload vira só um GET.
- Camada de "acompanhar consulta" isolada (hook), para trocar polling por SSE sem mexer nas telas.
- Cards de status em ordem fixa, atualizados por id da financeira. Ofertas como lista achatada com seletor de ordenação.
- Estados de erro da API com tentar novamente.
- Componentes por responsabilidade: formulário, painel de status, lista de ofertas, confirmação, seletor de cenário.

## D11. Testes

- [ ] Decidido

Ferramenta: Vitest ou Jest com fake timers. Suíte deve rodar em menos de 10 s.

Cobrir, no mínimo:
- CPF: tabela do arquivo 05.
- Idade: fronteiras do arquivo 05 com data de referência injetada.
- Price: tabela de referência e fixtures extras, inclusive i = 0 e erros clássicos.
- Ordenação: as três listas esperadas do arquivo 05.
- Regras das financeiras: fronteiras da Alfa (igualdade em centavos), da Gama (25 anos, R$ 20.000,00 e 20.000,01) e teto da Beta.
- Orquestração com fake timers: todas respondem antes do deadline e a consulta encerra cedo; uma estoura e vira indisponível por timeout aos 10 s; erro 500 vira indisponível com motivo; resposta tardia não altera nada; nenhuma aprovou gera o estado certo; cada preset é determinístico.
- Escolha: prazo inexistente, financeira recusada, consulta alheia e segunda escolha.
- Validação da API: payload inválido devolve 422 por campo.

Front: no máximo um teste do schema de validação. E2E fica de fora e vai para "faria com mais tempo".

## D12. Idioma e nomenclatura

- [ ] Decidido

**Recomendação.** UI e README em pt-BR. Código em inglês com termos de domínio consistentes e glossário no README: paciente = patient, consulta = consultation, financeira = lender, oferta = offer, pré-aprovação = pre-approval. Alternativa igualmente válida: tudo em português. O que importa é não misturar.

## D13. Orçamento de tempo (6 horas)

| Bloco | Tempo | Entrega |
|---|---|---|
| Setup, Docker Compose, banco e migrations | 45 min | `docker compose up` sobe tudo |
| Financeiras, orquestração, cenários e API | 90 min | POST, GET e escolha funcionando via curl |
| Formulário multi-etapa com validação | 75 min | Cadastro completo com mensagens |
| Status progressivo, ofertas, ordenação e escolha | 75 min | Jornada ponta a ponta |
| Testes | 45 min | Lista do D11 |
| README | 30 min | Seções do D14 |

Ordem: backend antes do front, porque a demo e os testes dependem dele. Bônus só depois de tudo acima. Ao bater 6 horas, parar e registrar. Anotar o horário de início e fim de cada bloco para o log do README.

## D14. Estrutura do README

Seções exigidas pelo enunciado e as que o avaliador vai procurar:

1. O que é o projeto, em três linhas.
2. Como rodar: um comando com Docker Compose; alternativa sem Docker; como rodar os testes.
3. Como forçar cada um dos 4 cenários, com os dados de exemplo.
4. Arquitetura em um parágrafo e um diagrama simples: front, API, orquestrador, adapters, banco.
5. Decisões e trade-offs: D1 a D12, uma frase de decisão e uma de trade-off cada.
6. Contrato da API resumido.
7. Modelo de dados resumido.
8. Premissas adotadas e perguntas enviadas (arquivo 04).
9. O que ficou de fora e o que faria com mais tempo.
10. Como usei ferramentas de IA: o que foi gerado, o que foi revisado à mão, o que foi descartado.
11. Log de horas por bloco.
