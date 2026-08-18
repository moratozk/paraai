# ParaAí — Firmware do Totem (ESP32)

Firmware para ESP32 de um sistema de estacionamento inteligente com controlo de
acesso por placa, 4 vagas monitoradas por sensor ultrassônico e cobrança
proporcional ao tempo estacionado, sincronizado em tempo real com o Firebase
Firestore. Projeto desenvolvido como Trabalho de Conclusão de Curso (TCC).

## Visão geral

- O motorista escolhe **ENTRADA** ou **SAÍDA** e digita a placa no teclado
  touch. A escolha explícita evita executar a operação oposta por engano.
- Na entrada, uma placa desconhecida pode ser cadastrada no próprio totem. Na
  saída, o firmware calcula o tempo, debita o saldo e abre a catraca.
- 4 sensores HC-SR04 monitoram a ocupação física de cada vaga em tempo real e
  mantêm o Firestore atualizado, com filtro anti-ruído (só considera uma
  mudança de estado após 3 leituras consecutivas iguais).
- Se a rede cair, o sistema informa **sem conexão**, não abre a catraca sem
  registro e tenta reconectar sozinho em segundo plano.

## Arquitetura do firmware

| Arquivo | Responsabilidade |
|---|---|
| [`Main.ino`](Main.ino) | `setup()`/`loop()`, máquina de estados da tela, conexão WiFi/NTP/Firebase, regras de negócio (entrada/saída/cobrança) |
| [`Sensores.ino`](Sensores.ino) | Leitura dos 4 HC-SR04, filtro de confirmação, reserva lógica de vaga |
| [`DisplayUI.ino`](DisplayUI.ino) | Toda a interface gráfica (ILI9341 + touch XPT2046) |
| [`Credenciais.h`](Credenciais.example.h) | Wi-Fi + chaves do Firebase (**não vai para o Git** — veja [Configuração](#configuração)) |

> `Sensores.ino` e `DisplayUI.ino` são incluídos explicitamente no topo do
> `Main.ino` (`#include "Sensores.ino"`) **e também** concatenados
> automaticamente pela Arduino IDE (por serem `.ino` na mesma pasta). Os
> `#ifndef ..._H` no topo de cada um existem por causa disso: garantem que o
> conteúdo só é compilado uma vez, não importa qual caminho o incluiu primeiro.

### Máquina de estados da tela

```
TELA_INICIAL --(ENTRADA/SAÍDA)--> TELA_TECLADO --(OK)--> TELA_PROCESSANDO
      ^                              |                         |
      |                          (CANCELAR)                    +--> TELA_CONFIRMAR_CADASTRO
      |                                                        |       (só na entrada)
      +---------------- TELA_RESULTADO <-----------------------+
```

### Conexão (WiFi -> NTP -> Firebase)

A conexão é gerenciada por `gerenciarConexao()`, chamada a cada volta do
`loop()`, sem travar a UI:

1. Se o WiFi caiu, tenta reconectar a cada 10s.
2. Com WiFi ativo, sincroniza a hora via NTP (necessária tanto para os
   timestamps de cobrança quanto para o handshake TLS do Firebase validar o
   certificado).
3. Com a hora sincronizada, configura o Firebase.

Isso funciona tanto na primeira conexão quanto para se recuperar sozinho de
uma queda de rede no meio da operação.

### Reserva lógica de vaga

Sem isso, dois carros dando entrada em sequência rápida (antes do primeiro
carro ser fisicamente detectado pelo sensor) podiam ser designados para a
**mesma vaga**. Ao encontrar uma vaga livre na entrada, ela é reservada
imediatamente (`reservarVaga`); a reserva:

- é liberada assim que o sensor confirma o carro fisicamente estacionado, ou
- expira sozinha depois de 2 minutos, caso o motorista desista no caminho.

### Escritas críticas no Firestore são conferidas

Abrir a catraca só acontece **depois** de confirmar que a escrita que
registra a entrada/saída no Firestore teve sucesso — evita liberar o carro
sem nenhum registro da cobrança no banco.

## Modelo de dados (Firestore)

Cada totem pertence a UM estacionamento da rede, definido pelo
`ESTACIONAMENTO_ID` no `Credenciais.h` (o ID é gerado pelo painel web quando
o dono cadastra o estacionamento). O equipamento também entra no Firebase
Authentication com `TOTEM_EMAIL` e `TOTEM_PASSWORD`; essas credenciais são
exclusivas e podem ser bloqueadas pelo operador.

```
estacionamentos/{ESTACIONAMENTO_ID}
  nome, cidade, numVagas, tarifaHora, ownerUid  -- gravados pelo painel
  ultimaAtualizacao: integer -- heartbeat deste firmware (a cada 60s); o
                             --  painel considera offline após ~2,5 min
  vagasLivres, vagasSuportadasTotem, tarifaAplicadaTotem

estacionamentos/{id}/vagas/{1..4}
  ocupada: boolean         -- espelha o sensor em tempo real
  placa: string            -- placa do veículo atualmente na vaga (ou "")

totems/{FIREBASE_AUTH_UID}
  estacionamentoId, nome, email, ativo
  -- autoriza o equipamento a operar somente no pátio vinculado

veiculos/{placa}           -- GLOBAL (carteira única na rede toda)
  ativo: boolean           -- cadastro liberado?
  vagaAtual: integer        -- 0 = fora, 1-4 = número da vaga
  horaEntrada: integer      -- timestamp Unix (segundos) da entrada, 0 se fora
  tarifaHoraEntrada: double -- tarifa congelada quando a entrada é registrada
  estacionamentoId: string  -- onde o carro está agora ("" se fora)
  saldo: double|integer     -- saldo em R$ (o painel pode gravar inteiro;
                            --  o firmware aceita os dois tipos)
  [ownerUid, ownerNome, atualizadoEm -- gravados pelo painel; ignorados aqui]

historico/{placa}_{timestamp}
  placa, vaga, entrada, saida, duracaoMinutos, valorCobrado, tarifaHora,
  estacionamentoId
```

Os documentos `veiculos/{placa}` podem ser criados pelo painel web ou pelo
próprio totem durante uma entrada. O motorista pode vincular depois à sua
conta uma placa criada no equipamento.

## Hardware / pinagem (ESP32)

| Função | Pino(s) |
|---|---|
| Servo da catraca | 4 |
| TFT SCLK / MOSI / MISO / CS | 14 / 13 / 12 / 15 |
| TFT DC | 2 |
| TFT RST | -1 (ligado ao EN do ESP32) |
| TFT Backlight (LED) | 21 |
| Touch T_CS / T_CLK / T_DIN / T_DO | 33 / 25 / 32 / 36 (barramento SPI próprio — HSPI, separado do da tela) |
| Sensor 1-4 TRIGGER | 18, 19, 23, 27 |
| Sensor 1-4 ECHO | 34, 35, 5, 16 (recomenda-se divisor de tensão 5V→3,3V em cada ECHO) |

## Bibliotecas necessárias (Arduino IDE)

- `Firebase ESP Client` (mobizt)
- `ESP32Servo`
- `Adafruit GFX Library`
- `Adafruit ILI9341`
- `XPT2046_Touchscreen` (Paul Stoffregen)

Board: **ESP32 Dev Module** (ou equivalente) via *esp32* board package.

## Configuração

1. Copie o modelo de credenciais e preencha com os seus dados:
   ```
   copy Credenciais.example.h Credenciais.h
   ```
2. Edite `Credenciais.h` com o SSID/senha do Wi-Fi e as chaves do seu projeto
   Firebase (API Key, Project ID, Database URL).
3. No painel, abra **Perfil > Segurança do totem**, gere um acesso e copie
   `TOTEM_EMAIL`, `TOTEM_PASSWORD` e `ESTACIONAMENTO_ID`.
4. Na Arduino IDE, selecione **ESP32 Dev Module** e, em **Partition Scheme**,
   use **Huge APP (3MB No OTA/1MB SPIFFS)**. A partição padrão de 1,2 MB não
   comporta Firebase, interface e touch juntos.
5. Compile e envie para o ESP32. Tarifa e vagas passam a vir do painel.

`Credenciais.h` está no `.gitignore` e nunca deve ser commitado.

## Comandos de debug (Serial, 115200 baud)

| Tecla | Ação |
|---|---|
| `A` | Abre a catraca manualmente |
| `S` | Imprime um status completo (WiFi, hora, Firebase, estado das 4 vagas) |

## Limitações conhecidas

- A credencial do dispositivo fica gravada no firmware. Se um equipamento for
  perdido ou substituído, bloqueie-o em **Perfil > Segurança do totem** e gere
  outra credencial antes de instalar o novo.
- A tarifa por hora é sincronizada com o painel e congelada na entrada. Ainda
  não há faixas por período, convênios ou mensalistas.
- O relógio no cabeçalho e as leituras dos sensores são sequenciais e
  bloqueantes durante chamadas ao Firestore (`getDocument`/`patchDocument`),
  então a tela "Consultando..." pode ficar parada por alguns segundos em
  conexões lentas — é esperado, não é travamento.
