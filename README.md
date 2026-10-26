# Pré-aprovação do paciente (case Parcela Mais)

## O que é

Jornada de pré-aprovação para a atendente da clínica, com o paciente na frente: cadastro em dois passos (dados do
paciente; renda e tratamento), consulta em paralelo a quatro financeiras simuladas com prazo máximo de 10 s, status
de cada financeira chegando na tela conforme respondem, ofertas por financeira × prazo com parcela pela Tabela Price,
ordenação por menor parcela ou menor total, escolha salva no servidor e tela de confirmação. A página inicial oferece retomar a
última consulta aberta neste navegador.

Stack: Next.js 16.4 (App Router com Cache Components), React 19, TypeScript, Tailwind 4, nuqs, zod 4, SQLite via
`node:sqlite`, Vitest 5, Docker Compose. Um único processo Node é front, API e orquestrador.

## Como rodar

Com Docker, na raiz do repositório (a primeira vez inclui o `next build` da imagem):

```bash
docker compose up --build
```

Abre em http://localhost:3000. O SQLite fica em `/data/app.sqlite`, no volume `app-data` (o diretório inteiro, com
`-wal` e `-shm`), e sobrevive a `docker compose down`. O `healthcheck` chama `GET /api/health` a cada 10 s;
`stop_grace_period: 20s` deixa uma consulta em andamento terminar, já que as financeiras são consultadas depois da
resposta HTTP (`after()`). Imagem multi-stage com `output: 'standalone'`, rodando como `USER node`.

Sem Docker, com Node 24 (o `node:sqlite` é embutido) e pnpm 10 via corepack:

```bash
corepack enable
pnpm install
pnpm dev
```

O banco é criado e migrado no primeiro acesso em `./data/app.sqlite` (pasta ignorada pelo git). As variáveis estão em
`.env.example` (copie para `.env.local` para mudar algo; sem o arquivo valem os padrões):

| Variável | Padrão | O que faz |
|---|---|---|
| `DATABASE_PATH` | `./data/app.sqlite` | arquivo SQLite (`/data/app.sqlite` no container) |
| `CONSULTATION_DEADLINE_MS` | `10000` | prazo máximo da consulta, medido no servidor e gravado em cada consulta |
| `POLL_INTERVAL_MS` | `750` | intervalo do polling; chega ao navegador no campo `pollIntervalMs` do snapshot |
| `COOKIE_SECURE` | `false` | atributo `Secure` dos cookies; `true` só atrás de TLS |
| `TZ` | `America/Sao_Paulo` | calendário civil usado para calcular a idade |
| `PORT` | `3000` | porta do servidor |

| Comando | O que faz |
|---|---|
| `pnpm test` | Vitest: 13 arquivos, 538 testes, cerca de 0,3 s (`pnpm test:watch` em modo watch) |
| `pnpm typecheck` | `next typegen && tsc --noEmit` |
| `pnpm lint` | ESLint com `eslint-config-next` (inclui as regras do React Compiler) |
| `pnpm build` | `next build` com Turbopack e `output: 'standalone'`; o `postbuild` copia `public/` e `.next/static` para `.next/standalone/` |
| `pnpm start` | `node .next/standalone/server.js`, o mesmo comando do container (o `next start` não serve o modo standalone) |

Com o servidor no ar, `node scripts/demo-api.mjs delta_timeout` percorre o contrato HTTP como o front faz: imprime o
`POST /api/consultations` (status, id, cenário, ms até o prazo), uma linha por leitura do `GET` com o tempo decorrido e
o status de cada financeira, a linha final com `finishReason`, ofertas, `outcome` e `nextStep`, as três primeiras
ofertas e o `POST .../choice` da primeira oferta (201), a mesma escolha de novo (200) e uma diferente (409). Argumentos:
o preset ou `natural`, depois a URL base. Com `delta_timeout`, ~2 s após o fechamento o servidor loga `late_result_ignored`.
`curl -s localhost:3000/api/lenders/metrics` devolve, por financeira, chamadas, aprovações, recusas, indisponibilidades, taxa de
erro, taxa de timeout, respostas tardias e latência p50/p95, só do fluxo natural (consultas com cenário forçado ficam de fora).

