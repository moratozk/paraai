# ParaAí — totem de atendimento

Firmware Arduino para **ESP32 + ILI9341 320 × 240 + touch XPT2046**.
Gabinete previsto em impressão 3D; sem sensores, servo ou catraca física.
Vaga ocupada significa **estadia registrada**, não carro detectado. A maquete
virtual e a evolução do site ficam para a próxima etapa.

## Organização

| Arquivo | Responsabilidade |
|---|---|
| Main.ino | Máquina de estados, eventos de toque, reconexão e manutenção |
| DisplayUI.ino | Tela, calibração, antirrepetição e animação |
| Atendimento.h / Atendimento.cpp | Mensagens e tarefa exclusiva do Firebase |
| LogicaTotem.h | Validação de placa, capacidade, tarifa e cálculo de cobrança |
| ConfiguracaoWiFi.ino | Portal local, teste da rede e persistência |
| Credenciais.example.h | Modelo; Credenciais.h real permanece fora do Git |
| tests/ | Regras no emulador, lógica C++ e interface com periféricos simulados |
| Ferramentas/ | Geração das fontes existentes |

Os módulos .ino têm guardas porque a Arduino IDE também os concatena ao
sketch. Atendimento.cpp é compilado separadamente. tests/host só participa
dos testes no computador, nunca do firmware. Sensores.ino foi removido;
o código anterior continua recuperável no Git.

## Experiência de uso

- Inicial com ENTRADA e SAÍDA, sem contagem de vagas. Identidade âmbar/asfalto.
- Teclado contextual: três letras, um número, escolha antiga/Mercosul e
  caracteres finais. Letras de 31 × 34 px; números de 54 × 42 px.
- Destaque ao tocar, atualização parcial sem redesenhar todo o teclado,
  indicação ENT/SAI, progresso n/7 e confirmação explícita.
- Um toque mantido gera um evento; exige soltura estável para o próximo.
- Apagar/corrigir/cancelar disponíveis. Campos abandonados são limpos após
  60 segundos. Resultados têm CONCLUIR e retornam ao início em 8 segundos.
- Cadastro de placa desconhecida exige confirmação e não define proprietário;
  o motorista pode vinculá-la depois à conta no painel.
- O Firebase roda em outra tarefa, com filas fixas e apenas um atendimento
  pendente. A tela mantém animação, etapa e tempo durante consultas lentas.
- Não há cancelamento de escrita já enviada. Se a resposta se perder após
  o commit, conferir o registro com o responsável antes de repetir.
  O firmware não repete o débito automaticamente.

### Calibração integrada

Na primeira inicialização sem calibração válida, tocar nas quatro miras e no
ponto central de validação. Os limites ficam em Preferences (paraai-ui).
Para refazer: segurar o status superior direito por 3 segundos e escolher
RECALIBRAR TOUCH, enviar C pelo Serial na inicial ou manter o dedo na tela
durante a splash. Uma calibração inconsistente não substitui a anterior.

### Trocar Wi-Fi pelo celular

1. Na inicial, segurar o status superior direito por 3 segundos e escolher
   TROCAR WIFI.
2. Conectar o celular à rede temporária ParaAi-XXXXXX, com a senha exibida na
   tela. Se aparecer aviso de rede sem internet, manter a conexão local.
3. Abrir http://192.168.4.1, selecionar a rede ou informar SSID oculto e senha.
4. O totem testa por até 15 segundos. Só salva a rede se conectar; senha
   errada preserva a anterior. Sucesso reinicia o atendimento.

Sem rede conhecida no boot, o portal abre após 15 segundos, quando estiver na
inicial. Pode ser cancelado e expira em 10 minutos. Serial W é a alternativa
quando o touch precisa de manutenção.

Somente Wi-Fi 2,4 GHz pessoal protegido; não aceita redes abertas, WEP ou
empresariais. Redes com login adicional de hotel/escola não são suportadas.
WPA3 depende do core e do ponto de acesso. SSID/senha ficam em um único blob
validado na NVS (paraai-net). O portal tem token de sessão e só atende o AP;
as credenciais Firebase nunca passam pelo formulário.

