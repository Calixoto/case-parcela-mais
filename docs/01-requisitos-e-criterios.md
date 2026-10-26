# Requisitos e critérios em checklist

Marque conforme for implementando. Cada item cita o trecho do enunciado que o sustenta. Itens marcados como **implícito** não estão escritos, mas decorrem direto das regras.

## Contexto que orienta tudo

- O usuário da jornada é a **clínica**, não o paciente. Ela está com o paciente na frente e precisa de resposta útil rápido.
- O produto consulta financeiras em paralelo e mostra "as ofertas que voltarem". Resultado parcial é o caso normal, não a exceção.
- Tudo é fictício. Não inventar regra de crédito que não esteja na tabela.
- O que pesa na avaliação: decisões bem explicadas, comportamento sob falha e domínio do código. Não quantidade de features.

## Etapa 1: cadastro do paciente

- [ ] Campos: nome completo, CPF, data de nascimento, celular, renda mensal, valor do tratamento.
- [ ] CPF com dígitos verificadores válidos.
- [ ] Idade entre 18 e 80 anos, derivada da data de nascimento.
- [ ] Valor do tratamento entre R$ 1.000 e R$ 50.000.
- [ ] Validação na hora (por campo, ao sair do campo ou ao digitar após o primeiro toque).
- [ ] Mensagens de erro claras e específicas por regra, com os limites escritos em pt-BR.
- [ ] Formulário em mais de um passo é opcional. Se tiver passos, nada se perde ao voltar um passo.
- [ ] **Implícito**: rejeitar CPF com todos os dígitos iguais, que passa no cálculo dos verificadores.
- [ ] **Implícito**: validar também no backend com as mesmas regras. A API pode ser chamada direto.
- [ ] **Implícito**: nome, celular e renda não têm regra no enunciado. Definir uma regra mínima e documentar (ver 04).
- [ ] **Implícito**: mesmo CPF pode gerar nova consulta. "Tentar um valor menor" exige isso.

## Etapa 2: pré-aprovação

- [ ] Ao enviar o cadastro, o backend consulta as 4 financeiras em paralelo.
- [ ] A tela mostra o status de cada financeira enquanto as respostas chegam.
- [ ] Status possíveis na tela: consultando, aprovada, recusada, indisponível. Só esses quatro.
- [ ] Espera máxima de 10 segundos. Depois disso a jornada segue com o que voltou.
- [ ] Quem não respondeu em 10 s aparece como indisponível.
- [ ] Se nenhuma aprovar: a tela explica o motivo e oferece um próximo passo, como tentar um valor menor.
- [ ] **Implícito**: a consulta encerra antes dos 10 s se as quatro já responderam. "Máxima" é teto, não duração fixa.
- [ ] **Implícito**: resposta que chega depois dos 10 s não altera o status já fechado.
- [ ] **Implícito**: erro 500 e estouro de tempo caem ambos em "indisponível" na tela, mas o motivo deve ficar guardado.
- [ ] **Implícito**: os 4 status aparecem desde o primeiro frame, começando em "consultando".
- [ ] **Implícito**: a tela também precisa tratar falha da própria API, não só das financeiras.

## Etapa 3: ofertas

- [ ] Cada financeira aprovada devolve valor aprovado, taxa mensal e prazos disponíveis.
- [ ] Para cada prazo: valor da parcela e total pago.
- [ ] Deixar claro quando o valor aprovado é menor que o valor do tratamento.
- [ ] Ordenar por menor parcela.
- [ ] Ordenar por menor custo total.
- [ ] Ao escolher uma oferta, salvar no backend.
- [ ] Mostrar tela de confirmação.
- [ ] Parcela pela Tabela Price, com PV igual ao valor **aprovado**, i a taxa mensal em decimal e n o número de parcelas.
- [ ] **Implícito**: uma oferta é o par financeira mais prazo. Até 12 linhas.
- [ ] **Implícito**: a Beta sempre aprova 60%, então o aviso de valor menor aparece em praticamente toda consulta.
- [ ] **Implícito**: a escolha precisa ser validada no servidor e guardar um snapshot dos valores.

## Financeiras simuladas

