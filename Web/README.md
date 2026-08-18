# ParaAí — Painel Web

Painel web do **ParaAí**, provedor de tecnologia (software + hardware) para
estacionamentos, desenvolvido como Trabalho de Conclusão de Curso (TCC). O
painel conversa, via Firebase Firestore, com os totens ESP32 instalados nos
pátios da rede — veja o [README da raiz](../README.md) para a visão geral.

## O que o painel faz

**Landing (pública)** — página de apresentação com fotografias em parallax,
explicando a experiência para donos de estacionamento e motoristas.

**Conta de operador (dono de estacionamento)**
- Autocadastro em etapas: conta, endereço preenchido pelo CEP e nº de vagas;
  recebe um `ESTACIONAMENTO_ID` (formato `EST-XXXXXX`) para o totem. A tarifa
  é definida depois e pode ser alterada no painel.
- Painel: valores recebidos (hoje / 7 dias / 30 dias / total), acessos,
  ocupação vaga a vaga ao vivo, status do totem, movimentações com valores.
- Mapa de vagas em tempo real.
- Gestão de equipamentos: gera uma conta exclusiva por totem e permite
  bloquear um dispositivo sem afetar a conta do operador.

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

### Recuperação de senha dentro do site

Para o botão do e-mail abrir a tela personalizada do ParaAí:

1. Em **Authentication > Templates > Redefinição de senha**, personalize a
   URL da ação para `https://SEU_DOMINIO/redefinir-senha`.
2. Em **Authentication > Configurações > Domínios autorizados**, adicione o
   domínio onde o site será publicado.
3. Durante o desenvolvimento, mantenha `localhost` autorizado. Não use uma URL
   local no template que será enviado aos usuários em produção.

O `url` enviado por `sendPasswordResetEmail` é apenas o destino posterior ao
fluxo; ele não substitui a URL do manipulador configurada no template.

Build: `npm run build` · Preview: `npm run preview` · Lint: `npm run lint`.

## Estrutura

```
src/
├── components/       Navbar, PrivateRoute, Logo (arquivo PNG oficial)
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
└── pages/            Home, Login, Cadastro (2 papéis), Dashboard (roteia por
                      papel), PainelOperador, PainelMotorista, Historico,
                      Perfil e Configuracoes
```

## Contrato de dados com o totem

O modelo completo está no [README do firmware](../Main/README.md). Pontos que
o painel precisa respeitar:

- Timestamps em **segundos Unix** (o totem grava assim via REST).
- `utils/constants.js` contém apenas valores de fallback e limites de status.
- Ao cadastrar um veículo, o painel cria `veiculos/{PLACA}` com os campos que
  o totem lê (`ativo/vagaAtual/horaEntrada/saldo`).
- O status "totem online" vem do heartbeat que o ESP32 grava no documento
  `estacionamentos/{id}` a cada 60 s.
- O pareamento painel ↔ totem usa `ESTACIONAMENTO_ID`, `TOTEM_EMAIL` e
  `TOTEM_PASSWORD`, gerados em *Perfil > Segurança do totem*. As regras do
  Firestore validam a identidade e o estacionamento de cada equipamento.
- `numVagas` e `tarifaHora` são lidos pelo totem no documento do
  estacionamento. A tarifa usada fica registrada em `tarifaHoraEntrada` até a
  saída.