## Como forçar cada cenário

O cenário é um preset de overrides por financeira (`src/lenders/scenarios.ts`) que a consulta grava na coluna
`forced_scenario`. Ele entra por quatro caminhos:

- `?scenario=<preset>` na URL do cadastro (`/register/patient?scenario=delta_error` ou direto em
  `/register/financing`); o passo 1 repassa o valor ao passo 2 num campo oculto e as actions o mantêm nos redirects;
- o seletor "Cenário de demonstração" no último passo (`src/components/register/scenario-select.tsx`): lê e escreve
  `?scenario=` via nuqs e também é um campo do formulário, então funciona sem JavaScript;
- o formulário "Dados de demonstração" na página inicial: escolhe a persona A, B ou C e o cenário, grava o rascunho
  com os dados da persona (`applyPersona`, em `app/register/actions.ts`) e abre o último passo com `?scenario=`;
- os campos `scenario` e `overrides` do `POST /api/consultations`: `overrides` é `{ [lenderId]: { outcome, delayMs? } }`,
  `outcome` em `natural | approve | refuse | error | timeout`, aplicado por cima do preset (os testes usam o mesmo
  mecanismo). `timeout` só muda a decisão para "aprova": o `delayMs` é que precisa passar de `CONSULTATION_DEADLINE_MS`.

A URL da consulta nunca carrega o cenário: a fonte é a coluna. Com a persona A (30 anos, renda R$ 5.000, tratamento
R$ 15.000) os presets reproduzem a tabela "Cenários forçados" de `docs/05-numeros-de-referencia.md`:

| Preset | Alfa | Beta | Gama | Delta | Tela esperada (persona A) |
|---|---|---|---|---|---|
| `all_approve` | regra natural, 0,5 s | natural, 1 s | natural, 1 s | aprova, 2 s | 12 ofertas; Beta parcial (60%, R$ 9.000) |
| `delta_error` | natural, tempo sorteado | natural | natural | erro 500 em 1 s | 9 ofertas; Delta "Indisponível", motivo `http_500` |
| `delta_timeout` | natural | natural | natural | aprova em prazo + 2 s (12 s) | 9 ofertas; fecha aos 10 s; Delta "Indisponível", motivo `timeout` |
| `none_approve` | recusa forçada, 0,5 s | recusa, 1 s | recusa, 1 s | recusa, 1,5 s | 0 ofertas; "Nenhuma financeira aprovou" e "Consultar de novo" |

No `delta_timeout` a Delta responde de propósito em `deadline + 2 s` (`LATE_RESPONSE_EXTRA_MS`): a consulta fecha aos
10 s, a resposta chega aos 12 s, encontra a linha já terminal e vira o log `late_result_ignored`, sem mudar a tela. No
`none_approve` as recusas têm motivo `forced`, que um valor menor não resolve, por isso o botão é "Consultar de novo";
"Tentar com um valor menor" aparece com alguma recusa por renda (`income_insufficient`) ou limite (`amount_above_limit`)
e valor acima de R$ 1.000,00 (ex.: persona B com `"scenario": "none_approve"` e `"overrides": { "alfa": { "outcome": "natural" } }`).

Fluxo natural (sem preset) com as personas da página inicial (dados fictícios; os CPFs só passam no algoritmo):

| Persona | Dados | O que acontece |
|---|---|---|
| A | Ana Souza, CPF 529.982.247-25, 15/03/1996, renda R$ 5.000, tratamento R$ 15.000 | Alfa, Beta (60%) e Gama aprovam; Delta aleatória |
| B | Bruno Lima, CPF 123.456.789-09, 10/05/2004, renda R$ 1.500, tratamento R$ 25.000 | Alfa recusa por renda (15.000 < 25.000), Gama por idade (22 < 25), Beta aprova R$ 15.000, Delta aleatória |
| C | Carla Dias, CPF 390.533.447-05, 02/07/1986, renda R$ 3.000, tratamento R$ 45.000 | Alfa recusa (30.000 < 45.000), Gama recusa por limite (> R$ 20.000), Beta aprova R$ 27.000, Delta aleatória |