- [ ] Alfa: 0,5 a 1,5 s; aprova 100% se renda × 10 ≥ valor, senão recusa; 2,49%; 6, 12, 18.
- [ ] Beta: 2 a 5 s; sempre aprova, no máximo 60% do valor; 1,99%; 12, 18, 24.
- [ ] Gama: 1 a 3 s; recusa se idade < 25 ou valor > R$ 20.000, senão aprova 100%; 3,29%; 6, 10, 12.
- [ ] Delta: 4 a 15 s; 30% das chamadas devolvem erro 500; quando responde, aprova 100%; 2,19%; 12, 24, 36.
- [ ] Tempo de resposta sorteado a cada chamada dentro da faixa.
- [ ] Mecanismo para forçar cada cenário: todas aprovam, Delta falha, Delta estoura o tempo, nenhuma aprova.
- [ ] **Implícito**: "nenhuma aprova" exige sobrescrever a Beta. Só com dados de entrada é impossível.
- [ ] **Implícito**: "todas aprovam" exige fixar a Delta em sucesso rápido. Naturalmente só acontece em cerca de 38% das vezes.

## Requisitos técnicos obrigatórios

- [ ] Front-end em React com TypeScript. Next.js opcional.
- [ ] Backend à escolha, expondo uma API que o front consome.
- [ ] Banco relacional (PostgreSQL ou SQLite) com: cadastro, consulta, resultado de cada financeira, oferta escolhida.
- [ ] Contrato da API desenhado por você.
- [ ] Mecanismo de entrega progressiva escolhido (polling, SSE, WebSocket ou outro) e **explicado no README**.
- [ ] Testes automatizados: validação de CPF.
- [ ] Testes automatizados: cálculo da parcela.
- [ ] Testes automatizados: orquestração da consulta, cobrindo tempo limite e falhas.

## Não precisa

- Login ou autenticação.
- Visual elaborado. Interface limpa e fácil de usar basta.
- Deploy ou integrações reais.

## Bônus, só se sobrar tempo

Ordem sugerida pelo custo, do mais barato ao mais caro:

- [ ] Retomar a jornada depois de recarregar a página. Quase de graça se a consulta tiver id na URL e o estado estiver no banco.
- [ ] Logs ou métricas por financeira (tempo de resposta e taxa de erro). Barato se cada resultado guardar latência e motivo.
- [ ] Acessibilidade de teclado e leitor de tela.
- [ ] Deploy público.

## Entrega

- [ ] Repositório único no GitHub com front e backend.
- [ ] README: como rodar, idealmente com um único comando. Docker Compose é bem-vindo.
- [ ] README: principais decisões e os trade-offs de cada uma.
- [ ] README: o que ficou de fora e o que faria com mais tempo.
- [ ] README: como usou ferramentas de IA.
- [ ] README: como forçar cada um dos 4 cenários (não é exigido, mas o avaliador vai procurar).
- [ ] Se bater 6 horas: parar e registrar no README o que faria em seguida.
- [ ] Enviar o link respondendo ao e-mail do case até **segunda 26/10 às 18h**.

## A conversa de 60 minutos

| Bloco | Duração | O que preparar |
|---|---|---|
| Demonstração da jornada e dos 4 cenários forçados | 15 min | Dados prontos, cenários acionáveis pela UI, roteiro (ver 03) |
| Decisões de arquitetura e trade-offs | 20 min | README alinhado com o que foi feito; saber defender cada escolha |
| Alteração pequena no código, ao vivo, revelada na hora | 25 min | Ambiente rodando, testes rápidos, código modular (ver 03) |

## Critérios de avaliação

| Critério | O que olham | O que isso pede do código |
|---|---|---|
| Comportamento sob falha | Jornada útil quando financeiras atrasam, falham ou recusam | Timeout correto, resultado parcial bem apresentado, tela de "nenhuma aprovou" com motivo |
| Arquitetura do front-end | Estado, componentes e fluxo do formulário | Estado do formulário acima dos passos, componentes por responsabilidade |
| API e backend | Contrato, paralelismo, tempo limite, modelagem | Contrato explícito, orquestração assíncrona, 4 entidades bem relacionadas |
| Correção | Validações, parcela, ordenação | Fronteiras certas, Price com arredondamento definido, ordenação determinística |
| Testes | O que pode quebrar, não só caminho feliz | Fake timers, casos de borda, respostas tardias, erro 500 |
| Comunicação | README e conversa claros | Decisões com trade-off explícito, premissas registradas |

Frase do enunciado para ter em mente: "Valorizamos mais as decisões bem explicadas do que a quantidade de funcionalidades."
