# Números de referência e fixtures de teste

Todos os valores foram calculados com aritmética decimal exata (Python `decimal`, precisão 30) e arredondados a centavos com half-up. Podem entrar direto como valores esperados em testes.

## Probabilidades da Delta

Premissas: tempo uniforme contínuo entre 4 e 15 s, deadline de 10 s, erro 500 em 30% das chamadas.

| Desfecho | Erro decidido no início e entregue após o delay | Erro imediato, independente do delay |
|---|---|---|
| Estoura os 10 s | 45,5% | 31,8% |
| Erro 500 visível antes dos 10 s | 16,4% | 30,0% |
| Aprova dentro dos 10 s | 38,2% | 38,2% |
| Indisponível (soma) | 61,8% | 61,8% |

Derivados:
- P(tempo > 10 s) = (15 − 10) / (15 − 4) = 5/11.
- "Todas aprovam" em fluxo natural, mesmo com dados perfeitos: 38,2% por tentativa. Chance de falhar 4 tentativas seguidas: 14,6%.
- Só a Delta pode passar dos 10 s. Alfa (máx. 1,5 s), Gama (máx. 3 s) e Beta (máx. 5 s) sempre respondem a tempo.
- Ordem típica de chegada: Alfa, Gama, Beta, Delta. As faixas se sobrepõem, então o front deve atualizar por id da financeira, não por posição.
- Soma dos piores casos de Alfa, Beta e Gama: 9,5 s. Chamadas encadeadas com `await` fazem a Delta estourar sempre.

## Tabela Price de referência

Paciente de 30 anos, renda R$ 3.000, tratamento R$ 10.000, as quatro financeiras aprovando.

Valores aprovados: Alfa R$ 10.000 (3.000 × 10 = 30.000 ≥ 10.000); Beta R$ 6.000 (60%); Gama R$ 10.000 (30 ≥ 25 e 10.000 ≤ 20.000); Delta R$ 10.000.

| Financeira | Taxa | PV | n | Parcela | Total (parcela × n) | Total (PMT exato × n) | Juros (total − PV) |
|---|---|---|---|---|---|---|---|
| Alfa | 2,49% | 10.000,00 | 6 | 1.814,89 | 10.889,34 | 10.889,36 | 889,34 |
| Alfa | 2,49% | 10.000,00 | 12 | 974,28 | 11.691,36 | 11.691,37 | 1.691,36 |
| Alfa | 2,49% | 10.000,00 | 18 | 696,10 | 12.529,80 | 12.529,80 | 2.529,80 |
| Beta | 1,99% | 6.000,00 | 12 | 567,01 | 6.804,12 | 6.804,11 | 804,12 |
| Beta | 1,99% | 6.000,00 | 18 | 399,86 | 7.197,48 | 7.197,49 | 1.197,48 |
| Beta | 1,99% | 6.000,00 | 24 | 316,87 | 7.604,88 | 7.604,82 | 1.604,88 |
| Gama | 3,29% | 10.000,00 | 6 | 1.863,76 | 11.182,56 | 11.182,54 | 1.182,56 |
| Gama | 3,29% | 10.000,00 | 10 | 1.189,72 | 11.897,20 | 11.897,21 | 1.897,20 |
| Gama | 3,29% | 10.000,00 | 12 | 1.022,09 | 12.265,08 | 12.265,09 | 2.265,08 |
| Delta | 2,19% | 10.000,00 | 12 | 956,66 | 11.479,92 | 11.479,97 | 1.479,92 |
| Delta | 2,19% | 10.000,00 | 24 | 540,16 | 12.963,84 | 12.963,81 | 2.963,84 |
| Delta | 2,19% | 10.000,00 | 36 | 404,40 | 14.558,40 | 14.558,37 | 4.558,40 |

A coluna "Total (PMT exato × n)" existe só para mostrar a diferença de centavos. A regra recomendada é total = parcela arredondada × n.

### Ordenações esperadas sobre essa tabela

Por menor parcela:

1. Beta 24x, 316,87
2. Beta 18x, 399,86
3. Delta 36x, 404,40
4. Delta 24x, 540,16
5. Beta 12x, 567,01
6. Alfa 18x, 696,10
7. Delta 12x, 956,66
8. Alfa 12x, 974,28
9. Gama 12x, 1.022,09
10. Gama 10x, 1.189,72
11. Alfa 6x, 1.814,89
12. Gama 6x, 1.863,76

Por menor custo total (total pago):

1. Beta 12x, 6.804,12
2. Beta 18x, 7.197,48
3. Beta 24x, 7.604,88
4. Alfa 6x, 10.889,34
5. Gama 6x, 11.182,56
6. Delta 12x, 11.479,92
7. Alfa 12x, 11.691,36
8. Gama 10x, 11.897,20
9. Gama 12x, 12.265,08
10. Alfa 18x, 12.529,80
11. Delta 24x, 12.963,84
12. Delta 36x, 14.558,40

Por menor juros (total − PV), caso se decida oferecer essa ordenação:

1. Beta 12x, 804,12
2. Alfa 6x, 889,34
3. Gama 6x, 1.182,56
4. Beta 18x, 1.197,48
5. Delta 12x, 1.479,92
6. Beta 24x, 1.604,88
7. Alfa 12x, 1.691,36
8. Gama 10x, 1.897,20
9. Gama 12x, 2.265,08
10. Alfa 18x, 2.529,80
11. Delta 24x, 2.963,84
12. Delta 36x, 4.558,40

A Beta lidera as duas ordenações do enunciado porque financia R$ 6.000 e deixa R$ 4.000 descobertos.

## Fixtures extras de Price

| Caso | PV | Taxa | n | Parcela | Total |
|---|---|---|---|---|---|
| Beta, PV mínimo (tratamento R$ 1.000) | 600,00 | 1,99% | 12 | 56,70 | 680,40 |
| Beta, PV mínimo | 600,00 | 1,99% | 18 | 39,99 | 719,82 |
| Beta, PV mínimo | 600,00 | 1,99% | 24 | 31,69 | 760,56 |
| Alfa, PV máximo | 50.000,00 | 2,49% | 6 | 9.074,46 | 54.446,76 |
| Alfa, PV máximo | 50.000,00 | 2,49% | 12 | 4.871,41 | 58.456,92 |
| Alfa, PV máximo | 50.000,00 | 2,49% | 18 | 3.480,50 | 62.649,00 |
| Gama, no limite de R$ 20.000 | 20.000,00 | 3,29% | 6 | 3.727,51 | 22.365,06 |
| Gama, no limite | 20.000,00 | 3,29% | 10 | 2.379,44 | 23.794,40 |
| Gama, no limite | 20.000,00 | 3,29% | 12 | 2.044,18 | 24.530,16 |
| Delta, PV máximo | 50.000,00 | 2,19% | 12 | 4.783,32 | 57.399,84 |
| Delta, PV máximo | 50.000,00 | 2,19% | 24 | 2.700,79 | 64.818,96 |
| Delta, PV máximo | 50.000,00 | 2,19% | 36 | 2.022,00 | 72.792,00 |
| Beta, 60% de R$ 50.000 | 30.000,00 | 1,99% | 12 | 2.835,05 | 34.020,60 |
| Beta, 60% de R$ 50.000 | 30.000,00 | 1,99% | 24 | 1.584,34 | 38.024,16 |
| Taxa zero (caso degenerado, PMT = PV / n) | 12.000,00 | 0% | 12 | 1.000,00 | 12.000,00 |
| Taxa zero com dízima | 10.000,00 | 0% | 12 | 833,33 | 9.999,96 |

Erros clássicos, para testes negativos:

| Erro | Resultado errado | Resultado certo |
|---|---|---|
| Taxa em percentual (2,49) em vez de decimal (0,0249), PV 10.000, 12x | 24.900,01 | 974,28 |
| PV igual ao tratamento na Beta (10.000) em vez do aprovado (6.000), 12x | 945,02 | 567,01 |
| Taxa zero sem tratamento | `NaN` em JavaScript, sem exceção | PV / n |

## Arredondamento do teto da Beta