"Aleatória" na Delta: resposta entre 4 e 15 s e erro 500 em 30% das chamadas, os dois sorteados no início da chamada;
ela estoura os 10 s em cerca de 45% das vezes. Pela API, forçando também a Beta a estourar o prazo:

```bash
curl -s -X POST http://localhost:3000/api/consultations -H 'content-type: application/json' -d '{
  "patient": { "fullName": "Ana Souza", "cpf": "529.982.247-25", "birthDate": "1996-03-15",
               "phone": "11912345678", "monthlyIncomeCents": 500000 },
  "treatmentAmountCents": 1500000,
  "scenario": "delta_timeout",
  "overrides": { "beta": { "outcome": "timeout", "delayMs": 12000 } }
}'
```

## Arquitetura

Um único app Next.js 16 num processo Node persistente serve as páginas (RSC com shell estático e conteúdo em
`<Suspense>`), recebe as mutações da interface por Server Actions (cookie do rascunho, criação da consulta, escolha) e
expõe os mesmos services em Route Handlers REST, usados pelo front no polling e por qualquer cliente com `curl`.
Páginas, actions e handlers são finos: montam `getDb()`, `LENDERS` e a config e chamam `src/server`. A orquestração
roda depois da resposta HTTP (`after()`) e conversa com o `GET` só pelo banco. O domínio (validações, Price, ordenação,
regras, resumo) é puro e testado com os números de `docs/05-numeros-de-referencia.md`.

```text
Navegador (atendente da clínica)
  │ HTML/RSC em streaming        │ Server Actions (forms)         │ fetch JSON a cada 750 ms (no-store)
  ▼                              ▼                                ▼
Next.js 16 (um processo Node persistente)
  app/**/page.tsx                app/**/actions.ts                app/api/**/route.ts
  └───────────────┬──────────────┴────────────────┬───────────────┘
                  ▼                               ▼
  src/server (consultations.service, choices.service, snapshot, repositories, draft-cookie, config, log)
                  │                               │
                  ▼                               ▼
  src/db (node:sqlite, MIGRATIONS)         src/orchestration (deadline, Promise.race, settle condicional)
                                                  │
                                                  ▼
                                           src/lenders (registry, alfa/beta/gama/delta, simulate, scenarios)
                                                  │
                                                  ▼
                                           src/domain (cpf, age, money, price, offers, sorting, summarize, schema, types)
```

Dependências, de cima para baixo: `app/` e `src/components` conhecem `src/server`, `src/domain`, `src/copy` e
`src/url-state` (handlers e actions importam também `getDb()` e `LENDERS`); `src/server` conhece `src/db`,
`src/orchestration`, `src/lenders` e `src/domain`; `src/orchestration` conhece `src/lenders` e os repositórios;
`src/lenders` conhece só `src/domain`; `src/domain` não importa Next, banco nem React (só as mensagens de
`src/copy/pt-BR.ts`, onde está toda string visível).

| O quê | Onde |
|---|---|
| Financeiras | `src/lenders/registry.ts` e um arquivo por financeira (`alfa.ts`, `beta.ts`, `gama.ts`, `delta.ts`) |
| Timeout | `CONSULTATION_DEADLINE_MS`, lido em `src/server/config.ts` |
| Tabela Price | `src/domain/price.ts` |
| Ordenação | `src/domain/sorting.ts` |
| CPF | `src/domain/cpf.ts` |
| Schema do cadastro | `src/domain/registration-schema.ts` (passos em `registration-steps.ts`, limites em `limits.ts`) |
| Contrato HTTP | `app/api/**/route.ts`; DTO em `src/domain/types.ts` |
| Orquestração | `src/orchestration/run-consultation.ts` (`call-lender.ts` é o ponto de retry; `clock.ts` injeta o tempo) |
| Cenários | `src/lenders/scenarios.ts` |
| Polling | `src/components/consultation/use-consultation-snapshot.ts` |
| Métricas por financeira | `src/server/metrics.service.ts`, exposto em `GET /api/lenders/metrics` |

