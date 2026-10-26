# Plano de desenvolvimento (SDD)

> Escrito em 25/10/2026 a partir dos arquivos 00–06, das docs do Next 16.4.3 (bundle em `node_modules/next/dist/docs/`), do nuqs 2.10.2, do React 19.3, do Node 24 (`node:sqlite`), do Vitest 5 e do spec-kit, e revisado por um painel de três planos independentes e dois críticos. Os achados detalhados estão em [`research/`](research/).

Este arquivo é o artefato de Spec-Driven Development do case: constituição, especificação, plano técnico e tarefas, nesta ordem, como no spec-kit do GitHub, condensados num único documento porque o orçamento é de 6 horas. Ele não repete os requisitos (01), as armadilhas (02), os números (05) nem os trade-offs (06): aponta para eles. Lido do início ao fim, deve permitir implementar sem tomar nenhuma decisão nova. Vai para o repositório em `docs/07-plano-de-desenvolvimento.md` junto com 01, 03, 05 e 06.

## 0. Resumo

- **Um único app Next.js 16.4.3** (App Router) é front, API e orquestrador, num processo Node persistente (Docker Compose, `output: 'standalone'`), nunca serverless, porque a consulta às financeiras continua até 10 s depois da resposta do POST.
- **Estado com dono claro**: slug da rota = etapa da jornada; query string (nuqs) = estado de interface (`sort`, `scenario`, `hint`); cookie httpOnly `pm_draft` = rascunho bruto do cadastro; SQLite = verdade da consulta, dos resultados por financeira e da escolha. Nenhum dado pessoal em URL ou log.
- **Dois transportes, um serviço**: Server Actions para as mutações da UI (cookie, redirect, funciona sem JS) e Route Handlers REST expondo os mesmos services (polling do front e `curl` do avaliador).
- **Domínio puro e testado primeiro**: CPF, idade (data de calendário injetada), dinheiro em centavos inteiros, Price (half-up, `i = 0`), ordenação determinística, regra de cada financeira, resumo do resultado, orquestração com relógio e sorteio injetados. Vitest em ambiente node, fake timers, SQLite em memória, suíte < 5 s.
- **Banco**: `node:sqlite` (embutido no Node 24, síncrono, zero dependência), SQL escrito à mão, migrações num array aplicadas no boot; WAL e `busy_timeout`.
- **Financeiras são dados**: lista de objetos de configuração atrás de um único simulador; cenários forçados são overrides por financeira escolhidos em `?scenario=` e gravados na consulta; a 5ª financeira é um arquivo e uma linha.
- **Design com direção própria**: "ficha clínica que vira carnê" em porcelana, tinta teal e menta; uma família tipográfica (Bricolage Grotesque, eixos variáveis); um único elemento ousado, o painel de pré-aprovação com trilho de 10 s.
- **Idioma**: código, rotas, colunas, commits em inglês; toda string visível em pt-BR em `src/copy/pt-BR.ts`; `<html lang="pt-BR">`.
- **Orçamento**: 5 h 30 em seis blocos com checkpoint + 30 min de reserva e ensaio; linhas de corte decididas antes de começar; ao bater 6 h, parar e registrar no README.

## 1. Ponto de partida

### 1.1 O que já existe em `app/`

| Item | Estado | Consequência |
|---|---|---|
| `next@16.4.3`, `react@19.3.0`, `react-dom@19.3.0` | scaffold | APIs de request **assíncronas** (`await cookies()`, `await params`, `await searchParams`); `middleware.ts` virou `proxy.ts`; Turbopack padrão em dev e build; tipos globais `PageProps<'/rota'>`, `LayoutProps`, `RouteContext` gerados por `next typegen`/`next dev`; `next lint` não existe (script `lint` roda `eslint`) |
| `next.config.ts`: `cacheComponents: true`, `partialPrefetching: true`, `experimental.agentFeedback: true`, loader `@tailwindcss/turbopack` | scaffold | **Toda** leitura de request (`cookies()`, `params`, `searchParams`) e toda leitura de banco precisam estar dentro de `<Suspense>` ou o `next build` falha; leitura **síncrona** de SQLite conta como "valor previsível" e seria congelada no shell estático se não vier depois de `await params`/`cookies()`/`io()`/`connection()`; `export const dynamic/revalidate/runtime/dynamicParams` não existem mais; rotas anteriores ficam montadas (`<Activity>`), efeitos são limpos ao esconder e re-executados ao voltar; `agentFeedback` só afeta `next dev` (manter) |
| `tailwindcss@4.3.3` via loader Turbopack, sem `postcss.config` | scaffold | Tokens em `@theme inline` no `globals.css`; nunca buildar com `--webpack`; remover `body { font-family: Arial }` e o bloco `prefers-color-scheme: dark` do scaffold |
| `eslint@9` flat config + `eslint-config-next@16.4.3` (inclui `react-hooks@7` com regras do React Compiler: `set-state-in-effect`, `incompatible-library`) | scaffold | Não hidratar formulário com `useEffect` + `setState`; `react-hook-form` seria sinalizado (`watch()`); valores iniciais vêm do servidor como `defaultValue` |
| `typescript@5.9`, `@types/node@20` | scaffold | **Subir `@types/node` para `^24`** (tipos de `node:sqlite` e runtime real) |
| Node 24.21 (nvm), pnpm 10.18.2 (corepack), Docker 29.5 | máquina | `node:sqlite` testado nesta máquina: `DatabaseSync` funciona sem flag (SQLite 3.53.4) |
| Repositório git em `app/` (1 commit, sem remote); `AGENTS.md` gerado pelo `next dev` sem commit | | **`app/` é a raiz do repositório** (decisão A1): copiar 01, 03, 05, 06 e 07 para `app/docs/` no T0; commitar `AGENTS.md`; `.gitignore` do scaffold ignora `.env*` → adicionar `!.env.example`, `data/`, `.vitest/` |

### 1.2 Restrições do case que moldam o plano

- Entrega até **26/10/2026 18h**, link de repositório GitHub respondendo ao e-mail; 4 a 6 h de trabalho; ao bater 6 h, parar e escrever no README o que faria em seguida.
- Critérios (00): comportamento sob falha, arquitetura do front, API e backend, correção, testes, comunicação. "Valorizamos mais as decisões bem explicadas do que a quantidade de funcionalidades."
- Conversa de 60 min: demo dos 4 cenários (15), decisões (20), **alteração ao vivo** revelada na hora (25). O código precisa ser navegável sob pressão: cada regra, constante e contrato num lugar só (§6).

## 2. Constituição

Princípios que valem como portões de qualidade (constitution check) do plano e de cada bloco. Versão 1.0.0, ratificada em 25/10/2026.

1. **Falha é o caminho normal.** Toda tela e todo contrato assumem resposta parcial, atraso, erro e ausência. Nenhum estado "preso": pendente com prazo vencido vira indisponível na leitura; a falha da própria API tem mensagem e "tentar de novo".
2. **Domínio puro, sem framework.** Validações, cálculo, ordenação, regras de financeira, resumo do resultado e orquestração são funções sem I/O, com relógio, sorteio, agendador e repositório injetados. `src/domain` não importa nada do projeto nem do Next.
3. **Dinheiro em centavos inteiros; taxa como decimal nomeado (`monthlyRate = 0.0249`).** Formatação pt-BR só na borda de apresentação. Percentuais de regra são inteiros (`BETA_CAP_PERCENT = 60`).
4. **O servidor é a fonte da verdade.** Validação repetida no backend com o mesmo schema; deadline medido e persistido no servidor; escrita condicional por estado terminal; escolha validada contra o resultado gravado e guardada com snapshot.
5. **Estado com dono único.** Slug = etapa; query (nuqs) = interface; cookie httpOnly = rascunho bruto; banco = consulta. Nada duplicado: o cenário vive na URL, no formulário e na coluna, nunca no cookie.
6. **Test-first nas partes críticas (inegociável):** CPF, idade, Price, ordenação, regra de cada financeira, resumo do resultado, orquestração (encerra cedo, deadline, erro 500, resposta tardia, presets), reconciliação, escolha.
7. **Simplicidade e uso direto do framework.** Sem ORM, sem biblioteca de formulário, sem camada sobre Next/nuqs; cada dependência paga seu custo em 6 h. Adicionar uma financeira é um objeto a mais numa lista.
8. **Idioma e privacidade.** Código, rotas, colunas e commits em inglês; UI em pt-BR num único módulo de cópia com glossário; CPF, nascimento, celular e renda nunca em URL, log ou resposta do snapshot (só `cpfMasked`).

Portões aplicados antes de codar e ao fim de cada bloco: (a) nenhuma regra de negócio fora de `src/domain`; (b) nenhum `if` de cenário dentro de regra de aprovação; (c) centavos inteiros fora da apresentação; (d) toda leitura de request/banco dentro de `<Suspense>` e precedida de API de request ou `io()`/`connection()`; (e) teste escrito antes da implementação nos itens do princípio 6; (f) nenhuma string visível fora de `src/copy/pt-BR.ts` e dos schemas.

## 3. Especificação

### 3.1 Histórias de usuário (priorizadas, testáveis sozinhas)

A usuária é a atendente da clínica, com o paciente na frente.

