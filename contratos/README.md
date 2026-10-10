# Contratos entre o site, o totem e as regras

Algumas regras do ParaAí existem três vezes, cada uma na linguagem da sua
parte: no site (`web/src/utils`), no firmware do totem
(`firmware/totem/LogicaTotem.h`) e nas regras do Firestore
(`firebase/firestore.rules`). Se uma das três mudar sozinha, o totem cobra um
valor que as regras recusam, ou o site mostra uma vaga como PCD e o totem a
entrega como comum.

Os arquivos desta pasta guardam os casos esperados dessas regras, num lugar
só. Os testes das três partes leem os mesmos arquivos:

| Arquivo | O que define | Site | Totem | Regras |
| --- | --- | --- | --- | --- |
| `cobranca.csv` | valor da estadia, saldo depois da saída e parte pendente | `web/test/contratos.test.js` | `firmware/test/logica_totem.test.cpp` | `firebase/test/firestore.test.mjs` |
| `vagas-especiais.csv` | tipo das vagas que não têm o campo `tipo` gravado | `web/test/contratos.test.js` | `firmware/test/logica_totem.test.cpp` | `firebase/test/firestore.test.mjs` |
| `placas.csv` | placas aceitas (padrão antigo e Mercosul) | `web/test/contratos.test.js` | `firmware/test/logica_totem.test.cpp` | `web/test/contratos.test.js` (expressão das regras) |

Para mudar uma dessas regras, mude o arquivo daqui e as três implementações
no mesmo PR. Linhas que começam com `#` são comentários.

## A conta da estadia

`valor = arredondar(segundos / 3600 × tarifa × 100) / 100`, com a tarifa
congelada na entrada e o arredondamento ao centavo mais próximo. A conta é
feita em ponto flutuante (`double`), nessa ordem, nas três partes. Por isso um
meio centavo exato às vezes cai para baixo: 9 minutos a R$ 8,50 dão R$ 1,275
na conta exata e R$ 1,27 na do totem. O que importa é que as três façam a
mesma conta; o caso está em `cobranca.csv` e falha se uma delas mudar a ordem.
`saldo_final = saldo − valor`. `pendente` é a parte desta estadia que o saldo
não cobriu: zero quando o saldo final não fica negativo, o valor inteiro quando
o saldo já era zero ou negativo, e o que faltou nos outros casos. Dívida
anterior não entra.