## Decisões e trade-offs

- **Backend dentro do Next, num processo Node persistente.** As financeiras são consultadas depois da resposta do
  `POST` (`after()`), por até 10 s; serverless ou BaaS matariam esse trabalho com a resposta. Trade-off: um processo
  só (escala vertical) que precisa ficar vivo até o fim (`stop_grace_period: 20s`).
- **SQLite via `node:sqlite`, SQL à mão, migrações num array.** Zero dependência, API síncrona (transações curtas sem
  `await`), banco em memória nos testes com os repositórios reais, um `ALTER TABLE` a mais para um campo novo.
  Trade-off: sem query builder tipado (mapeamento de linhas manual em `repositories.ts`); trocar para PostgreSQL é
  reescrever `client.ts`, as migrações e os repositórios.
- **Polling de 750 ms sobre o snapshot persistido, não SSE.** São no máximo 4 eventos em 10 s, o estado já está no
  banco (recarregar é grátis), o contrato se testa com `curl` e a troca por SSE cabe num hook (`setTimeout` encadeado,
  `AbortController`, backoff 1 s → 2 s → 4 s, "Tentar novamente" após 5 falhas). Trade-off: até 750 ms de atraso e
  ~14 requisições por consulta; SSE entregaria cada resposta na hora numa conexão só, ao custo de snapshot inicial,
  reconexão e cuidado com compressão e proxies que bufferizam.
- **Orquestração com o banco como árbitro.** Prazo calculado e gravado na criação (`deadline_at`); `Promise.race`
  entre `allSettled` das quatro chamadas e um timer até o prazo; cada resposta faz `UPDATE ... WHERE status =
  'querying'` e, com zero linhas mudadas, é tardia: vai para `late_*` e para o log `late_result_ignored`; `finalize`
  marca pendentes como `unavailable`/`timeout` e é idempotente; toda leitura e o boot reconciliam. Trade-off: sem
  abort, os timers tardios vivem até disparar (até 15 s) e a consulta `reconciled` recebe `finished_at = deadline_at`.
- **Dinheiro em centavos inteiros e taxa em decimal.** A Alfa compara `renda × 10` sem ponto flutuante; Price com
  half-up (nudge relativo de 1e-9), `i = 0` tratado, taxa em percentual rejeitada, `total = parcela × n`. Trade-off:
  o total difere em centavos de `PMT exato × n` e, a 0%, `interestCents` pode ficar negativo por dízima.
- **Financeiras como configuração e um simulador só.** `{ id, name, delays, monthlyRate, termsMonths, failureRate?,
  decide }`; `simulateLender` sorteia delay e erro e aplica o override do cenário sem tocar na regra; a quinta
  financeira é um arquivo e uma linha em `registry.ts`. Trade-off: um comportamento que o simulador não modela
  (outro código de erro, aprovação parcial) pede override novo.
- **Cadastro em 2 passos com rascunho bruto em cookie httpOnly.** `pm_draft` guarda as strings como digitadas, escrito
  só por Server Actions: "Voltar" grava sem validar e recarregar refaz a tela; o cliente valida no blur com o mesmo
  schema zod que o servidor revalida; o cenário vive na URL, no formulário e na coluna, nunca no cookie (senão
  "tentar um valor menor" repetiria `none_approve`). Trade-off: ~300 B por requisição e formatação no blur que
  reescreve o que foi digitado.
- **Server Actions para a interface e Route Handlers para o contrato, com os mesmos services.** Actions dão cookie,
  redirect e formulário sem JavaScript; handlers dão polling e `curl`. Trade-off: duas portas de entrada alinhadas
  pelo mesmo schema.
- **Cache Components.** Páginas não assíncronas com shell estático (título, trilho, as 4 linhas "Consultando") e um
  filho em `<Suspense>` que faz `await params`/`cookies()` e `await io()` antes de ler relógio e SQLite; handlers
  `GET` com `await connection()`. Trade-off: uma leitura síncrona fora desse padrão seria congelada no shell no build.