**US1 (P1) — Cadastrar o paciente em dois passos sem perder nada.**
Independentemente testável: preencher os dois passos, voltar, recarregar, avançar; nenhum dado some; dados inválidos são apontados na hora.
- Dado o passo "Dados do paciente", quando digito `111.111.111-11` e saio do campo, então vejo "CPF inválido. Confira os 11 dígitos." antes de enviar.
- Dado o passo "Renda e tratamento" preenchido, quando clico "Voltar" e depois "Continuar", então todos os campos dos dois passos continuam preenchidos (inclusive um valor inválido que eu ainda estava digitando).
- Dado qualquer passo, quando recarrego a página, então os campos vêm preenchidos do rascunho.
- Dado um valor R$ 999,99, quando tento continuar, então vejo "Informe um valor entre R$ 1.000,00 e R$ 50.000,00." e não avanço.

**US2 (P1) — Ver a pré-aprovação chegar financeira por financeira, com prazo máximo de 10 s.**
Independentemente testável: ao enviar o cadastro, a tela mostra 4 linhas em "Consultando" no primeiro quadro, cada uma muda de status quando a financeira responde, e tudo fecha em no máximo 10 s.
- Dado o envio do cadastro, quando a consulta começa, então vejo Alfa, Beta, Gama e Delta como "Consultando" e um trilho de tempo.
- Dado que a Alfa respondeu em 1,2 s, quando o próximo polling chega, então a linha da Alfa mostra "Aprovada", "100% do tratamento, 2,49% ao mês" e "1,2 s".
- Dado que a Delta não respondeu em 10 s, quando o prazo vence, então a Delta aparece "Indisponível, sem resposta em 10 s" e a consulta fecha; uma resposta que chegue depois não muda nada.
- Dado que o servidor reiniciou no meio da consulta, quando recarrego, então pendentes vencidos aparecem como indisponíveis e a consulta está encerrada.

**US3 (P1) — Comparar ofertas e escolher uma.**
Independentemente testável: com ao menos uma aprovação, a lista mostra financeira × prazo com parcela, total e cobertura; ordeno por menor parcela e por menor total; escolho uma e vejo a confirmação.
- Dado tratamento de R$ 10.000 e as quatro aprovadas, quando ordeno por menor parcela, então a ordem é exatamente a da tabela de referência (05): Beta 24x R$ 316,87 primeiro.
- Dado que a Beta aprovou 60%, quando vejo a oferta, então leio "Cobre 60%, faltam R$ 4.000,00".
- Dado que escolhi Alfa 12x, quando a escolha é salva, então vejo a confirmação com parcela R$ 974,28, total R$ 11.691,36 e CPF mascarado; a segunda tentativa de escolher na mesma consulta é recusada.

**US4 (P1) — Demonstrar os quatro cenários pela interface, sem reiniciar nada.**
Independentemente testável: com `?scenario=` ou pelo seletor do último passo, cada preset reproduz a tabela "Cenários forçados: resultados esperados" (05) para a persona A.
- Dado `scenario=none_approve`, quando a consulta termina, então vejo "Nenhuma financeira aprovou", os motivos por financeira e o botão "Tentar com um valor menor", que volta ao passo do valor com tudo preenchido e sem o cenário.
- Dado `scenario=delta_timeout`, quando o prazo vence, então a Delta está indisponível por tempo e há 9 ofertas.

**US5 (P2) — Retomar a jornada depois de recarregar.** Sai da arquitetura: slug + cookie + banco. Teste: reload em qualquer tela reconstrói o estado.

**US6 (P3) — Métricas por financeira.** `latency_ms`, `reason_code` e `late_*` já ficam gravados; o endpoint agregador é evolução.

### 3.2 Requisitos funcionais (rastreáveis a 01)

| ID | Requisito | Onde |
|---|---|---|
| FR-001 | Campos: nome completo, CPF, data de nascimento, celular, renda mensal, valor do tratamento | §4.4 |
| FR-002 | CPF com dígitos verificadores válidos; rejeitar sequências repetidas; aceitar com ou sem máscara; persistir só dígitos | `src/domain/cpf.ts` |
| FR-003 | Idade entre 18 e 80 anos, inclusive, em anos completos por data de calendário; data inválida e futura com mensagens próprias | `src/domain/age.ts` |
| FR-004 | Valor do tratamento entre R$ 1.000,00 e R$ 50.000,00, inclusive | `registration-schema.ts` |
| FR-005 | Celular com 11 dígitos, DDD válido e nono dígito 9; renda > 0; nome com ≥ 2 palavras (3–120 caracteres) | idem |
| FR-006 | Validação na hora: por campo ao sair dele após o primeiro toque e, depois de inválido, a cada digitação; passo ao avançar; tudo de novo no servidor | §4.4 |
| FR-007 | Formulário em 2 passos; nada se perde ao voltar (inclusive valores brutos) nem ao recarregar | §4.2, §4.4 |
| FR-008 | Mesmo CPF pode gerar nova consulta (paciente reaproveitado por CPF) | `consultations.service.ts` |
| FR-009 | Ao enviar, o backend consulta as 4 financeiras em paralelo e devolve o id imediatamente | §4.7 |
| FR-010 | A tela mostra o status de cada financeira (consultando, aprovada, recusada, indisponível) desde o primeiro quadro e os atualiza conforme chegam | §4.5 |
| FR-011 | Espera máxima de 10 s (`CONSULTATION_DEADLINE_MS`); a consulta encerra antes se as quatro responderem | §4.7 |
| FR-012 | Quem não respondeu no prazo aparece como indisponível (motivo `timeout`); erro 500 aparece como indisponível (motivo `http_500`); respostas tardias não alteram estado terminal | §4.7 |
| FR-013 | Leitura reconcilia pendentes com prazo vencido (servidor reiniciado) | `snapshot.ts` |
| FR-014 | Se nenhuma aprovar (recusas e indisponíveis somadas), a tela explica o motivo de cada uma e sugere o próximo passo conforme o mix | `summarize.ts` |
| FR-015 | Cada financeira aprovada devolve valor aprovado, taxa mensal e prazos; a oferta é o par financeira × prazo com parcela (Price) e total (parcela × n) | `offers.ts`, `price.ts` |
| FR-016 | Deixar claro quando o valor aprovado é menor que o tratamento (cobertura % e valor que falta) | §4.5 |
| FR-017 | Ordenar por menor parcela (padrão) e por menor total, com desempate determinístico; critério na URL (`?sort`) | `sorting.ts` |
| FR-018 | Escolha salva no servidor após validar financeira aprovada e prazo ofertado; uma por consulta (segunda → 409); snapshot do cálculo; tela de confirmação | `choices.service.ts` |
| FR-019 | Financeiras simuladas conforme a tabela do enunciado, delay uniforme na faixa, erro 500 da Delta em 30 % decidido no início e entregue após o delay | `src/lenders/*` |
| FR-020 | Cenários forçados `all_approve`, `delta_error`, `delta_timeout`, `none_approve` acionáveis pela UI (`?scenario=`) e gravados na consulta; override granular por financeira na API | `scenarios.ts` |
| FR-021 | Banco relacional com cadastro, consulta, resultado por financeira e oferta escolhida | §4.9 |
| FR-022 | API HTTP com contrato explícito consumida pelo front (polling) e por qualquer cliente | §4.6 |
| FR-023 | Testes automatizados: CPF, parcela, orquestração (deadline e falhas) | §4.12 |
| FR-024 | Falha da própria API tratada: polling com limite e retry que reaproveita o id; erro ao criar consulta e ao salvar escolha com mensagem | §4.10 |
| FR-025 | Um comando para rodar (`docker compose up`) e caminho sem Docker | §4.13 |

### 3.3 Critérios de sucesso (mensuráveis)

- SC-001 A consulta encerra em ≤ `deadline + 500 ms` quando alguma financeira não responde, e em ≤ `max(latências) + 500 ms` quando todas respondem.
- SC-002 Os 4 status aparecem no primeiro quadro da tela de consulta (estão no shell estático).
- SC-003 Resposta tardia nunca altera o banco: teste avança até deadline + 2 s e afirma banco inalterado e log `late_result_ignored`.
- SC-004 Os 12 valores da tabela Price e as 3 ordenações de 05 batem centavo a centavo.
- SC-005 Cada preset reproduz a tabela "Cenários forçados" (05) para a persona A: 12, 9, 9 e 0 ofertas.
- SC-006 Suíte de testes < 5 s; `pnpm build` sem erro de prerender; `docker compose up` em pasta limpa sobe em um comando.
- SC-007 Zero texto visível em inglês; zero dado pessoal em URL, log ou snapshot.
- SC-008 Cada pedido da tabela de alteração ao vivo (§6) cabe em ≤ 15 min e tem onde ser testado.

### 3.4 Casos de borda e premissas

Casos de borda: ver 02 (17 armadilhas) e 05 (fronteiras de idade, valor, CPF; arredondamento da Beta). Premissas adotadas (04, confirmadas ou estendidas aqui; viram a seção 8 do README):

