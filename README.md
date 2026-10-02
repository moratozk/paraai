# ParaAí

**ParaAí** é um provedor de tecnologia para estacionamentos, desenvolvido como
Trabalho de Conclusão de Curso (TCC). A solução combina software e hardware
para registrar atendimentos: cada estacionamento recebe um totem com ESP32 e
tela touch, além do painel de faturamento, acessos e ocupação. Motoristas usam
uma **carteira única** em toda a rede. A recarga é simulada para fins acadêmicos.

Decisão de 09/09/2026: o totem terá gabinete impresso em 3D, **sem sensores,
servo ou catraca física**. A ocupação passa a vir das entradas e saídas no
Firebase. A maquete virtual online é uma etapa futura, ainda não implementada.

```
┌─────────────────────┐         ┌──────────────────┐         ┌─────────────────────┐
│ TOTEM (ESP32)       │         │                  │         │ PAINEL WEB          │
│ 1 por estacionamento│ escreve │     Firebase     │  tempo  │ · Dono: faturamento,│
│ · tela touch        │ ◄─────► │    Firestore     │ ◄─────► │   acessos, ocupação │
│ · entrada e saída  │   lê    │                  │  real   │ · Motorista: carro, │
│ → pasta Main/       │         │                  │         │   saldo, recibos    │
└─────────────────────┘         └──────────────────┘         └─────────────────────┘
```

## Componentes

| Pasta | O que é | Documentação |
|---|---|---|
| [`Main/`](Main/) | Firmware do totem (ESP32 + Arduino): tela touch, entrada/saída por placa, vagas lógicas, cobrança por tempo | [Main/README.md](Main/README.md) |
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
publicar ou ocultar todos os estacionamentos da rede. Cada local também possui
uma central dedicada de vagas em tempo real, com ocupação, reservas, placas e
detalhes da permanência para acompanhamento da equipe de segurança. Contas
administrativas são promovidas pelo Firebase Console/Admin SDK e nunca pelo cadastro público.
As contas antigas de operador continuam compatíveis com o próprio pátio.

**Motorista** — cadastra a placa (padrão antigo ABC1234 ou Mercosul ABC1D23),
recarrega a carteira e usa qualquer estacionamento da rede: digita a placa no
totem, estaciona, e na saída o valor é debitado do saldo. Se o saldo não
cobrir a estadia, a saída é registrada com pendência e uma nova entrada só é
aceita depois da recarga. No painel vê onde o
carro está, o custo estimado ao vivo, os últimos acessos e todos os recibos.
Também encontra estacionamentos da rede por nome, bairro, cidade, tarifa e
disponibilidade na página **Estacionamentos**.

## Modelo de dados (Firestore)

```
estacionamentos/{EST-XXXXXX}
  nome, cidade, numVagas, tarifaHora, ownerUid, criadoEm
  ultimaAtualizacao, vagasLivres, vagasEmOperacao, tarifaAplicadaTotem
  modoTotem: "atendimento"                 -- heartbeat (60s)

estacionamentos/{id}/vagas/{1..N}
  ocupada, placa, origemOcupacao: "registro", tipo?
                                          -- ocupação lógica registrada pelo totem

catalogoEstacionamentos/{EST-XXXXXX}
  nome, endereço, tarifaHora, numVagas,
  ultimaAtualizacao, vagasLivres          -- vitrine segura do motorista

catalogoEstacionamentos/{id}/vagas/{1..N}  -- mapa público, sem placa
  ocupada (espelho do totem), reservadaAte (fim da reserva, Unix s),
  tipo: comum | pcd | idoso | gestante

reservas/{UID_MOTORISTA}                  -- reserva gratuita de 30 min
  placa, estacionamentoId, vaga, criadaEm, expiraEm,
  status: ativa | cancelada | utilizada   -- o totem usa a vaga reservada

veiculos/{PLACA}                          -- GLOBAL: carteira única na rede
  ativo, vagaAtual (0=fora), horaEntrada (Unix s), saldo,
  estacionamentoId (onde está agora, "" se fora), tarifaHoraEntrada,
  ownerUid, atualizadoEm                  -- gravados pelo painel (o nome
                                            fica só em users/{uid})

historico/{PLACA_horaEntrada}              -- novo firmware: ID da estadia
  placa, vaga, entrada, saida, duracaoMinutos, valorCobrado,
  valorPendente (parte não coberta pelo saldo), tarifaHora, estacionamentoId

historico/{ID_GERADO_PELO_APP}             -- versão anterior (só leitura)
  origem="aplicativo": estadias cobradas pelo app antes da reserva

totems/{FIREBASE_AUTH_UID}
  estacionamentoId, nome, email, ativo       -- identidade do equipamento

users/{uid}
  name, email, role ("motorista"|"operador"|"admin"), placa?, estacionamentoId?
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
   `Credenciais.example.h` → `Credenciais.h`, preencha WiFi de contingência, chaves,
   `TOTEM_EMAIL`, `TOTEM_PASSWORD` e `ESTACIONAMENTO_ID`; selecione a partição
   **Huge APP** e grave no ESP32.

No novo firmware, Wi-Fi é configurável pelo celular e a calibração do touch
fica salva no próprio ESP32. Regras e firmware devem ser instalados juntos
em manutenção: a saída exige débito, vaga e recibo no mesmo commit. Consulte
[o checklist de instalação e testes](Main/README.md#verificação-e-instalação-controlada)
antes de autorizar publicação/gravação.

## Limitações conhecidas (transparência acadêmica)

- Cada totem possui uma conta própria no Firebase Authentication. As regras
  restringem motoristas ao próprio veículo, operadores ao próprio pátio e
  equipamentos autorizados às operações necessárias de entrada e saída.
- A recarga de saldo é **simulada** (crédito direto no banco), sem gateway de
  pagamento.
- O app só reserva a vaga (grátis, 30 minutos). Na entrada, o totem usa a
  vaga reservada; sem reserva, escolhe a primeira vaga comum livre. Vagas
  especiais (PCD, 60+, gestante) só são usadas por quem as reservou. A
  cobrança acontece no totem, da entrada até a saída, pela tarifa por hora.
- O totem registra até 200 vagas lógicas, conforme a capacidade do painel.
  Não mede presença física. O simulador legado `/totem.html` não reflete o
  firmware atual.
- O novo firmware exige internet para confirmar operações. Compilação e
  testes em computador não substituem a calibração e o teste físico do touch.
