# ParaAí — Painel Web

Painel web do **ParaAí**, provedor de tecnologia (software + hardware) para
estacionamentos, desenvolvido como Trabalho de Conclusão de Curso (TCC). O
painel conversa, via Firebase Firestore, com os totens ESP32 instalados nos
pátios da rede — veja o [README da raiz](../README.md) para a visão geral.

## O que o painel faz

**Landing (pública)** — página B2B com animações (marquee, pista animada),
apresentando o kit para donos de estacionamento e a conta de motorista.

**Conta de operador (dono de estacionamento)**
- Autocadastro: nome do estacionamento, cidade, nº de vagas e tarifa; recebe
  um `ESTACIONAMENTO_ID` (formato `EST-XXXXXX`) para configurar no totem.
- Painel: valores recebidos (hoje / 7 dias / 30 dias / total), acessos,
  ocupação vaga a vaga ao vivo, status do totem, movimentações com valores.
- Mapa de vagas em tempo real.

**Conta de motorista**
- Cadastro da placa — aceita padrão antigo (ABC1234) **e** Mercosul (ABC1D23).
- Carteira única: um saldo que vale em toda a rede; recarga simulada.
- Painel: onde o carro está (qual estacionamento/vaga), cronômetro e custo
  estimado ao vivo, últimos acessos e recibos, total gasto.

Todos os dados são **ao vivo** (`onSnapshot`): sensor detecta o carro ou o
totem registra uma saída, o painel atualiza sem F5.

## Stack

React 19 · Vite · React Router 7 · Firebase (Auth + Firestore) · CSS puro
(identidade: amarelo viário + asfalto, tipografia Anton/Archivo, temas
claro/escuro).

## Como rodar

1. `npm install`
2. `copy .env.example .env` e preencha com os dados do seu projeto Firebase
   (Console > Configurações do projeto > Geral > Seus apps > app Web).
3. No Firebase Console, habilite **Authentication (e-mail/senha)** e
   **Firestore**; publique as regras de [`../firestore.rules`](../firestore.rules).
4. `npm run dev`

Build: `npm run build` · Preview: `npm run preview` · Lint: `npm run lint`.

## Estrutura

```
src/
├── components/       Navbar, PrivateRoute, Logo (marca SVG)
├── context/          AuthContext (sessão + papel do usuário em tempo real),
│                     ThemeContext (claro/escuro)
├── firebase/         Inicialização do SDK (lê variáveis do .env)
├── hooks/            useParkingData: useEstacionamento, useVagas,
│                     useVeiculo, useHistoricoPlaca,
│                     useHistoricoEstacionamento — todos com onSnapshot
├── services/         veiculos.js (placa, recarga),
│                     estacionamentos.js (cadastro do estacionamento)
├── utils/            constants.js (valores compartilhados com o firmware),
│                     format.js (moeda, datas, validação de placa)
└── pages/            Home (landing B2B), Login, Cadastro (2 papéis),
                      Dashboard (roteia por papel), PainelOperador,
                      PainelMotorista, MapaVagas, Historico, Perfil
```

## Contrato de dados com o totem

O modelo completo está no [README do firmware](../Main/README.md). Pontos que
o painel precisa respeitar:

- Timestamps em **segundos Unix** (o totem grava assim via REST).
- `utils/constants.js` espelha valores do firmware — se mudar lá, mude aqui.
- Ao cadastrar um veículo, o painel cria `veiculos/{PLACA}` com os campos que
  o totem lê (`ativo/vagaAtual/horaEntrada/saldo`).
- O status "totem online" vem do heartbeat que o ESP32 grava no documento
  `estacionamentos/{id}` a cada 60 s.
- O pareamento painel ↔ totem é feito pelo `ESTACIONAMENTO_ID` exibido em
  *Perfil > Meu estacionamento*.