- Limites inclusivos (18–80 anos; R$ 1.000–50.000). Idade em anos completos por data de calendário em `America/Sao_Paulo`; gravada em `patient_age_years` na consulta e usada pela Gama.
- "Indisponível" conta como "não aprovou" para a tela de motivo.
- Escolha permitida com a consulta em andamento, com aviso "outras ofertas ainda podem chegar".
- Erro 500 da Delta sorteado no início e entregue após o delay (ordem de consumo do sorteio: 1º delay, 2º erro).
- Sem retry (o wrapper `callLender` é o ponto onde entraria).
- "Menor custo total" = total pago bruto, com cobertura e valor faltante destacados.
- Uma escolha por consulta; segunda tentativa → 409 (mesma financeira e prazo → 200 idempotente).
- Cada submit do cadastro cria uma nova consulta (sem chave de idempotência; botão desabilitado + 303). Documentado.
- `notFound()` dentro de Suspense devolve HTTP 200 com soft-404: aceito.
- Cookie não assinado nem cifrado: todo uso revalida com zod; cookie inválido ou de versão diferente = ausente; em produção seria selado.

## 4. Plano técnico

### 4.1 Arquitetura e pastas

```
Navegador (clínica)
  │ HTML/RSC streaming        │ Server Actions (form)       │ fetch JSON (polling, no-store)
  ▼                           ▼                             ▼
Next.js 16 (processo Node persistente)
  app/… páginas RSC finas     app/…/actions.ts              app/api/… Route Handlers finos
  └────────────┬──────────────┴──────────────┬─────────────┘
               ▼                             ▼
        src/server (services, repositories, cookies, clock, log)
               │                             │
               ▼                             ▼
        src/db (node:sqlite, MIGRATIONS)   src/orchestration (deadline, race, settle condicional)
                                             │
                                             ▼
                                      src/lenders (registry, simulate, scenarios)
                                             │
                                             ▼
                                      src/domain (money, cpf, age, price, sorting, offers, summarize, schemas, types)
```

Regras de dependência: `domain` → nada; `lenders` → `domain`; `orchestration` → `lenders`, `db`; `server` → tudo acima; `app/` → `server` e `domain`/`copy`/`url-state`, nunca `db` nem `lenders` direto; `components` → `domain` (tipos, formatação, ordenação), `copy`, `url-state`, e recebe Server Actions por import de arquivo `'use server'`.

```
app/                                   # raiz do repositório
├── app/                               # App Router (continua na raiz; não mover)
│   ├── layout.tsx                     # lang="pt-BR", fontes, metadata template, <NuqsAdapter>
│   ├── page.tsx                       # "/" estático: "Nova simulação" + deep links de demo
│   ├── error.tsx  not-found.tsx  global-error.tsx
│   ├── register/[step]/page.tsx       # 2 passos (generateStaticParams: patient, financing)
│   ├── register/actions.ts            # 'use server': saveStep (intent next|back), startConsultation, startNewSimulation, applyPersona (dev)
│   ├── consultations/[id]/page.tsx    # painel + ofertas
│   ├── consultations/[id]/confirmation/page.tsx
│   ├── consultations/actions.ts       # 'use server': chooseOffer
│   └── api/
│       ├── health/route.ts
│       ├── consultations/route.ts                 # POST
│       ├── consultations/[id]/route.ts            # GET snapshot
│       └── consultations/[id]/choice/route.ts     # POST
├── src/
│   ├── domain/        money.ts cpf.ts age.ts price.ts offers.ts sorting.ts summarize.ts registration-schema.ts registration-steps.ts types.ts (+ *.test.ts ao lado)
│   ├── lenders/       registry.ts alfa.ts beta.ts gama.ts delta.ts simulate.ts scenarios.ts errors.ts
│   ├── orchestration/ run-consultation.ts call-lender.ts clock.ts
│   ├── db/            client.ts migrations.ts
│   ├── server/        consultations.service.ts choices.service.ts snapshot.ts repositories.ts draft-cookie.ts config.ts log.ts
│   ├── url-state/     parsers.ts (sort, scenario, hint)
│   ├── copy/          pt-BR.ts
│   └── components/    form/ register/ consultation/ offers/ layout/
├── docs/              01, 03, 05, 06, 07 copiados; research/ opcional
├── public/
├── Dockerfile  compose.yaml  .dockerignore  .env.example
├── vitest.config.mts  next.config.ts  tsconfig.json  eslint.config.mjs  package.json
└── README.md
```

`tsconfig` `paths: { "@/*": ["./*"] }` já cobre `@/src/...` e `@/app/...`; nada a mudar.

### 4.2 Modelo de estado

**URL — slug (etapa):** `/` · `/register/patient` · `/register/financing` · `/consultations/[id]` · `/consultations/[id]/confirmation`. Slug desconhecido em `/register/[step]` → `notFound()` via função de asserção. Confirmação sem escolha → `redirect` para a consulta. Consulta com escolha feita → **sem redirect**: faixa "Oferta escolhida" com link para a confirmação e botões "Escolher" desabilitados (o botão Voltar do navegador não entra em loop).

**URL — query (nuqs, `src/url-state/parsers.ts`, um módulo compartilhado por cliente e servidor):**

| Chave | Onde | Parser | Opções | Quem escreve |
|---|---|---|---|---|
| `sort` | `/consultations/[id]` | `parseAsStringLiteral(['installment','total']).withDefault('installment')` | `shallow: true`, `history: 'replace'`, `clearOnDefault: true` | radiogroup de ordenação (`useQueryState`); servidor lê via `createLoader` para o SSR já ordenado |
| `scenario` | `/register/*` | `parseAsStringLiteral(SCENARIO_IDS)` (nulo = natural) | `shallow: true`, `history: 'replace'` | `<select name="scenario">` do passo `financing` (`useQueryState`); também é campo do form; as actions repassam `?scenario=` nos redirects entre passos quando ≠ natural; deep links de demo; a URL da consulta **nunca** carrega `scenario` (fonte = coluna) |
| `hint` | `/register/financing` | `parseAsStringLiteral(['lower_amount','retry'])` | `shallow: true` | link "Tentar com um valor menor" / "Consultar de novo"; só muda o texto do banner e o foco |

`<NuqsAdapter>` (`nuqs/adapters/next/app`) no `app/layout.tsx`. Todo componente com `useQueryState` fica dentro de `<Suspense>` (regra do `useSearchParams`; sem isso o `next build` falha). Nunca PII na query.

**Cookies (escritos só em Server Actions; lidos em Server Components dentro de `<Suspense>`):**

| Cookie | Conteúdo | Atributos | Escreve | Lê | Apaga |
|---|---|---|---|---|---|
| `pm_draft` | `{ v: 1, patient?: { fullName, cpf, birthDate, phone }, financing?: { monthlyIncome, treatmentAmount }, updatedAt }` — **strings brutas como digitadas** (≈ 300 B) | `httpOnly`, `sameSite: 'lax'`, `path: '/'`, `maxAge: 86400`, `secure: COOKIE_SECURE === 'true'` | `saveStep` (intent `next` valida e mescla normalizado-de-volta-a-string; intent `back` mescla bruto sem validar), `applyPersona` | página de cada passo (pré-preenche), `startConsultation` (revalida tudo), banner de "tentar valor menor" | `startNewSimulation` |
| `pm_last_consultation` | id | idem, `maxAge: 604800` | `startConsultation` | `/` ("Retomar consulta", linha de corte) | `startNewSimulation` |

Parse com `draftCookieSchema.safeParse`; falha ou `v` diferente = cookie ausente; nunca logar o conteúdo.

**Servidor (SQLite):** §4.9. **Memória do cliente:** só efêmero (campo tocado, `useActionState` do passo, estado do polling, erro de rede).

**Fluxos cobertos:** voltar um passo (botão `intent=back` grava bruto e redireciona; `<Link>` seria perda do que foi digitado); recarregar em qualquer tela; botão voltar do navegador (`history: 'replace'` nas queries; Activity mantém inputs; `key` por passo e limpeza de `fieldErrors` no cleanup de `useLayoutEffect` evitam mensagens velhas); "nenhuma aprovou" → `/register/financing?hint=lower_amount` (ou `retry`) sem `scenario`, foco no valor, novo submit cria nova consulta do mesmo paciente; "Nova simulação" limpa os cookies e redireciona para `/register/patient`; deep link num passo sem o passo anterior → `redirect` para o primeiro passo faltante preservando `?scenario=`.

### 4.3 Rotas, páginas e regras de Cache Components

Padrão fixo em todas as páginas: componente de página **não async**, shell estático (título, trilho de passos, skeleton com as dimensões finais), e um componente async pequeno dentro de `<Suspense>` que faz `await params`/`await cookies()`/`await searchParams` e **só então** lê o banco (API de request antes da leitura síncrona; nos handlers, `await connection()` antes de tudo). Páginas passam a promise de `params` para baixo. Fallbacks são componentes estáticos. `loading.tsx` não é usado (colapsaria a página inteira).

| Rota | Servidor | Cliente | Dados |
|---|---|---|---|
| `/` | estático: título, "Nova simulação" → `/register/patient`, deep links de demo (personas × cenários) | — | — |
| `/register/[step]` | `generateStaticParams` com os 2 slugs; `assertStep(slug)` → `notFound()`; shell com título e trilho; `<Suspense><StepForm step params/></Suspense>` lê `pm_draft` e aplica guard | campos com validação por toque (zod), máscaras no blur, `useActionState`, `useFormStatus`; `ScenarioSelect` (nuqs) dentro de Suspense | cookie |
| `/consultations/[id]` | `<Suspense fallback={<LenderBoardSkeleton/>}>` (4 linhas "Consultando" já no shell) → `ConsultationView` faz `await params`, `await io()`, lê snapshot (`notFound()` se não existir), lê `?sort` via `createLoader` | `LiveConsultation initial pollIntervalMs`: polling, painel, ofertas ordenadas (função pura), escolha, faixa "escolhida" | banco |
| `/consultations/[id]/confirmation` | lê consulta + escolha; sem escolha → `redirect` | "Nova simulação" (action) | banco |
| `error.tsx` | — | `{ error: unknown; retry }` → "Algo deu errado" + código `digest` + "Tentar novamente" | — |
| `not-found.tsx` / `global-error.tsx` | "Consulta não encontrada" + "Nova simulação"; `global-error` importa o próprio CSS | | |
| `api/*` | §4.6 | — | banco |