| Tratamento | 60% exato | Para baixo (recomendado) | Half-up |
|---|---|---|---|
| 33.333,33 | 19.999,998 | 19.999,99 | 20.000,00 |
| 1.000,01 | 600,006 | 600,00 | 600,01 |
| 10.000,00 | 6.000,00 | 6.000,00 | 6.000,00 |

## Regra da Alfa em ponto flutuante

- Em JavaScript, `1234.56 * 10` vale `12345.599999999999`, menor que `12345.60`. Renda R$ 1.234,56 com tratamento R$ 12.345,60 seria recusada por engano.
- Em centavos inteiros: 123456 × 10 = 1234560 ≥ 1234560, aprovado.
- Renda mínima para a Alfa aprovar: tratamento / 10. Para R$ 1.000, renda R$ 100. Para R$ 10.000, renda R$ 1.000. Para R$ 50.000, renda R$ 5.000.

## Fronteiras de idade

Data de referência: 22/10/2026. Os testes devem injetar a data de referência e calcular as datas de nascimento a partir dela, nunca usar datas fixas.

| Nascimento | Idade em 22/10/2026 | Cadastro (18 a 80) | Gama (recusa < 25) |
|---|---|---|---|
| 22/10/2008 | 18 | aceita | recusa |
| 23/10/2008 | 17 | rejeita | |
| 22/10/2001 | 25 | aceita | aprova |
| 23/10/2001 | 24 | aceita | recusa |
| 23/10/1945 | 80 | aceita | aprova |
| 22/10/1945 | 81 | rejeita | |
| 29/02/2008 | 18 | aceita | recusa |

Casos extras: data futura, data inexistente (31/02), string vazia.

## Fronteiras de valor

| Valor do tratamento | Cadastro | Gama |
|---|---|---|
| 999,99 | rejeita | |
| 1.000,00 | aceita | aprova (se idade ≥ 25) |
| 20.000,00 | aceita | aprova |
| 20.000,01 | aceita | recusa |
| 50.000,00 | aceita | recusa |
| 50.000,01 | rejeita | |

## CPF

| Entrada | Dígitos verificadores | Resultado esperado |
|---|---|---|
| 529.982.247-25 | corretos | válido |
| 52998224725 | corretos | válido (mesmo CPF sem máscara) |
| 123.456.789-09 | corretos | válido |
| 123.456.789-00 | errados | inválido |
| 111.111.111-11 | corretos pelo algoritmo | inválido por sequência repetida |
| 000.000.000-00 | corretos pelo algoritmo | inválido por sequência repetida |
| 222.222.222-22 | corretos pelo algoritmo | inválido por sequência repetida |
| 1234567890 (10 dígitos) | | inválido |
| 123456789012 (12 dígitos) | | inválido |
| 529.982.24A-25 | | inválido |

Todas as dez sequências repetidas, de 000.000.000-00 a 999.999.999-99, passam no cálculo dos dígitos verificadores. Os CPFs válidos acima são exemplos sintéticos de uso corrente em testes.

## Cenários forçados: resultados esperados

Persona A: 30 anos, renda R$ 5.000, tratamento R$ 15.000.

| Preset | Alfa | Beta | Gama | Delta | Tela final |
|---|---|---|---|---|---|
| Todas aprovam | aprova 15.000 | aprova 9.000 (parcial) | aprova 15.000 | aprova 15.000, rápido | 12 ofertas, aviso de parcial na Beta |
| Delta falha | aprova | aprova (parcial) | aprova | indisponível, motivo erro 500 | 9 ofertas |
| Delta estoura o tempo | aprova | aprova (parcial) | aprova | indisponível, motivo timeout aos 10 s | 9 ofertas |
| Nenhuma aprova | recusada (forçada) | recusada (forçada) | recusada (forçada) | recusada (forçada) | tela de motivo e próximo passo |

Persona B, sem preset: 22 anos, renda R$ 1.500, tratamento R$ 25.000. Alfa recusa (15.000 < 25.000). Gama recusa (idade e valor). Beta aprova R$ 15.000. Delta aleatória.