- **Vitest só em node, fake timers e SQLite em memória.** 538 testes em ~0,3 s: CPF, idade com data injetada, Price
  (28 fixtures), ordenações, regras, cenários, orquestração (encerra cedo, prazo, 500, resposta tardia sem alterar o
  banco, 4 presets com a persona A → 12/9/9/0), reconciliação, escolha, schema. Trade-off: sem testes de componente
  nem E2E; handlers sem teste unitário (precisam de request scope).
- **"Menor custo total" = total pago bruto, com cobertura visível.** Trade-off: a Beta lidera as duas ordenações
  porque financia menos; "Cobre 60%, faltam R$ 6.000,00" mantém a comparação honesta, sem custo por real financiado.
- **Uma escolha por consulta.** `UNIQUE (consultation_id)`; outra escolha → 409, a mesma → 200; validada contra o
  resultado gravado e recalculada no servidor. Trade-off: mudar de ideia exige nova consulta.
- **Escolha permitida com a consulta em andamento.** A primeira oferta útil aparece ~1 s depois, com a Alfa.
  Trade-off: dá para escolher antes de uma oferta melhor chegar; o aviso na tela cobre isso.
- **"Indisponível" conta como "não aprovou".** A tela diz quantas recusaram e quantas ficaram indisponíveis e sugere
  o passo que ajuda (`lower_amount` ou `retry`). Trade-off: a tela de motivo aparece mesmo com problema técnico.
- **Cookie não assinado.** Revalidação com zod a cada uso; adulterar só muda um rascunho que o servidor valida de
  novo. `Secure` por `COOKIE_SECURE` (a demo roda em HTTP). Trade-off: em produção seria selado.

## Contrato da API

JSON em todas as rotas; erros no formato `{ code, message, errors? }`; `Cache-Control: no-store` em tudo.

| Rota | Entrada | Respostas |
|---|---|---|
| `POST /api/consultations` | `{ patient: { fullName, cpf, birthDate, phone, monthlyIncomeCents }, treatmentAmountCents, scenario?, overrides? }` | `201 { consultationId, deadlineAt }`; `400` JSON inválido; `422` com `errors` agrupado por campo de primeiro nível (`patient`, `treatmentAmountCents`, `scenario`), ou sem `errors` se `overrides` for malformado |
| `GET /api/consultations/{id}` | — | `200 ConsultationSnapshot`; `404` |
| `POST /api/consultations/{id}/choice` | `{ lenderId, termMonths }` | `201 { choice }`; `200 { choice }` se for a mesma escolha (idempotente); `400` JSON inválido; `404`; `409 already_chosen`; `422` corpo inválido, `lender_not_approved` ou `term_not_offered` |
| `GET /api/health` | — | `200 { ok: true, db: 'ok' }`; `503 { ok: false, db: 'error' }` |
| `GET /api/lenders/metrics` | — | `200 { generatedAt, lenders: [{ lenderId, lenderName, calls, approved, refused, unavailable, errorRate, timeoutRate, lateAnswers, latencyP50Ms, latencyP95Ms }] }`, fluxo natural apenas |

A leitura do snapshot reconcilia: consulta `querying` com prazo vencido é fechada como `reconciled` antes de responder.
Tipo devolvido pelo `GET` (`src/domain/types.ts`, resumido aos campos):