`<ViewTransition>`, `typedRoutes` e dark mode ficam fora (linhas de corte).

### 4.4 Cadastro em 2 passos (US1)

- **Registry** `src/domain/registration-steps.ts`: `[{ slug: 'patient', fields: ['fullName','cpf','birthDate','phone'] }, { slug: 'financing', fields: ['monthlyIncome','treatmentAmount'] }] as const`. Títulos e textos em `copy/pt-BR.ts`.
- **Schemas** (`registration-schema.ts`, zod 4): `patientStepSchema` e `financingStepSchema` recebem strings pt-BR e devolvem valores normalizados (`cpf` só dígitos, `phone` só dígitos, `birthDate` ISO, `monthlyIncomeCents`, `treatmentAmountCents`); `createConsultationInputSchema({ today })` para o POST e para `startConsultation`; mensagens em pt-BR via `{ error }`; erros por campo com `z.flattenError`. A mesma função `ageInYears(birthISO, todayISO)` vale para o cadastro e para a Gama.
- **Action `saveStep(step, prev, formData)`** (`action.bind(null, step)`): lê `intent` (`next` | `back`); `back` → mescla campos brutos no cookie sem validar e `redirect(previousStep + scenarioQuery)`; `next` → `safeParse`; inválido → `{ fieldErrors, values }` (inputs usam `defaultValue={state.values?.x ?? draft.x}` sob `key` por tentativa, porque React 19 reseta inputs não controlados); válido → grava cookie, `redirect(nextStep + scenarioQuery)` **fora** de try/catch.
- **Action `startConsultation(prev, formData)`** no passo `financing`: valida o passo e o rascunho completo; `scenario` vem do próprio `<select>`; cria/reaproveita paciente por CPF, cria consulta + 4 resultados `querying` numa transação, agenda `after(() => runConsultation(id))`, grava `pm_last_consultation`; erro de banco → `{ formError }`; `redirect('/consultations/{id}')` fora do try.
- **Validação na hora** no cliente: blur após primeiro toque, depois a cada digitação se inválido; `aria-invalid`, `aria-describedby`, foco no primeiro erro ao submeter, `role="alert"` para erro do servidor.
- **Máscaras** só no blur (CPF `000.000.000-00`, celular `(11) 90000-0000`, moeda `R$ 1.000,00` com `inputMode="decimal"`); normalização no servidor (`parseBRL`). Botões "Voltar" e secundários com `type="submit" name="intent"` ou `type="button"`.
- **Persona (dev):** `applyPersona(persona, scenario)` grava o cookie da persona A/B/C (03) e redireciona ao passo `financing`; links na home.
- Funciona sem JS (form POST + 303); com JS ganha validação instantânea e `pending`.

### 4.5 Consulta, ofertas, escolha e confirmação (US2, US3, US4)

- Página única para painel + ofertas (primeira oferta útil assim que a Alfa responde); aviso "Consulta em andamento: outras ofertas ainda podem chegar" até `finished`.
- **Painel**: linhas na ordem do registry, atualizadas por `lenderId`; status com glifo + texto; motivo como subtexto (`REASON_LABELS`, com fallback "Recusada pela política da financeira"); latência "1,2 s"; trilho de tempo ancorado em `deadlineAt - serverNow` + `performance.now()` (nunca `Date.now()` no render).
- **Ofertas**: lista achatada (≤ 12) já calculada no servidor; cliente só ordena com `sortOffers`; cada linha: `24×`, parcela, total, "Cobre 60%, faltam R$ 4.000,00" quando parcial, botão "Escolher".
- **Nenhuma aprovou** (`summary.outcome === 'none_approved'`): título, contagem (quantas recusaram, quantas indisponíveis), motivo por financeira e CTA por `summary.nextStep`: `lower_amount` → "Tentar com um valor menor"; `retry` → "Consultar de novo".
- **Escolha**: `chooseOffer(consultationId, lenderId, termMonths)` via `useActionState`/`useTransition`; servidor valida contra o resultado gravado (financeira aprovada nesta consulta, prazo ofertado), recalcula, grava snapshot; erros em pt-BR por código (404/409/422/rede); só o `redirect` para a confirmação confirma.
- **Confirmação**: financeira, prazo, parcela, total, valor financiado, cobertura, CPF mascarado, "Nova simulação".

### 4.6 Contrato HTTP e DTO

| Método e rota | Entrada | Saída | Erros |
|---|---|---|---|
| `POST /api/consultations` | `{ patient: { fullName, cpf, birthDate, phone, monthlyIncomeCents }, treatmentAmountCents, scenario?, overrides? }` | `201 { consultationId, deadlineAt }` | `400` JSON inválido; `422 { errors: { field: [msg] } }` |
| `GET /api/consultations/{id}` | — | `200 ConsultationSnapshot` (`Cache-Control: no-store`) | `404` |
| `POST /api/consultations/{id}/choice` | `{ lenderId, termMonths }` | `201 { choice }` (`200` se idêntica) | `404`, `409` já escolhida, `422` financeira não aprovada / prazo não ofertado |
| `GET /api/health` | — | `200 { ok: true, db: 'ok' }` | — |

```ts
type ConsultationSnapshot = {
  id: string; status: 'querying' | 'finished'; finishReason: 'all_responded' | 'deadline' | 'reconciled' | null;
  startedAt: number; deadlineAt: number; finishedAt: number | null; serverNow: number; timeoutMs: number; pollIntervalMs: number;
  forcedScenario: ScenarioId | null; treatmentAmountCents: number;
  patient: { fullName: string; cpfMasked: string; ageYears: number };
  lenders: Array<{ id: string; name: string; status: LenderStatus; reasonCode: string | null; latencyMs: number | null;
                   approvedAmountCents: number | null; monthlyRate: number | null; termsMonths: number[] }>;   // ordem do registry
  offers: Array<{ lenderId: string; lenderName: string; termMonths: number; financedAmountCents: number; monthlyRate: number;
                  installmentCents: number; totalCents: number; interestCents: number; coveragePercent: number; uncoveredCents: number; isPartial: boolean }>;
  summary: { approvedCount: number; refusedCount: number; unavailableCount: number; pendingCount: number;
             outcome: 'pending' | 'offers' | 'none_approved'; nextStep: 'choose' | 'wait' | 'lower_amount' | 'retry' | null };
  choice: { lenderId: string; termMonths: number; installmentCents: number; totalCents: number; financedAmountCents: number; monthlyRate: number } | null;
};
```

Convenções: JSON, centavos inteiros, taxa decimal, timestamps epoch ms, ids `crypto.randomUUID()`, erros `{ code, message, errors? }`, nunca CPF completo. Server Actions e handlers chamam os **mesmos services**. Evoluções fora do contrato (README "faria com mais tempo"): `GET …/events` (SSE), `GET /api/lenders/metrics`.

### 4.7 Financeiras, cenários e orquestração (US2, US4)

```ts
// src/lenders/registry.ts
type LenderConfig = { id: string; name: string; minDelayMs: number; maxDelayMs: number; monthlyRate: number; termsMonths: number[];
                      failureRate?: number; decide(input: QuoteInput): Decision };
export const LENDERS: readonly LenderConfig[] = [alfa, beta, gama, delta];   // a 5ª é um arquivo + uma linha
export type LenderId = (typeof LENDERS)[number]['id'];
// alfa.ts: const ALFA_INCOME_FACTOR = 10;  beta.ts: const BETA_CAP_PERCENT = 60;  gama.ts: const GAMA_MIN_AGE = 25, GAMA_MAX_AMOUNT_CENTS = 2_000_000;  delta.ts: failureRate: 0.3
```

`simulateLender(config, input, { clock, random, override })`: sorteia o delay (uniforme na faixa; 1º `random()`), decide o erro (2º `random()` < `failureRate` → `LenderHttpError(500)` entregue **após** o delay), aplica `override` (`{ outcome: 'approve' | 'refuse' | 'error' | 'timeout' | 'natural', delayMs? }`) sem tocar na regra. **Não recebe `signal`**: a resposta tardia precisa chegar para ser recusada pelo banco (demonstrável). `callLender(config, …)` é o wrapper onde um retry caberia.

Presets (`scenarios.ts`, `resolveOverrides(scenario, overrides, deadlineMs)`), gravados em `forced_scenario`:

| Preset | Alfa | Beta | Gama | Delta |
|---|---|---|---|---|
| `all_approve` | natural, 500 ms | natural, 1 s | natural, 1 s | approve, 2 s |
| `delta_error` | natural | natural | natural | error, 1 s |
| `delta_timeout` | natural | natural | natural | approve aos `deadlineMs + LATE_RESPONSE_EXTRA_MS (2000)` |
| `none_approve` | refuse (`forced`), 500 ms | refuse, 1 s | refuse, 1 s | refuse, 1,5 s |

