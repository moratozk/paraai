# ParaAí

**ParaAí** é um provedor de tecnologia para estacionamentos, desenvolvido como
Trabalho de Conclusão de Curso (TCC): fornecemos o **kit completo — software +
hardware** — para estacionamentos que queiram operar no automático. Cada
cliente (dono de estacionamento) recebe um totem físico com ESP32, sensores de
vaga e catraca automática, e acompanha faturamento, acessos e ocupação num
painel web. Motoristas usam uma **carteira única**: um único saldo que vale em
qualquer estacionamento da rede.

```
┌─────────────────────┐         ┌──────────────────┐         ┌─────────────────────┐
│ TOTEM (ESP32)       │         │                  │         │ PAINEL WEB          │
│ 1 por estacionamento│ escreve │     Firebase     │  tempo  │ · Dono: faturamento,│
│ · tela touch        │ ◄─────► │    Firestore     │ ◄─────► │   acessos, ocupação │
│ · sensores + catraca│   lê    │                  │  real   │ · Motorista: carro, │
│ → pasta Main/       │         │                  │         │   saldo, recibos    │
└─────────────────────┘         └──────────────────┘         └─────────────────────┘
```

## Componentes

| Pasta | O que é | Documentação |
|---|---|---|
| [`Main/`](Main/) | Firmware do totem (ESP32 + Arduino): tela ILI9341 touch, sensores HC-SR04, catraca com servo, entrada/saída por placa, cobrança por tempo | [Main/README.md](Main/README.md) |
| [`Web/`](Web/) | Painel web (React + Vite + Firebase): landing B2B, conta de operador (dono) e de motorista, faturamento, histórico, carteira | [Web/README.md](Web/README.md) |
| [`libraries/`](libraries/) | Bibliotecas Arduino usadas pelo firmware | — |
| [`firestore.rules`](firestore.rules) | Regras de segurança do Firestore com comentários | — |

## Os dois papéis

**Dono de estacionamento (operador)** — cadastra o estacionamento no painel
(nome, cidade, nº de vagas, tarifa), recebe um `ESTACIONAMENTO_ID` e configura
esse ID no totem. No painel acompanha: valores recebidos (hoje / 7 dias / 30
dias / total), quantidade de acessos, ocupação vaga a vaga ao vivo, status do
totem e a tabela de movimentações.

**Motorista** — cadastra a placa (padrão antigo ABC1234 ou Mercosul ABC1D23),
recarrega a carteira e usa qualquer estacionamento da rede: digita a placa no
totem, estaciona, e na saída o valor é debitado do saldo. No painel vê onde o
carro está, o custo estimado ao vivo, os últimos acessos e todos os recibos.

## Modelo de dados (Firestore)

```
estacionamentos/{EST-XXXXXX}
  nome, cidade, numVagas, tarifaHora, ownerUid, criadoEm
  ultimaAtualizacao, vagasLivres          -- heartbeat do totem (60s)

estacionamentos/{id}/vagas/{1..N}
  ocupada, placa                          -- sensor em tempo real

veiculos/{PLACA}                          -- GLOBAL: carteira única na rede
  ativo, vagaAtual (0=fora), horaEntrada (Unix s), saldo,
  estacionamentoId (onde está agora, "" se fora),
  ownerUid, ownerNome, atualizadoEm       -- gravados pelo painel

historico/{PLACA_timestamp}
  placa, vaga, entrada, saida, duracaoMinutos, valorCobrado, estacionamentoId

users/{uid}
  name, email, role ("motorista"|"operador"), placa?, estacionamentoId?
```

Convenções: timestamps em **segundos Unix**; placas em **maiúsculas, sem
hífen**; o nº de vagas e a tarifa cobrada pelo totem são os configurados no
firmware (`NUM_VAGAS`, `VALOR_POR_HORA`).

## Como subir o sistema do zero

1. **Firebase** — crie um projeto, habilite *Authentication (e-mail/senha)* e
   *Firestore*. Publique as regras de [`firestore.rules`](firestore.rules).
2. **Painel** — siga [Web/README.md](Web/README.md): `npm install`, copie
   `.env.example` → `.env`, preencha e `npm run dev`.
3. **Cadastre o estacionamento** no painel ("Tenho um estacionamento") e copie
   o ID exibido em *Perfil > Meu estacionamento* (formato `EST-XXXXXX`).
4. **Firmware** — siga [Main/README.md](Main/README.md): copie
   `Credenciais.example.h` → `Credenciais.h`, preencha WiFi + chaves +
   `ESTACIONAMENTO_ID` e grave no ESP32 pela Arduino IDE.

## Limitações conhecidas (transparência acadêmica)

- O totem acessa o Firestore **sem autenticação** (`test_mode` da lib
  Firebase-ESP-Client); as regras precisam deixar as coleções do dispositivo
  abertas. Produção real: autenticação por dispositivo e regras restritivas.
- A recarga de saldo é **simulada** (crédito direto no banco), sem gateway de
  pagamento.
- A tarifa cobrada pelo totem é a do firmware (`VALOR_POR_HORA`); a tarifa
  cadastrada no painel é usada para exibição e estimativas.
