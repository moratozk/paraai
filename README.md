# ParaAí

**ParaAí** é um provedor de tecnologia para estacionamentos, desenvolvido como
Trabalho de Conclusão de Curso (TCC). A solução combina software e hardware
para automatizar o acesso: cada estacionamento contratado recebe um totem com
ESP32, sensores de vaga e catraca, além do painel de faturamento, acessos e
ocupação. Motoristas usam uma **carteira única** em toda a rede.

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

## Trabalho em equipe

O projeto usa branches e pull requests para que os dois autores possam trabalhar
em computadores e contas do Codex diferentes sem sobrescrever alterações. Leia
[`COLABORACAO.md`](COLABORACAO.md) antes de configurar uma nova máquina e
[`AGENTS.md`](AGENTS.md) para os acordos técnicos compartilhados pelos
assistentes.

## Os dois papéis

**Administrador do sistema** — usa um painel central para cadastrar, editar,
publicar ou ocultar todos os estacionamentos da rede. Contas administrativas
são promovidas pelo Firebase Console/Admin SDK e nunca pelo cadastro público.
As contas antigas de operador continuam compatíveis com o próprio pátio.

**Motorista** — cadastra a placa (padrão antigo ABC1234 ou Mercosul ABC1D23),
recarrega a carteira e usa qualquer estacionamento da rede: digita a placa no
totem, estaciona, e na saída o valor é debitado do saldo. No painel vê onde o
carro está, o custo estimado ao vivo, os últimos acessos e todos os recibos.
Também encontra estacionamentos da rede por nome, bairro, cidade, tarifa e
disponibilidade na página **Estacionamentos**.

## Modelo de dados (Firestore)

```
estacionamentos/{EST-XXXXXX}
  nome, cidade, numVagas, tarifaHora, ownerUid, criadoEm
  ultimaAtualizacao, vagasLivres, tarifaAplicadaTotem -- heartbeat (60s)

estacionamentos/{id}/vagas/{1..N}
  ocupada, placa                          -- sensor em tempo real

catalogoEstacionamentos/{EST-XXXXXX}
  nome, endereço, tarifaHora, tarifaMinuto?, numVagas,
  ultimaAtualizacao, vagasLivres          -- vitrine segura do motorista

catalogoEstacionamentos/{id}/vagas/{1..N}
  ocupada, reservada?                     -- mapa público, sem placa

estadiasApp/{UID_MOTORISTA}
  placa, estacionamentoId, vaga, inicio, tarifaMinuto,
  modoPagamento, valorAntecipado, status  -- cobrança simulada pelo app

veiculos/{PLACA}                          -- GLOBAL: carteira única na rede
  ativo, vagaAtual (0=fora), horaEntrada (Unix s), saldo,
  estacionamentoId (onde está agora, "" se fora), tarifaHoraEntrada,
  ownerUid, ownerNome, atualizadoEm       -- gravados pelo painel

historico/{PLACA_timestamp}
  placa, vaga, entrada, saida, duracaoMinutos, valorCobrado, tarifaHora,
  estacionamentoId

historico/{ID_GERADO_PELO_APP}
  origem="aplicativo", ownerUid, placa, vaga, entrada, saida,
  duracaoMinutos, tarifaMinuto, valorAntecipado, valorCobrado, status

totems/{FIREBASE_AUTH_UID}
  estacionamentoId, nome, email, ativo       -- identidade do equipamento

users/{uid}
  name, email, role ("motorista"|"operador"), placa?, estacionamentoId?
```

Convenções: timestamps em **segundos Unix**; placas em **maiúsculas, sem
hífen**. O painel grava `numVagas` e `tarifaHora` no Firestore; o totem lê os
dois campos automaticamente. A tarifa é congelada no momento da entrada para
não mudar retroativamente durante uma estadia.

## Como subir o sistema do zero

1. **Firebase** — crie um projeto, habilite *Authentication (e-mail/senha)* e
   *Firestore*. Publique as regras de [`firestore.rules`](firestore.rules).
2. **Painel** — siga [Web/README.md](Web/README.md): `npm install`, copie
   `.env.example` → `.env`, preencha e `npm run dev`.
3. **Promova uma conta administrativa** alterando no Firebase Console o campo
   `users/{UID}.role` para `admin`. Essa operação não é exposta no site.
4. **Cadastre o estacionamento** no painel administrativo e copie o ID exibido
   no cartão do local (formato `EST-XXXXXX`).
5. Em uma conta de operador existente, **Perfil > Segurança do totem** gera
   uma credencial exclusiva do
   equipamento.
6. **Firmware** — siga [Main/README.md](Main/README.md): copie
   `Credenciais.example.h` → `Credenciais.h`, preencha WiFi, chaves,
   `TOTEM_EMAIL`, `TOTEM_PASSWORD` e `ESTACIONAMENTO_ID`; selecione a partição
   **Huge APP** e grave no ESP32.

## Limitações conhecidas (transparência acadêmica)

- Cada totem possui uma conta própria no Firebase Authentication. As regras
  restringem motoristas ao próprio veículo, operadores ao próprio pátio e
  equipamentos autorizados às operações necessárias de entrada e saída.
- A recarga de saldo é **simulada** (crédito direto no banco), sem gateway de
  pagamento.
- A escolha e cobrança de vaga pelo aplicativo também são simuladas. O total
  usa a tarifa por minuto do estacionamento e é debitado da carteira interna
  quando o motorista encerra a permanência.
- O hardware atual monitora até quatro sensores físicos. O painel aceita mais
  vagas, mas avisa quando a configuração ultrapassa os sensores instalados.