Orquestração (`run-consultation.ts`; `clock`, `random`, `repo` injetados):

```
runConsultation(id):
  c = repo.getConsultation(id); remaining = max(0, c.deadlineAt - clock.now())
  deadline = new Promise(resolve => clock.setTimeout(() => resolve('deadline'), remaining))
  calls = LENDERS.map(l => callLender(l, input(c), { clock, random, override: overrides[l.id] })
            .then(result => settle(id, l.id, result), error => settle(id, l.id, toUnavailable(error))))   // dois argumentos: erro de persistência não vira "falha da financeira"
  await Promise.race([Promise.allSettled(calls), deadline])
  finalize(id, clock.now())
settle(): UPDATE lender_results SET status, reason_code, approved_amount_cents, monthly_rate, terms_months, latency_ms, responded_at
          WHERE consultation_id = ? AND lender_id = ? AND status = 'querying'
          → changes === 0 ? (log late_result_ignored { consultationId, lenderId, lateByMs }; UPDATE late_responded_at, late_outcome_json) : ok
finalize(id, now): UPDATE lender_results SET status='unavailable', reason_code='timeout', latency_ms=timeout_ms WHERE consultation_id=? AND status='querying';
                   UPDATE consultations SET status='finished', finished_at=now, finish_reason = (deadlineHit ? 'deadline' : 'all_responded') WHERE id=? AND status='querying'
```

- `after()` é chamado na Server Action antes do `redirect()` (roda depois da resposta; suportado em `next start`; drenado no SIGTERM com `stop_grace_period: 20s`). Promessas das financeiras que continuam após o `finalize` são no-ops.
- `getConsultationSnapshot(id, now)` reconcilia: `querying` com `deadlineAt < now` → `finalize(id, deadlineAt)` com `finish_reason = 'reconciled'`. No boot, o mesmo UPDATE para todas as consultas presas.
- Em `next dev`, HMR pode interromper um callback longo: validar no primeiro fluxo real; fallback `void runConsultation(id)`; não salvar arquivos durante uma consulta na demo; a reconciliação cobre o pior caso.
- Estado entre orquestrador e GET passa **só pelo banco**.

### 4.8 Dinheiro, Price, ordenação, resumo e escolha

- `money.ts`: `parseBRL('1.234,56') → 123456`, `formatBRL(cents)` (`Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`), `capPercentCents(cents, percent) = Math.floor(cents * percent / 100)` (inteiros; teto da Beta para baixo).
- `price.ts`: `assertMonthlyRate(rate)` lança se `rate < 0 || rate >= 1`; `installmentCents(pvCents, monthlyRate, n)`: `i = 0 → roundHalfUp(pv / n)`; senão `roundHalfUp(pv · i / (1 − (1 + i)^−n))` com nudge relativo `1e-9`; `totalCents = installment × n`; `interestCents = total − pv`. As 28 fixtures de 05 são o teste.
- `offers.ts`: `buildOffers(lenders, treatmentAmountCents, { feeCents? })` → lista achatada com cobertura (`percent = floor(approved·100/treatment)`), `uncoveredCents`, `isPartial`. `feeCents` é o gancho de IOF/tarifa.
- `sorting.ts`: `sortOffers(offers, 'installment' | 'total')`, estável; desempate: outro critério, taxa, nome, prazo. Listas esperadas de 05.
- `summarize.ts`: `summarizeConsultation(lenders, treatmentAmountCents)` → `summary`; `nextStep`: pendente → `wait`; ≥ 1 aprovada → `choose`; só recusas por renda/valor → `lower_amount`; só indisponíveis, ou recusas só por idade, ou valor já no mínimo → `retry`.
- `cpf.ts` (normaliza, rejeita repetidos, valida 2 dígitos); `age.ts` (`ageInYears`, `isValidCalendarDate`, `todayISO(timeZone)` via `Intl.DateTimeFormat('en-CA', { timeZone })`).
- Escolha (`choices.service.ts`): valida, recalcula com `installmentCents`, grava snapshot; `UNIQUE(consultation_id)` → 409.

### 4.9 Banco de dados (`node:sqlite`)

- `src/db/client.ts`: `getDb()` abre **preguiçosamente** (nunca em escopo de módulo: `next build` importa módulos de servidor), singleton em `globalThis` (HMR), `new DatabaseSync(DATABASE_PATH, { timeout: 5000 })`, `mkdirSync(dirname)`, `PRAGMA journal_mode = WAL`, `PRAGMA synchronous = NORMAL`, `PRAGMA foreign_keys = ON` (já padrão), `runMigrations(db)`, reconcile de boot.
- `src/db/migrations.ts`: `MIGRATIONS: Array<{ name: string; sql: string }>` aplicadas em transação e registradas em `schema_migrations`; "guardar campo novo" = push de um `ALTER TABLE`.
- Schema (epoch ms, centavos inteiros, taxa `REAL`, prazos JSON em `TEXT`):

```sql
patients(id TEXT PK, full_name TEXT, cpf TEXT UNIQUE, birth_date TEXT, phone TEXT, monthly_income_cents INTEGER, created_at INTEGER)
consultations(id TEXT PK, patient_id TEXT REFERENCES patients, treatment_amount_cents INTEGER, patient_age_years INTEGER,
              status TEXT CHECK (status IN ('querying','finished')), started_at INTEGER, deadline_at INTEGER, timeout_ms INTEGER,
              finished_at INTEGER, finish_reason TEXT CHECK (finish_reason IN ('all_responded','deadline','reconciled')), forced_scenario TEXT, created_at INTEGER)
lender_results(id TEXT PK, consultation_id TEXT REFERENCES consultations, lender_id TEXT, lender_name TEXT,
               status TEXT CHECK (status IN ('querying','approved','refused','unavailable')), reason_code TEXT,
               approved_amount_cents INTEGER, monthly_rate REAL, terms_months TEXT, latency_ms INTEGER, started_at INTEGER, responded_at INTEGER,
               late_responded_at INTEGER, late_outcome_json TEXT, UNIQUE (consultation_id, lender_id))
chosen_offers(id TEXT PK, consultation_id TEXT UNIQUE REFERENCES consultations, lender_result_id TEXT REFERENCES lender_results, lender_id TEXT,
              term_months INTEGER, financed_amount_cents INTEGER, monthly_rate REAL, installment_cents INTEGER, total_cents INTEGER, created_at INTEGER)
schema_migrations(name TEXT PK, applied_at INTEGER)
```

`lender_id` e `reason_code` sem CHECK (5ª financeira e motivo novo sem migração). Transações só com código síncrono (nenhum `await` dentro). Testes usam `:memory:` com o repositório real. **Spike T001**: `/api/health` com `SELECT 1` via `node:sqlite` em `next dev` e `next build`; se falhar, plano B `better-sqlite3@13.0.3` (prebuilds, sem install script, já em `serverExternalPackages` automático) mudando só `client.ts`. Trocar para PostgreSQL depois = reescrever `client.ts`, migrações e repositórios (SQL explícito ajuda); registrado no README, não implementado.

### 4.10 Entrega progressiva e falha da própria API

**Polling** (`useConsultationSnapshot(id, initial, pollIntervalMs)`): `setTimeout` encadeado (nunca `setInterval`), `fetch(…, { cache: 'no-store', signal })`, `AbortController` no cleanup (Activity e Strict Mode duplicam efeitos), tick via `useEffectEvent`; para em `finished`; backoff 1 s → 2 s → 4 s em falha; 5 falhas seguidas → banner "Não conseguimos atualizar a consulta. Tentar de novo" (zera e reusa o id); se `now > deadlineAt + 3 s` e ainda `querying`, uma última leitura (o servidor reconcilia) e só então erro. `pollIntervalMs` vem do snapshot (servidor lê `POLL_INTERVAL_MS`; alteração ao vivo = env + restart, sem rebuild). Justificativa para o README: 4 eventos em ≤ 10 s, estado já persistido, reload grátis, testável por `curl`, trocável por SSE num arquivo; `next start` comprime e pode bufferizar SSE, Safari segura 1 KB, proxies bufferizam (por isso SSE é evolução, com o script `stream-observer` das docs para verificar).

**Falha da API**: `startConsultation` → `formError` + botão reenviar; `chooseOffer` → mensagem por código; `error.tsx` com `retry()`; `catchError` (`next/error`) em volta do painel e da lista com "Tentar novamente".

### 4.11 Design

**Brief.** Parcela Mais, "Banco das Clínicas". Usa a tela a recepção da clínica, com o paciente na frente, numa conversa sobre dinheiro e saúde. Trabalho da interface: colher dados sem atrito, dar resposta útil em até 10 s mesmo com parte das financeiras falhando, e deixar a comparação honesta (cobertura parcial visível). Registro: competência calma. Vernáculo de onde saem as escolhas: porcelana e esmalte dental, o verde-menta de jaleco, a **ficha do paciente** em papel pautado e o **carnê de parcelas** com canhotos.

**Tokens (claro apenas; sem dark mode):**