```ts
type ConsultationSnapshot = {
  id: string; status: 'querying' | 'finished'; finishReason: 'all_responded' | 'deadline' | 'reconciled' | null;
  startedAt: number; deadlineAt: number; finishedAt: number | null; serverNow: number; timeoutMs: number; pollIntervalMs: number;
  forcedScenario: 'all_approve' | 'delta_error' | 'delta_timeout' | 'none_approve' | null; treatmentAmountCents: number;
  patient: { fullName: string; cpfMasked: string; ageYears: number };
  lenders: Array<{ lenderId: string; lenderName: string; status: 'querying' | 'approved' | 'refused' | 'unavailable';
                   reasonCode: string | null; approvedAmountCents: number | null; monthlyRate: number | null;
                   termsMonths: number[]; latencyMs: number | null }>;                    // ordem do registry
  offers: Array<{ lenderId: string; lenderName: string; termMonths: number; financedAmountCents: number; monthlyRate: number;
                  installmentCents: number; totalCents: number; interestCents: number; coveragePercent: number;
                  uncoveredCents: number; isPartial: boolean }>;                           // financeira × prazo
  summary: { approvedCount: number; refusedCount: number; unavailableCount: number; pendingCount: number;
             outcome: 'pending' | 'offers' | 'none_approved'; nextStep: 'choose' | 'wait' | 'lower_amount' | 'retry' | null };
  choice: { lenderId: string; lenderName: string; termMonths: number; financedAmountCents: number; monthlyRate: number;
            installmentCents: number; totalCents: number } | null;
};
```

Centavos inteiros, taxa em decimal (`0.0249` = 2,49% ao mês), timestamps em epoch ms, ids de `crypto.randomUUID()`.
O snapshot nunca carrega o CPF completo (só `cpfMasked`, como `***.982.247-**`), nem nascimento, celular ou renda.

## Modelo de dados

Quatro tabelas em `src/db/migrations.ts`, mais `schema_migrations` (o que já foi aplicado). Convenções: centavos
inteiros, taxa `REAL`, epoch ms, `terms_months` como JSON em `TEXT`.

| Tabela | Colunas principais |
|---|---|
| `patients` | `id`, `full_name`, `cpf` (11 dígitos, `UNIQUE`: o mesmo CPF reaproveita o paciente e atualiza os dados), `birth_date`, `phone`, `monthly_income_cents`, `created_at`, `updated_at` |
| `consultations` | `id`, `patient_id`, `treatment_amount_cents`, `patient_age_years`, `status` (`querying`, `finished`), `started_at`, `deadline_at`, `timeout_ms`, `finished_at`, `finish_reason`, `forced_scenario`, `created_at` |
| `lender_results` | `id`, `consultation_id`, `lender_id`, `lender_name`, `status` (`querying`, `approved`, `refused`, `unavailable`), `reason_code`, `approved_amount_cents`, `monthly_rate`, `terms_months`, `latency_ms`, `started_at`, `responded_at`, `late_responded_at`, `late_outcome_json`; `UNIQUE (consultation_id, lender_id)` |
| `chosen_offers` | `id`, `consultation_id` (`UNIQUE`: uma escolha por consulta), `lender_result_id` (a linha de `lender_results` usada, para a confirmação não depender da tabela atual), `lender_id`, `term_months`, `financed_amount_cents`, `monthly_rate`, `installment_cents`, `total_cents`, `created_at` |

- `lender_id` e `reason_code` não têm `CHECK` de propósito: a quinta financeira e um motivo novo entram sem migração.
  `status` e `finish_reason` têm, porque são vocabulário do app, não das financeiras.
- `late_responded_at` e `late_outcome_json`: a resposta que chegou depois do fechamento, guardada para métricas sem
  tocar no estado terminal.
- `patient_age_years`: a idade no dia da consulta (calendário civil em `TZ`), a que a Gama usou; um aniversário
  depois não muda a tela.
- `finish_reason`: `all_responded` (as quatro responderam antes do prazo), `deadline` (o prazo venceu com alguém
  pendente) ou `reconciled` (fechada numa leitura ou no boot, depois de um restart, com `finished_at = deadline_at`).

## Premissas

Não enviei perguntas sobre o enunciado: as premissas abaixo foram inferidas dele e valem como regra, no código e
nos testes:

- Limites inclusivos: 18 a 80 anos e R$ 1.000,00 a R$ 50.000,00. Idade em anos completos por data de calendário em
  `America/Sao_Paulo`, gravada em `patient_age_years` e usada pela Gama.
- Nome, celular e renda não têm regra no enunciado; adotei nome com ao menos duas palavras (3 a 120 caracteres),
  celular com 11 dígitos, DDD válido e nono dígito 9, renda maior que zero. CPF aceito com ou sem máscara e
  persistido só com dígitos; sequências repetidas rejeitadas.