A manutenção aguarda a tarefa Firebase ficar ociosa antes de controlar o
rádio. O gesto é acesso físico, **não autenticação de administrador**. A NVS
não é criptografada: proteja o protótipo e revogue dispositivos perdidos.

## Firebase: contrato do totem

Cada equipamento usa uma conta exclusiva (TOTEM_EMAIL / TOTEM_PASSWORD),
autorizada por totems/{uid}, para um único ESTACIONAMENTO_ID.

```
estacionamentos/{id}
  numVagas: 1..200, tarifaHora: 0..10000       # configuração do painel
  ultimaAtualizacao: segundos Unix           # heartbeat a cada 60s
  vagasLivres, vagasEmOperacao, tarifaAplicadaTotem
  modoTotem: "atendimento"

estacionamentos/{id}/vagas/{1..200}
  placa: "ABC1D23" ou ""
  ocupada: true ou false                     # equivale a placa não vazia
  origemOcupacao: "registro"

veiculos/{PLACA}
  ativo, saldo, ownerUid?, ownerNome?, atualizadoEm?
  vagaAtual: 0 ou número da vaga
  horaEntrada: segundos Unix ou 0
  estacionamentoId: id ou ""
  tarifaHoraEntrada: preço congelado ou 0

historico/{PLACA_horaEntrada}
  placa, vaga, entrada, saida, duracaoMinutos, valorCobrado,
  tarifaHora, estacionamentoId
```

Vagas são listadas em páginas de 16 documentos para limitar RAM. Uma vaga
ainda sem documento é criada na primeira entrada. Configuração, placa de
vaga ou associação inconsistente bloqueia a operação afetada. Heartbeat é
uma fotografia periódica, não uma medição física em tempo real.

- **Entrada:** veículo e vaga no mesmo commit; exige ocupação coerente,
  veículo livre, estacionamento autorizado e tarifa igual à configuração.
- **Saída:** débito, vaga livre e recibo exclusivo no mesmo commit. Usa a
  tarifa da entrada, mesmo que o preço do painel seja alterado durante a estadia.
- **Concorrência:** precondições updateTime/exists impedem sobrescrever recarga,
  atribuir a mesma vaga a dois veículos ou recriar recibo da estadia.
- **Cobrança acadêmica:** proporcional aos segundos, arredondada a centavos.
  Pode gerar saldo negativo, como no modelo anterior. Não é pagamento real.
- **Offline:** não confirma nem enfileira operações para cobrar depois.
  Firestore é a fonte das estadias, inclusive após reiniciar o equipamento.
- **Catálogo:** só publica ultimaAtualizacao, vagasLivres e vagasEmOperacao
  no próprio catalogoEstacionamentos/{id}; não muda preço, endereço ou dono.
- Remove leituraValida da vaga na próxima transição. O heartbeat remove
  vagasSuportadasTotem, antigo limite de quatro sensores.