| Token | Hex | Papel |
|---|---|---|
| `--color-porcelain` | `#F3F6F5` | fundo (branco frio de porcelana, não creme) |
| `--color-enamel` | `#FFFFFF` | superfícies (ficha, tabela) |
| `--color-ink` | `#11302E` | texto e traços (tinta teal escura, cor de marca, não preto tingido) |
| `--color-ink-muted` | `#5C6F6C` | secundário, latências |
| `--color-rule` | `#C9D5D2` | pautas e divisores |
| `--color-mint` / `-soft` | `#1E8A6E` / `#DCF1E9` | ação primária, aprovada, trilho |
| `--color-amber` / `-soft` | `#B4761D` / `#FAEED5` | consultando |
| `--color-brick` / `-soft` | `#B1402C` / `#F8E2DD` | recusada, erros de validação |
| `--color-slate` / `-soft` | `#6A7B79` / `#E5EBEA` | indisponível |

Status nunca dependem só de cor: rótulo em texto + glifo (ponto pulsante, check, traço, relógio). Contraste AA conferido nos pares.

**Tipografia.** Uma família: **Bricolage Grotesque** (variável: `wght` 200–800, `wdth` 75–100, `opsz` 12–96; confirmada no `next/font/google` 16.4.3) via `next/font/google` com `axes: ['opsz', 'wdth']`, exposta como `--font-sans`. Display (títulos de etapa, nomes das financeiras, parcelas) em `opsz` alto, `wdth` 90, peso 600, tracking −0,02 em; texto em `opsz` 12–14, peso 400; números com `font-variant-numeric: tabular-nums` (conferir na primeira tela; se não alinharem, Geist, já no scaffold, assume os números). Escala base 16 px, razão ~1,25: 13 · 16 · 20 · 25 · 31 · 39 · 49. Line-height 1,5 texto / 1,1 display. Linha ≤ 70 caracteres.

**Layout.** Alinhado à esquerda, uma coluna: cadastro em 36 rem, consulta em 56 rem. Inputs **pautados** (só linha inferior 1,5 px em `ink` 40 %, engrossa e vira `mint` no foco, `brick` no erro, mensagem logo abaixo), rótulos em caixa de sentença, sem caixas. Trilho de passos: régua vertical à esquerda no desktop, linha fina no topo no mobile ("Passo 2 de 2"). Ofertas como **livro-razão** (linhas pautadas, colunas alinhadas por tabular-nums), não cards. Raio 4 px em controles, 0 em tabelas, sem sombras. Gutter 16 px no mobile, sem scroll horizontal. Skeletons com as dimensões finais (sem layout shift).

Wireframe da consulta (tratamento R$ 10.000, números da tabela de 05):

```
Maria da Silva                                   tratamento R$ 10.000,00
Consulta de hoje, 14:32

■■■■■■■■■■■■■■■■■■■■■■■■□□□□□□□□□□□□□□□□   6,4 s de 10 s           ← o único elemento ousado
──────────────────────────────────────────────────────────────────
Alfa      Aprovada      100% do tratamento, 2,49% ao mês     1,2 s
Beta      Aprovada      60% (R$ 6.000,00), 1,99% ao mês      3,8 s
Gama      Recusada      exige 25 anos ou mais                2,1 s
Delta     Consultando   ●
──────────────────────────────────────────────────────────────────
Ofertas (6)                     Ordenar por  (•) menor parcela  ( ) menor total

 24×   R$ 316,87     total R$ 7.604,88    Beta, cobre 60%, faltam R$ 4.000,00   Escolher
 18×   R$ 399,86     total R$ 7.197,48    Beta, cobre 60%, faltam R$ 4.000,00   Escolher
  6×   R$ 1.814,89   total R$ 10.889,34   Alfa, cobre tudo                       Escolher
```

**Movimento.** Um único momento: o trilho de 10 s avançando (CSS `transition` dirigida por `deadlineAt`) e cada linha "assentando" em 200 ms ao mudar de status. Nada de fade-in por seção. `prefers-reduced-motion` desliga o trilho animado (fração em texto).

**Cópia (chaves de `copy/pt-BR.ts`).** Etapas: "Dados do paciente", "Renda e tratamento". Ações: "Continuar", "Voltar", "Consultar financeiras", "Escolher", "Tentar com um valor menor", "Consultar de novo", "Nova simulação", "Tentar novamente". Status: "Consultando", "Aprovada", "Recusada", "Indisponível". Motivos: `income_insufficient` "Renda insuficiente para o valor", `age_below_min` "Exige 25 anos ou mais", `amount_above_limit` "Valor acima do limite desta financeira", `http_500` "Erro na financeira", `timeout` "Sem resposta em 10 s", `forced` "Recusa forçada pelo cenário", fallback "Recusada pela política da financeira". Encerramento: "Todas responderam em 4,8 s" / "Prazo de 10 s encerrado". Cobertura: "Cobre 60%, faltam R$ 4.000,00" / "Cobre tudo". Aviso: "Consulta em andamento: outras ofertas ainda podem chegar". Vazio: "Nenhuma financeira aprovou". Erros: "CPF inválido. Confira os 11 dígitos.", "O paciente precisa ter entre 18 e 80 anos.", "Data inválida.", "Data no futuro.", "Informe um valor entre R$ 1.000,00 e R$ 50.000,00.", "Informe um celular com DDD.", "Informe a renda mensal.", "Informe nome e sobrenome.", "Não foi possível iniciar a consulta. Tente novamente.", "Não conseguimos atualizar a consulta. Tentar de novo", "Esta consulta já tem uma oferta escolhida.", "Consulta não encontrada". Seletor: "Cenário de demonstração: Fluxo natural · Todas aprovam · Delta falha · Delta estoura o tempo · Nenhuma aprova". Placeholders: `000.000.000-00`, `(11) 90000-0000`, `dd/mm/aaaa`, `R$ 0,00`. Tom: fala com a atendente ("você"), paciente na terceira pessoa, caixa de sentença, voz ativa, uma função por frase.

**Acessibilidade mínima.** Rótulos ligados, `aria-invalid`, `aria-describedby`, foco visível (anel `mint` 2 px), foco no primeiro erro, `role="alert"`, painel com `aria-live="polite"`, ordenação como `radiogroup` operável por teclado, botões com texto.

**Autocrítica contra os padrões genéricos.** Não é creme + serifa + terracota; não é fundo quase preto com acento ácido; não é broadsheet de linhas finas (pautas só onde codificam campo ou linha); não é kit de cards iguais com sombra; sem eyebrow em caixa alta, sem meta strings com "·" na interface, sem monoespaçada para dados, sem "→" em botões. A ousadia está no painel (nomes grandes e o trilho); o resto é quieto. Antes de sair, tira-se um acessório: a régua vertical só fica se não disputar com o título.

**Implementação.** Tokens em `globals.css` (`@theme inline`), fontes no `layout.tsx`, componentes pequenos sem biblioteca (`Button`, `Field`, `StatusBadge`, `DeadlineRail`, `LenderBoard`, `OffersTable`, `SortControl`), ícones SVG inline.

### 4.12 Testes

- **Vitest 5** + `vite@8` (peer obrigatório) em ambiente **node**; `vitest.config.mts` com `resolve.alias['@']`, `exclude: [...configDefaults.exclude, '.next/**']`, `.vitest/` no `.gitignore`; testes `*.test.ts` ao lado do módulo; `vi.mock('server-only', () => ({}))` no setup se algum módulo testado o importar.
- Fake timers: `vi.useFakeTimers()`; `await vi.advanceTimersByTimeAsync(ms)` (nunca a versão síncrona; nunca `await` da orquestração antes de avançar; nunca `nextTick` em `toFake`; nunca `AbortSignal.timeout`); `expect(vi.getTimerCount()).toBe(0)` ao fim.
- Lista (fixtures de 05): `cpf` (tabela); `age` (fronteiras com data injetada, 29/02, inválida, futura); `money` (`parseBRL`, `capPercentCents` 33.333,33 → 19.999,99); `price` (12 valores + extras + `i = 0` + taxa 2,49 rejeitada); `sorting` (3 listas); `lenders` (Alfa igualdade em centavos; Gama 25 anos e 20.000,00/20.000,01; Beta teto; Delta ordem do sorteio); `scenarios` (delay do timeout acompanha `deadlineMs`); `run-consultation` (todas em 5 s → `finished` aos 5 s `all_responded`; Delta aos 12 s → `finished` aos 10 s, Delta `unavailable/timeout`, `latency_ms = 10000`; erro 500 → `unavailable/http_500`; avançar até 12 s → banco inalterado + log `late_result_ignored`; `none_approve` → zero ofertas; `it.each` dos 4 presets com a persona A reproduzindo 12/9/9/0); `snapshot` (reconciliação de pendentes vencidos → `reconciled`); `summarize` (mix → `nextStep`); `choices` (prazo inexistente, financeira recusada, consulta alheia, segunda escolha 409, idêntica 200); `registration-schema` (422 por campo); services com `:memory:`. Handlers ficam finos e não são testados por unidade (`connection()`/`cookies()` lançam fora de request scope).
- Deliberadamente fora (README): testes de componente (jsdom/Testing Library/`nuqs/adapters/testing`), E2E, Docker.

### 4.13 Execução, Docker, env e scripts