- O mesmo CPF pode gerar nova consulta ("tentar um valor menor"); o paciente é reaproveitado por CPF e seus dados são
  atualizados. Cada submit do cadastro cria uma nova consulta (sem chave de idempotência; o botão desabilita no envio).
- "Indisponível" conta como "não aprovou" na tela de motivo; o próximo passo depende do mix (renda ou limite → valor
  menor; idade, forçada, erro, timeout ou valor já no mínimo → consultar de novo).
- Escolha permitida com a consulta em andamento, com o aviso "outras ofertas ainda podem chegar". Uma escolha por
  consulta: segunda escolha diferente → 409; a mesma → 200.
- Erro 500 da Delta sorteado no início da chamada e entregue depois do delay (ordem do sorteio: 1º delay, 2º erro).
  Sem retry nas financeiras; `src/orchestration/call-lender.ts` é onde entraria.
- Teto da Beta: 60% arredondado para baixo ao centavo. Parcela Price arredondada half-up; total = parcela × n.
  "Menor custo total" = total pago bruto, com cobertura e valor faltante destacados em cada oferta.
- `notFound()` dentro de `<Suspense>` devolve HTTP 200 com a tela de "não encontrada" (soft 404): aceito.
- Cookie do rascunho não assinado nem cifrado: todo uso passa pelo zod; cookie inválido ou de outra versão conta como
  ausente. Em produção seria selado.

## O que ficou de fora e o que faria com mais tempo

- SSE em `GET /api/consultations/{id}/events` com snapshot inicial, trocando só o corpo do hook de polling.
- Tela de métricas: hoje `GET /api/lenders/metrics` devolve só o JSON.
- Retry único na Delta em caso de 500, dentro do orçamento `deadline_at − now`, em `src/orchestration/call-lender.ts`.
- Cookie assinado (HMAC) para o rascunho.
- PostgreSQL: reescrever `src/db/client.ts`, as migrações e `src/server/repositories.ts`; o SQL explícito ajuda.
- Testes de componente (jsdom, `nuqs/adapters/testing`) e E2E; hoje os handlers só são exercitados por `scripts/demo-api.mjs`.
- `<ViewTransition>` entre os passos e na chegada das ofertas; acessibilidade além do básico (foco visível,
  `aria-live`, `role="alert"`, radiogroup), com revisão em leitor de tela.
- Filtro "só quem cobre tudo" e ordenação por juros: `interestCents` e `isPartial` já vêm no DTO; é um literal em
  `src/url-state/parsers.ts`, um `case` em `src/domain/sorting.ts` e uma opção no controle.
- Chave de idempotência no `POST /api/consultations` (hoje cada submit cria uma consulta).
- Trocar a escolha: hoje é uma por consulta; uma substituição explícita precisaria de rota própria e de histórico.

## Como usei IA

Usei o Claude Code (Anthropic) do início ao fim, e prefiro dizer exatamente onde.

- Antes de codar (25/10): o assistente leu o PDF do case e produziu, comigo revisando cada um, os documentos de
  preparação em `docs/` (01, 03, 05, 06) e o plano (`docs/07-plano-de-desenvolvimento.md`), depois de ler as docs do
  Next.js 16.4 que vêm no pacote (`node_modules/next/dist/docs/`), do nuqs, do React 19.3, do Node (`node:sqlite`) e do
  Vitest. O plano passou por uma revisão interna com agentes independentes de "planejamento" e "crítica", que o
  mudaram: cadastro em 2 passos em vez de 3, `node:sqlite` em vez de Drizzle, simulador sem abort para a resposta
  tardia ser observável, cenário nunca no cookie, entre outros.
- Na implementação (26/10): os módulos puros do domínio (`cpf`, `age`, `money`, `price`, `offers`, `sorting`,
  `summarize`, `registration-schema`) foram escritos por agentes em paralelo a partir de assinaturas que eu fixei e das
  fixtures de `docs/05-numeros-de-referencia.md`, e depois revisados por mim. Orquestrador, persistência, API, telas e
  os testes de orquestração e de escolha foram escritos interativamente com o assistente, trecho a trecho.
