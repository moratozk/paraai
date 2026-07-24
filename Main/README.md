# Para Aí — Firmware do Totem (ESP32)

Firmware para ESP32 de um sistema de estacionamento inteligente com controlo de
acesso por placa, 4 vagas monitoradas por sensor ultrassônico e cobrança
proporcional ao tempo estacionado, sincronizado em tempo real com o Firebase
Firestore. Projeto desenvolvido como Trabalho de Conclusão de Curso (TCC).

## Visão geral

- Motorista digita a placa num teclado touch na tela ILI9341.
- O firmware consulta o Firestore: se a placa está cadastrada e ativa, decide
  automaticamente se é uma **entrada** (procura vaga livre, abre a catraca,
  inicia a cobrança) ou uma **saída** (calcula o valor pelo tempo estacionado,
  debita do saldo, abre a catraca).
- 4 sensores HC-SR04 monitoram a ocupação física de cada vaga em tempo real e
  mantêm o Firestore atualizado, com filtro anti-ruído (só considera uma
  mudança de estado após 3 leituras consecutivas iguais).
- Tudo funciona também **offline**: se a rede cair, o sistema informa
  claramente "sem conexão" em vez de travar ou dar comportamento indefinido, e
  reconecta sozinho quando a rede volta.

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
TELA_INICIAL --(toque)--> TELA_TECLADO --(OK)--> TELA_PROCESSANDO --> TELA_RESULTADO --(4s)--> TELA_INICIAL
                              |
                          (CANCELAR)
                              v
                         TELA_INICIAL
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
o dono cadastra o estacionamento).

```
estacionamentos/{ESTACIONAMENTO_ID}
  nome, cidade, numVagas, tarifaHora, ownerUid  -- gravados pelo painel
  ultimaAtualizacao: integer -- heartbeat deste firmware (a cada 60s); o
                             --  painel considera offline após ~2,5 min
  vagasLivres: integer

estacionamentos/{id}/vagas/{1..4}
  ocupada: boolean         -- espelha o sensor em tempo real
  placa: string            -- placa do veículo atualmente na vaga (ou "")

veiculos/{placa}           -- GLOBAL (carteira única na rede toda)
  ativo: boolean           -- cadastro liberado?
  vagaAtual: integer        -- 0 = fora, 1-4 = número da vaga
  horaEntrada: integer      -- timestamp Unix (segundos) da entrada, 0 se fora
  estacionamentoId: string  -- onde o carro está agora ("" se fora)
  saldo: double|integer     -- saldo em R$ (o painel pode gravar inteiro;
                            --  o firmware aceita os dois tipos)
  [ownerUid, ownerNome, atualizadoEm -- gravados pelo painel; ignorados aqui]

historico/{placa}_{timestamp}
  placa, vaga, entrada, saida, duracaoMinutos, valorCobrado,
  estacionamentoId
```

Os documentos `veiculos/{placa}` são criados pelo **painel web** (pasta
`Web/`) quando o motorista cadastra a placa na página de Perfil — no formato
exato acima, que este firmware consulta.

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
3. Ajuste `VALOR_POR_HORA` em [`Main.ino`](Main.ino) para a tarifa desejada.
4. Compile e envie para o ESP32.

`Credenciais.h` está no `.gitignore` e nunca deve ser commitado.

## Comandos de debug (Serial, 115200 baud)

| Tecla | Ação |
|---|---|
| `A` | Abre a catraca manualmente |
| `S` | Imprime um status completo (WiFi, hora, Firebase, estado das 4 vagas) |

## Limitações conhecidas

- `config.signer.test_mode = true` no Firebase: não há autenticação de
  usuário, então a segurança depende inteiramente das **regras do Firestore**
  no console do Firebase. Para produção real, configure regras restritivas
  (ou migre para autenticação por token de dispositivo).
- O preço é fixo em `VALOR_POR_HORA`; não há suporte a tarifas diferenciadas
  por período ou mensalistas.
- O relógio no cabeçalho e as leituras dos sensores são sequenciais e
  bloqueantes durante chamadas ao Firestore (`getDocument`/`patchDocument`),
  então a tela "Consultando..." pode ficar parada por alguns segundos em
  conexões lentas — é esperado, não é travamento.