- `package.json`: `dev`, `build`, `start`, `lint`, `typecheck` (`next typegen && tsc --noEmit`), `test` (`vitest run`), `test:watch`, `db:migrate` (`node --experimental-strip-types scripts/migrate.ts` ou via `tsx`; em dev o `getDb()` já migra no primeiro uso).
- `.env.example` (versionado com `!.env.example`): `DATABASE_PATH=./data/app.sqlite`, `CONSULTATION_DEADLINE_MS=10000`, `POLL_INTERVAL_MS=750`, `COOKIE_SECURE=false`, `TZ=America/Sao_Paulo`, `PORT=3000`.
- `next.config.ts`: manter o scaffold + `output: 'standalone'`.
- `Dockerfile` multi-stage (`node:24-bookworm-slim` pinado): deps (`corepack enable && pnpm install --frozen-lockfile`, com devDependencies porque `next build` tipa também os testes) → build (`pnpm build`; `cp -r public .next/standalone/ && cp -r .next/static .next/standalone/.next/`) → runner (`USER node`, `mkdir -p /data && chown node:node /data`, `ENV HOSTNAME=0.0.0.0 PORT=3000 DATABASE_PATH=/data/app.sqlite TZ=America/Sao_Paulo`, `CMD ["node", "server.js"]`). `.dockerignore`: `.next`, `node_modules`, `data`, `.vitest`, `.git`.
- `compose.yaml`: serviço `app`, `volumes: [app-data:/data]` (diretório inteiro: `.db` + `-wal` + `-shm`), `environment` com as variáveis acima, `healthcheck: ["CMD", "node", "-e", "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]`, `stop_grace_period: 20s`, `restart: unless-stopped`. Sem proxy na frente (CSRF das actions: `Origin` = `Host`).
- Caminho sem Docker: `pnpm install && pnpm dev` (migra no primeiro uso). Ambos testados em pasta limpa (03).

### 4.14 Observabilidade e privacidade

Log JSON por resultado: `consultationId`, `lenderId`, `status`, `reasonCode`, `latencyMs`, `forcedScenario`, `event` (`settled` | `late_result_ignored` | `reconciled`). Nunca CPF, nascimento, celular, nome ou conteúdo do cookie. Snapshot devolve só `cpfMasked` (`***.982.247-**`). `onRequestError` em `instrumentation.ts` é opcional.

## 5. Tarefas, tempo e cortes

Ordem: domínio → persistência/orquestração/API → cadastro → consulta → entrega. `[P]` = paralelizável; `[USn]` = história. Cada bloco termina no checkpoint; anotar hora de início/fim e o que foi gerado por IA, revisado à mão ou descartado (vira o log do README).

**T0 — Setup e spike (0:30)**
- T001 `[P]` Spike `node:sqlite`: `src/db/client.ts` mínimo + `app/api/health/route.ts` com `SELECT 1`; confirmar em `next dev` e `pnpm build`. Falhou → plano B `better-sqlite3@13` só em `client.ts`.
- T002 `[P]` Deps: `pnpm add nuqs zod` · `pnpm add -D vitest vite @types/node@24` · `pnpm remove` nada; `vitest.config.mts`; script `test`/`typecheck`.
- T003 `[P]` `app/layout.tsx`: `lang="pt-BR"`, metadata template "%s · Pré-aprovação", Bricolage Grotesque, `<NuqsAdapter>`; `globals.css` com tokens, sem Arial e sem bloco dark; `src/copy/pt-BR.ts` inicial.
- T004 `[P]` `.gitignore` (`!.env.example`, `data/`, `.vitest/`), `.env.example`, `src/server/config.ts`, `next.config.ts` com `output: 'standalone'`, `Dockerfile`, `compose.yaml`, `.dockerignore`; `app/docs/` com cópias de 01, 03, 05, 06, 07; commit do `AGENTS.md`.
- Checkpoint: `pnpm test` roda 1 teste; `/api/health` → `{ ok: true, db: 'ok' }` em dev e build; `docker compose build` disparado em background.

**T1 — Domínio puro com testes (0:50) [US1][US3][US4]**
- T005 `[P]` `src/domain/cpf.ts` + test · T006 `[P]` `age.ts` + test · T007 `[P]` `money.ts` + test · T008 `[P]` `price.ts` + test (28 fixtures) · T009 `[P]` `offers.ts` + `sorting.ts` + test (3 listas) · T010 `[P]` `summarize.ts` + test · T011 `registration-schema.ts` + `registration-steps.ts` + test · T012 `[P]` `src/lenders/{registry,alfa,beta,gama,delta,errors}.ts` + `rules.test.ts` · T013 `src/lenders/simulate.ts` + `scenarios.ts` + tests · T014 `src/domain/types.ts` (DTOs).
- Checkpoint: todas as fixtures de 05 verdes em < 3 s.

**T2 — Persistência, orquestração e API (1:05) [US2][US4]**
- T015 `src/db/migrations.ts` (schema) + `client.ts` completo (pragmas, migrate, reconcile de boot) · T016 `src/server/repositories.ts` (+ test com `:memory:`) · T017 `src/orchestration/{clock,call-lender,run-consultation}.ts` + test (fake timers, 7 casos) · T018 `src/server/snapshot.ts` (+ reconcile test) · T019 `consultations.service.ts` (`createConsultation`, upsert por CPF, `patient_age_years`) · T020 `choices.service.ts` + test · T021 `app/api/consultations/route.ts`, `[id]/route.ts`, `[id]/choice/route.ts` (finos; `await connection()`; `Cache-Control: no-store`) · T022 `src/server/log.ts`.
- Checkpoint: `curl -X POST /api/consultations` → id; GETs sucessivos mostram status mudando e fechando ≤ 10 s; `delta_timeout` fecha aos 10 s e a resposta aos 12 s aparece como `late_result_ignored` no terminal; choice 201/409/422; **`pnpm build` passa**.

**T3 — Cadastro em 2 passos (0:55) [US1][US4]**
- T023 `src/url-state/parsers.ts` · T024 `src/server/draft-cookie.ts` (+ test de parse) · T025 `app/register/actions.ts` (`saveStep` next/back, `startConsultation` com `after()`, `startNewSimulation`, `applyPersona`) · T026 `app/register/[step]/page.tsx` (gSP, assert, shell, Suspense, guard) · T027 `src/components/form/*` (`Field`, máscaras no blur, validação por toque, `SubmitButton`) · T028 `src/components/register/*` (`PatientFields`, `FinancingFields`, `ScenarioSelect` nuqs, `StepRail`) · T029 `app/page.tsx` com deep links de personas.
- Checkpoint: roteiro passo 1 de 03 (111.111.111-11, 17 anos, R$ 999,99 rejeitados na hora); voltar com campo inválido digitado e reload preservam tudo; `?scenario=` chega à coluna; **`pnpm build` passa**.

**T4 — Consulta, ofertas, escolha e confirmação (0:55) [US2][US3][US4]**
- T030 `app/consultations/[id]/page.tsx` (Suspense + `LenderBoardSkeleton` no shell + `createLoader` do `sort`) · T031 `src/components/consultation/use-consultation-snapshot.ts` (polling, backoff, abort) · T032 `LenderBoard`, `StatusBadge`, `DeadlineRail` · T033 `OffersTable` + `SortControl` (nuqs, radiogroup) · T034 `NoApprovalPanel` (summary.nextStep → links com `hint`) · T035 `app/consultations/actions.ts` `chooseOffer` + `ChooseButton` · T036 `confirmation/page.tsx` · T037 `error.tsx`, `not-found.tsx`, `global-error.tsx`, `catchError` nas seções.
- Checkpoint: persona A em cada preset reproduz 12/9/9/0 ofertas (05); reload no meio da consulta retoma; "nenhuma aprovou" volta preenchido e sem cenário.

**T5 — Passe visual, Docker e README (0:45)**
- T038 passe de design (tokens aplicados, pautas, livro-razão, trilho, estados calmos de falha, a11y da lista) · T039 `docker compose up` em pasta limpa (clone → up → jornada) · T040 README (11 seções de 06 D14; §7 deste plano) + glossário + log de horas + "faria com mais tempo" · T041 rascunho do e-mail de entrega.
- Checkpoint: README não cita nada que não exista; `pnpm test` < 5 s; `pnpm build` ok.

**T6 — Reserva e ensaio (0:30)**
- T042 ensaio do roteiro de 03 com cronômetro (< 15 min); checklist da véspera; abas abertas (§6). Se sobrar: `pm_last_consultation` + "Retomar", filtro "só quem cobre tudo", `GET /api/lenders/metrics`.

**Linhas de corte** (decididas agora, nesta ordem): `applyPersona` → botão client-side "Preencher exemplo" · máscaras no blur → inputs simples com normalização no servidor · `catchError` por seção → só `error.tsx` · `GET /api/consultations/{id}/choice` REST → só a action (documentar) · Dockerfile standalone multi-stage → imagem simples `pnpm install && pnpm build && pnpm start` · passe visual além dos tokens · upsert de paciente por CPF → inserir sempre. **Nunca cortar:** testes de CPF/Price/orquestração, 4 cenários pela UI, validação na hora, voltar sem perder, README com decisões e cenários.

## 6. Preparação para a demo e para a alteração ao vivo