Referência: [operações atômicas no Firestore](https://firebase.google.com/docs/firestore/manage-data/transactions).

## Montagem e configuração

| Ligação mantida | GPIO |
|---|---|
| TFT SCLK / MOSI / MISO / CS | 14 / 13 / 12 / 15 |
| TFT DC / LED | 2 / 21 |
| TFT RST | EN do ESP32 (RST = -1 no código) |
| Touch CS / CLK / DIN / DO | 33 / 25 / 32 / 36 |

Tela e touch usam SPI separado, conforme a fiação existente. Os antigos pinos
de servo/sensores não são configurados nem acionados.

Bibliotecas: Firebase ESP Client, Adafruit GFX, Adafruit ILI9341 e
XPT2046_Touchscreen; instalar pelo Library Manager da Arduino IDE. Neste PC,
../libraries é o cache local, ignorado pelo Git. ESP32Servo não é mais
dependência do firmware; a cópia antiga do cache local foi preservada.

Copiar Credenciais.example.h para Credenciais.h **só se ainda não existir**,
preencher os dados locais e o acesso gerado em Perfil > Segurança do totem.
Nunca sobrescrever um arquivo real com o modelo nem versioná-lo.
Selecionar ESP32 Dev Module, core usado nos testes 3.3.10, partição
**Huge APP (3MB No OTA/1MB SPIFFS)**. Não oferece atualização OTA.

Antes de desenhar o gabinete 3D, medir a placa e o módulo reais. Preservar
acesso USB/reset, suporte do display, espaço dos fios e fixação sem pressionar
o touch. Recalibrar já com a tela fixada. Nenhum STL foi criado nesta etapa.

Serial a 115200: S mostra conexão e memória livre; W abre Wi-Fi; C recalibra.
W/C só na inicial. Não existem comandos de catraca.

## Verificação e instalação controlada

Em Main/tests, com Node 22+, Java 21+ e compilador C++17:

```sh
npm ci
npm test
mkdir -p .runtime
g++ -std=c++17 -Wall -Wextra -Werror logica_totem.test.cpp -o .runtime/logica-test
.runtime/logica-test
g++ -std=c++17 -DARDUINO=100 -Ihost -I../../libraries/Adafruit_GFX_Library ui_totem.test.cpp ../../libraries/Adafruit_GFX_Library/Adafruit_GFX.cpp -o .runtime/ui-test
.runtime/ui-test .runtime/preview
node preview.mjs
```

No Windows, criar .runtime com New-Item, se necessário, e usar a extensão .exe.
Esta revisão usou zig c++ 0.14.1 portátil ([distribuição oficial](https://ziglang.org/download/)).

O emulador só aceita demo-paraai em 127.0.0.1:8180. Testes C++ incluem o código
real da lógica e da interface, não uma reescrita em JavaScript. Geram 13 SVGs
com Adafruit_GFX e fontes reais para inspeção em http://127.0.0.1:4174.
Periféricos são simulados: não valida ruído, pressão, alimentação, SPI, TLS
ou calibração do painel físico.

O workflow firebase-ci.yml baixa Adafruit GFX 1.12.6 do repositório oficial,
fixada no commit ac6d7c3869a693d406f77b9bfcd486b0673169f0, para não depender
do cache deste PC. Executa as três suítes e guarda as telas como artefato em
PRs. Não usa credenciais reais, publica regras ou grava hardware.
Compilação ESP é separada, a partir de Main/:

```sh
arduino-cli compile --fqbn esp32:esp32:esp32:PartitionScheme=huge_app --libraries ../libraries --build-path .codex-build .
```

**Migração exige manutenção autorizada, sem atendimentos durante a troca.**
Regras e firmware devem ser instalados juntos: as regras recusam o firmware
de sensores e operações sem vínculo atômico. Não houve deploy nem gravação
automática nesta revisão. App Check permanece em monitoramento.

Antes de instalar, conferir estadias abertas e associações veículo/vaga.
Registros antigos sem tarifa congelada, vagas duplicadas ou associações
ausentes exigem conferência manual; não resolver apagando dados.
As antigas reservas paraai-res da NVS não são utilizadas nem apagadas.

### Checklist físico pendente

- Calibrar com o display montado; testar bordas, formatos, corrigir/apagar/
  cancelar, dedo mantido e troca entre telas.
- Trocar Wi-Fi pelo celular, senha errada, rede oculta, cancelar, expiração,
  perda de sinal e persistência após reiniciar.
- Entrada/saída sem sensores conectados; reiniciar com estadia aberta e
  verificar que a vaga continua associada.
- Alterar tarifa durante estadia, recarregar durante saída e conferir recibo.
- Perder rede durante confirmação: nunca exibir sucesso sem confirmação.
- Rodar por período prolongado, conferir animação durante TLS, heap no Serial
  e recuperação da conexão. Medir desempenho antes de demonstrar 200 vagas.

## Limites atuais

Não verifica presença física nem passagem de veículos. Sem internet ou hora
válida, não confirma atendimento. A credencial Firebase continua embarcada:
revogação pelo operador e proteção física são necessárias. Sem pagamentos
reais, mensalistas, servidor confiável de cobrança ou maquete virtual.
