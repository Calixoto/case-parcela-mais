# Alteração ao vivo e demonstração

A conversa tem 60 minutos: demo com os 4 cenários (15 min), arquitetura e trade-offs (20 min) e uma alteração pequena no código, revelada na hora (25 min). Este arquivo prepara os blocos 1 e 3.

## Alterações prováveis na parte ao vivo

O enunciado não diz o que vão pedir. A lista abaixo são os pedidos mais naturais dado o que o case avalia. Cada um fica barato se o design tiver o que a terceira coluna descreve.

| Pedido provável | Por que é provável | O que precisa estar pronto |
|---|---|---|
| Adicionar uma 5ª financeira com regra nova | Testa se as financeiras são dados e não `if`s | Financeira é um objeto de configuração mais um adapter registrado em lista. Front renderiza o que a API devolver, sem lista fixa de nomes. Taxa e prazos vêm no resultado |
| Mudar o limite de 10 s para 5 s ou 15 s | Testa onde mora o timeout | Uma constante, lida de variável de ambiente, usada pela orquestração e pelos testes com fake timers |
| Mudar o teto da Beta para 70%, a idade da Gama para 21 ou o fator da Alfa para × 8 | Testa se as regras estão isoladas e testadas | Regra de aprovação é uma função pura por financeira, com teste próprio |
| Retry único na Delta em caso de erro 500 | Testa a orquestração | A chamada a cada financeira passa por um wrapper onde um retry cabe sem estourar o deadline global |
| Distinguir "indisponível por erro" de "por timeout" na tela | Testa a modelagem | O motivo já está gravado por resultado e vem na API. É só exibir |
| Nova ordenação por menor taxa ou menor juros, ou filtro "só quem cobre 100%" | Testa a tela de ofertas | Ordenação é função pura sobre a lista, com teste. Adicionar um critério é um caso a mais |
| Taxa 0% ou promoção sem juros; incluir IOF ou tarifa fixa | Testa o cálculo | Price trata i = 0; o cálculo é uma função pura com testes de valores conhecidos |
| Novo campo no cadastro ou nova regra de validação | Testa o formulário | Schema compartilhado entre front e back; adicionar um campo é um lugar só |
| Mostrar tempo de resposta por financeira ou contador regressivo | Testa a API e a UI | Latência gravada por resultado; deadline exposto na API |
| Mudar o intervalo do polling ou trocar por SSE | Testa a decisão do README | Camada de "acompanhar consulta" isolada no front |
| Fazer a Beta também poder estourar o tempo | Testa o mecanismo de cenários | Override por financeira, não só preset da Delta |
| Guardar algo novo, como o motivo da recusa, e exibir | Testa a modelagem e o contrato | Migração simples, campo novo no DTO, exibição no card |

## O que a arquitetura precisa ter para isso ser barato

- Financeiras como configuração: nome, faixa de tempo, taxa, prazos, função de regra. Adapters atrás de uma interface comum, registrados em uma lista.
- Timeout, intervalo de polling e porta em variáveis de ambiente com default.
- Funções puras com testes: validação de CPF, idade, Price, ordenação, regra de cada financeira.
- Orquestração que recebe relógio, sorteio e adapters por injeção. Testes com fake timers rodando em segundos.
- Resultado por financeira com status, motivo, latência e payload. Oferta escolhida com snapshot.
- Front sem conhecimento fixo das financeiras: renderiza a lista que a API devolve.
- Schema de validação compartilhado entre front e back.
- Suíte de testes que roda em menos de 10 segundos, para mostrar que nada quebrou depois da alteração.

## Roteiro da demo (15 minutos)

Dados de teste. Os CPFs abaixo passam no algoritmo e servem só como dado fictício.

| Persona | Dados | Resultado esperado |
|---|---|---|
| A, caminho feliz | 30 anos (nasc. 15/03/1996), renda R$ 5.000, tratamento R$ 15.000, CPF 529.982.247-25 | Alfa aprova (50.000 ≥ 15.000). Beta aprova R$ 9.000. Gama aprova (30 ≥ 25 e 15.000 ≤ 20.000). Delta depende do cenário |
| B, recusas por regra | 22 anos (nasc. 10/05/2004), renda R$ 1.500, tratamento R$ 25.000, CPF 123.456.789-09 | Alfa recusa (15.000 < 25.000). Gama recusa (idade e valor). Beta aprova R$ 15.000. Delta aleatória |
| C, ticket alto | 40 anos, renda R$ 3.000, tratamento R$ 45.000 | Alfa recusa (30.000 < 45.000). Gama recusa (> 20.000). Beta aprova R$ 27.000. Só ofertas parciais |

Sequência sugerida, com tempo aproximado:

1. **Cadastro** (2 min). Mostrar validação na hora: CPF 111.111.111-11 rejeitado, idade 17 rejeitada, valor R$ 999,99 rejeitado. Voltar um passo e mostrar que nada se perdeu.
2. **Cenário "todas aprovam"** (3 min). Persona A com preset. Apontar os status virando um a um, a Delta fixada em sucesso rápido, a Beta parcial com o aviso de cobertura. Mostrar a ordenação por parcela e por total e explicar o viés da Beta.
3. **Cenário "Delta falha"** (2 min). Persona A com preset de erro 500. Apontar o motivo "erro" no card e a jornada seguindo com três ofertas.
4. **Cenário "Delta estoura o tempo"** (3 min). Persona A com preset de 12 s. Apontar o contador, o fechamento aos 10 s, o status indisponível por timeout e, se der, que a resposta tardia não mudou nada.
5. **Cenário "nenhuma aprova"** (2 min). Preset forçando as quatro. Mostrar a tela de motivo e o botão de tentar um valor menor voltando com os dados preenchidos.
6. **Escolha e confirmação** (2 min). Escolher uma oferta, mostrar a confirmação com o snapshot e, se implementado, recarregar a página e retomar.
7. **Reserva** (1 min). Persona B sem preset para mostrar recusas por regra em fluxo natural.

Cada cenário com espera de 10 s custa tempo real. Os presets devem usar tempos fixos curtos onde o cenário não exigir a espera.

## Checklist da véspera

- [ ] `docker compose up` e o caminho sem Docker testados em pasta limpa, do zero.
- [ ] Ambiente de desenvolvimento rodando antes da conversa, com hot reload no front e no backend.
- [ ] Suíte de testes rodando em menos de 10 segundos, com o comando decorado.
- [ ] Banco com dados de demo carregados ou formulário pré-preenchível.
- [ ] Seletor de cenário acessível pela UI, sem reiniciar nada.
- [ ] Saber de cor onde fica: a lista de financeiras, o timeout, a Price, a ordenação, a validação de CPF, o schema do cadastro, o contrato da API.
- [ ] README aberto e alinhado com o que foi feito. Nada no README que não exista no código.
- [ ] Repositório atualizado e link conferido.
- [ ] Editor com e sem assistente de IA preparados. Perguntar na hora se pode usar.
- [ ] Roteiro acima impresso ou em uma segunda tela.

## Checklist do dia

- [ ] Fechar abas e notificações; compartilhar só a janela do navegador e do editor.
- [ ] Rodar a suíte uma vez antes de começar e deixar o resultado visível.
- [ ] Ao receber a alteração: repetir o pedido em voz alta, apontar onde vai mexer e por quê, mexer, rodar os testes, mostrar na tela.
- [ ] Se não souber algo, dizer que não sabe e como descobriria. O enunciado valoriza decisão explicada, não adivinhação.