| Pedido provável (03) | Onde cai | Custo |
|---|---|---|
| 5ª financeira com regra nova | `src/lenders/epsilon.ts` (config + `decide`) + 1 linha em `registry.ts`; `createConsultation` itera `LENDERS`; `lender_id` sem CHECK; UI itera `snapshot.lenders`; teste copiado de `alfa` | 1 arquivo + 1 linha, ~5 min |
| Timeout 10 s → 5 s ou 15 s | `CONSULTATION_DEADLINE_MS` (`config.ts`/env); gravado em `timeout_ms`/`deadline_at`; preset `delta_timeout` segue `deadlineMs + 2000`; testes recebem `deadlineMs` | 1 constante |
| Beta 70 % / Gama 21 / Alfa ×8 | constante no topo de `beta.ts`/`gama.ts`/`alfa.ts` + o teste do arquivo | 1 linha + 1 teste |
| Retry único na Delta em 500 | `call-lender.ts`: `withRetry({ attempts: 2, retryOn: LenderHttpError })` com orçamento `deadlineAt − now`; teste com `random` sequencial | ~15 linhas |
| Distinguir erro de timeout na tela | `reasonCode` já no DTO e no subtexto; mudar texto/ícone em `copy/pt-BR.ts` | 0–2 linhas |
| Nova ordenação (juros/taxa) ou filtro "cobre tudo" | literal em `parsers.ts` + `case` em `sorting.ts` (`interestCents` já existe) + opção no `SortControl`; lista de juros de 05 já é teste | 3 toques |
| Taxa 0 % / IOF / tarifa | `price.ts` já trata `i = 0`; `feeCents` em `buildOffers` + fixture | função pura + teste |
| Novo campo ou regra no cadastro | schema + `registration-steps.ts` + um `<Field>`; cookie é passthrough; se persistir, `MIGRATIONS.push('ALTER TABLE …')` + repositório + DTO | 3–4 toques |
| Tempo por financeira / contador | `latencyMs`, `deadlineAt`, `serverNow` já no DTO; `DeadlineRail` existe | só exibição |
| Intervalo do polling / SSE | `POLL_INTERVAL_MS` (env + restart); SSE = `app/api/consultations/[id]/events/route.ts` + trocar o corpo do hook | 1 linha / ~40 linhas |
| Beta também estoura o tempo | preset novo em `scenarios.ts` (`beta: { outcome: 'timeout' }`) + rótulo; `SCENARIO_IDS` alimenta o parser nuqs e o zod | 3 linhas |
| Guardar e exibir algo novo (ex.: detalhe do motivo) | `MIGRATIONS.push`, campo no `settle`, DTO, subtexto do card | 4 toques |

Abas abertas antes da conversa: `registry.ts`, `config.ts`, `run-consultation.ts`, `price.ts`, `sorting.ts`, `registration-schema.ts`, `api/consultations/[id]/route.ts`, `use-consultation-snapshot.ts`. Roteiro da demo: 03 (personas A/B/C, deep links `/register/financing?scenario=…` após `applyPersona`), `pnpm test` visível antes e depois da alteração. Três `curl` no README (POST → GET em loop → choice 201/409).

## 7. README e e-mail

README (06 D14) alimentado por este plano: 1 o que é (§0) · 2 como rodar (§4.13) · 3 como forçar cenários (personas + deep links + tabela esperada de 05) · 4 arquitetura (§4.1) · 5 decisões e trade-offs (§9 + 06 D1–D12) · 6 contrato (§4.6) · 7 modelo de dados (§4.9) · 8 premissas e perguntas enviadas (§3.4, 04) · 9 o que ficou de fora e faria com mais tempo (cortes + SSE, métricas, Postgres, cookie selado, E2E, a11y completa, deploy) · 10 como usei IA (log por bloco: gerado / revisado à mão / descartado; planejamento com pesquisa nas docs e painel de revisão) · 11 log de horas. E-mail: link, horas investidas, 3–5 premissas, onde estão as instruções de execução e de cenários (04).

## 8. Documentação a consultar antes de implementar cada parte

Docs locais do Next (`node_modules/next/dist/docs/01-app/`), conferidas para 16.4.3 (achados detalhados em `docs/research/`):

| Antes de… | Ler |
|---|---|
| cookies | `03-api-reference/04-functions/cookies.md` |
| qualquer página com cookie/params/banco | `01-getting-started/08-caching.md` (§ Predictable values, § Streaming uncached data), `02-guides/streaming.md` (§ Push dynamic access down), `04-functions/io.md`, `04-functions/connection.md`, `02-guides/migrating-to-cache-components.md` (§ cookies/headers/searchParams, § UI state preservation) |
| Server Actions e formulários | `01-getting-started/07-mutating-data.md`, `02-guides/forms.md`, `02-guides/server-actions.md` (§ Sequential dispatch), `04-functions/redirect.md` |
| Route Handlers | `01-getting-started/15-route-handlers.md` (§ With Cache Components), `03-file-conventions/route.md` |
| `after()` e deploy | `04-functions/after.md`, `02-guides/self-hosting.md` (§ after, § Streaming), `05-config/01-next-config-js/output.md` |
| erros | `01-getting-started/10-error-handling.md`, `03-file-conventions/error.md`, `04-functions/catchError.md` |
| rotas dinâmicas e tipos | `03-file-conventions/page.md`, `dynamic-routes.md`, `04-functions/generate-static-params.md`, `05-config/02-typescript.md` |
| navegação e query | `04-functions/use-search-params.md`, `use-router.md`, `01-getting-started/04-linking-and-navigating.md` (§ Native History API), `02-guides/preserving-ui-state.md` |
| testes | `02-guides/testing/vitest.md` |
| CSS, fontes, metadata | `01-getting-started/11-css.md`, `13-fonts.md`, `14-metadata-and-og-images.md` |
| novidades v16 | `02-guides/upgrading/version-16.md` |

Externas (oficiais): nuqs 2.10.2 — `nuqs.dev/docs/adapters`, `/basic-usage`, `/batching`, `/options`, `/parsers/built-in`, `/parsers/making-your-own`, `/server-side`, `/utilities`; React 19.3 — `react.dev/reference/react/useActionState`, `react-dom/hooks/useFormStatus`, `react/useEffectEvent`, `react/Activity`; Node — `nodejs.org/docs/latest-v24.x/api/sqlite.html`; Vitest 5 — `vitest.dev/api/vi.html` (fake timers), `vitest.dev/config/`; Zod 4 — `zod.dev` (`z.flattenError`, mensagens via `{ error }`); spec-kit — `github.com/github/spec-kit` (`spec-driven.md`, `templates/`).

## 9. Decisões, premissas e dúvidas

| # | Decisão | Alternativa | Por quê |
|---|---|---|---|
| A1 | `app/` é a raiz do repositório; `app/docs/` recebe 01, 03, 05, 06, 07; 00 fica fora se público | mover `.git` para a pasta pai | `docker compose up` na raiz; nada no README que não esteja no repo |
| A2 | SDD manual, um arquivo (este), sem `specify-cli` | CLI + `specs/` | 6 h; os artefatos importam |
| A3 | Server Actions para mutações da UI + Route Handlers com os mesmos services | tudo por `fetch` | cookies httpOnly, redirect, sem JS; contrato por `curl` |
| A4 | Slugs em inglês; `sort`/`scenario`/`hint` via nuqs, `shallow: true`, `history: 'replace'` | etapa como `?step=` | pedido de Lucas; URL legível |
| A5 | `pm_draft` httpOnly com valores brutos e versão; `secure` por env | cookie por campo; cookie legível no cliente | atômico, PII fora do `document.cookie`, funciona em HTTP na demo |
| A6 | Polling 750 ms com hook isolado; SSE evolução | SSE já | 4 eventos em 10 s; reload grátis; buffering de compressão/proxies |
| A7 | `node:sqlite` + SQL puro + migrações em array; plano B `better-sqlite3@13` | Drizzle (RC para node:sqlite) / Prisma | zero deps; 4 tabelas; 1 passo ao vivo |
| A8 | Vitest 5 só node, fake timers, `:memory:` | + jsdom | docs/06 D11; suíte < 5 s |
| A9 | Zod 4 único; sem react-hook-form | RHF | 6 campos; lint do Compiler sinaliza `watch()` |
| A10 | React Compiler desligado; `agentFeedback` mantido; `AGENTS.md` commitado | ligar | sem ganho visível |
| A11 | 2 passos de cadastro | 3 | tempo de código e de demo |
| A12 | Página única painel + ofertas; confirmação em slug próprio; consulta com escolha não redireciona | ofertas em `/offers` | primeira oferta útil em ~1 s; Voltar sem loop |
| A13 | Orquestração sem abort nos adapters; banco é o árbitro; `race` com deadline | `AbortController` | resposta tardia demonstrável; fecha no deadline sempre |
| A14 | Cenário só na URL/form/coluna | também no cookie | evita repetir `none_approve` após "tentar valor menor" |
| A15 | `output: 'standalone'` | `next start` com `node_modules` | sem binário nativo, imagem menor |

Dúvidas para Lucas (não bloqueiam; premissa entre parênteses): (1) copiar os arquivos de pesquisa para `docs/research/` (sim); (2) renomear a pasta `app/` para `parcela-mais-case/` antes do primeiro push (opcional, barato); (3) nome do produto na UI (neutro: "Pré-aprovação"); (4) demo em `pnpm dev` com Compose mostrado uma vez no início (sim). As 6 perguntas de 04 seguem com as premissas registradas.

## 10. Glossário

paciente = patient · cadastro = registration · rascunho = draft · consulta = consultation · financeira = lender · pré-aprovação = pre-approval · oferta = offer · prazo = term (months) · parcela = installment · total pago = total · juros = interest · valor aprovado = approvedAmount · cobertura = coverage · cenário forçado = forced scenario · consultando = querying · aprovada = approved · recusada = refused · indisponível = unavailable · tempo esgotado = timeout · encerrada = finished · escolha = chosen offer · resposta tardia = late result.