- Verificação: rodei a suíte, o `next build`, o `scripts/demo-api.mjs` e uma sessão real de navegador (Playwright)
  percorrendo cadastro, consulta, escolha e confirmação.
- Descartado ou corrigido: Drizzle (RC para `node:sqlite`, descartado antes de codar); um arquivo `'use server'` que
  exportava valores que não eram actions (o Next só aceita funções assíncronas nessas exportações); `Date.now()` no
  render, apontado pelas regras de lint do React Compiler, que virou `await io()` no servidor e
  `serverNow` + `performance.now()` no trilho do cliente.
- Este README também foi rascunhado com o assistente a partir dos docs e do código, e revisado por mim.

## Log de horas

Horários reais, tirados dos commits e dos arquivos. Os blocos T1 a T4 se sobrepõem porque os módulos puros do domínio
foram escritos por agentes em paralelo enquanto eu escrevia a orquestração e as telas; o total de relógio ficou
abaixo das 6 h esperadas por causa desse paralelismo, não por corte de escopo.

| Bloco | Início | Fim | Duração | Notas |
|---|---|---|---|---|
| Planejamento (25/10) | 12:10 | 13:45 | 1h35 | scaffold, pesquisa nas docs do Next 16.4, nuqs, React, Node e Vitest; docs/07 revisado por agentes |
| T0 setup e spike (26/10) | 00:30 | 00:36 | 0h06 | `node:sqlite` em `next dev` e `next build`; Docker; `.env.example`; docs copiados |
| T1 domínio | 00:37 | 00:55 | 0h18 | módulos puros por agentes em paralelo a partir das fixtures do arquivo 05; revisão |
| T2 persistência, orquestração e API | 00:40 | 00:58 | 0h18 | migrações, repositórios, `runConsultation`, snapshot, handlers; testes com fake timers |
| T3 cadastro | 00:45 | 00:58 | 0h13 | cookie do rascunho, actions, dois passos, validação na hora, seletor de cenário |
| T4 consulta | 00:50 | 01:00 | 0h10 | polling, painel, trilho, ofertas, escolha, confirmação, telas de erro |
| Verificação | 00:58 | 01:22 | 0h24 | suíte, build, `demo-api`, sessão no navegador (desktop e celular), Docker a partir de clone limpo |
| T5 README | 01:05 | 01:22 | 0h17 | este README |
| Bônus e revisão (26/10) | 08:20 | 08:50 | 0h30 | métricas por financeira, retomar consulta na home, revisão adversarial do código |

## Glossário

Código, rotas, colunas e commits em inglês; interface em pt-BR. pt-BR → inglês: paciente = patient ·
cadastro = registration · rascunho = draft · consulta = consultation · financeira = lender · pré-aprovação = pre-approval ·
oferta = offer · prazo = term (months) · parcela = installment · total pago = total · juros = interest ·
valor aprovado = approved amount · cobertura = coverage · cenário forçado = forced scenario · consultando = querying ·
aprovada = approved · recusada = refused · indisponível = unavailable · tempo esgotado = timeout · encerrada = finished ·
escolha = chosen offer · resposta tardia = late result.

## Documentos

| Arquivo | Conteúdo |
|---|---|
| `docs/01-requisitos-e-criterios.md` | checklist dos requisitos e critérios do enunciado, com os itens implícitos |
| `docs/03-alteracao-ao-vivo-e-demo.md` | pedidos prováveis da alteração ao vivo, personas A/B/C, roteiro da demo e checklists |
| `docs/05-numeros-de-referencia.md` | tabela Price, ordenações, fronteiras de idade, valor e CPF, resultados por cenário (fixtures dos testes) |
| `docs/06-decisoes-de-arquitetura.md` | decisões D1 a D14 com contexto, opções e o que registrar |
| `docs/07-plano-de-desenvolvimento.md` | plano SDD: constituição, especificação, plano técnico, tarefas, demo, decisões A1 a A15 e glossário |
