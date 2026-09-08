# ParaAí — Firmware do Totem (ESP32)

Firmware para ESP32 de um sistema de estacionamento inteligente com controlo de
acesso por placa, 4 vagas monitoradas por sensor ultrassônico e cobrança
proporcional ao tempo estacionado, sincronizado em tempo real com o Firebase
Firestore. Projeto desenvolvido como Trabalho de Conclusão de Curso (TCC).

## Visão geral

- O motorista escolhe **ENTRADA** ou **SAÍDA** e digita a placa no teclado
  touch. O teclado muda entre letras e números conforme a posição da placa,
  com alvos maiores e escolha explícita entre padrão antigo e Mercosul.
- A calibração do touch acontece no próprio firmware, fica salva na memória do
  ESP32 e pode ser refeita sem gravar outro sketch.
- Na entrada, uma placa desconhecida pode ser cadastrada no próprio totem. Na
  saída, o firmware calcula o tempo, debita o saldo e abre a catraca.
- 4 sensores HC-SR04 monitoram a ocupação física de cada vaga em tempo real e
  mantêm o Firestore atualizado, com filtro anti-ruído (só considera uma
  mudança de estado após 3 leituras consecutivas iguais).
- Se a rede cair, o sistema informa **sem conexão**, não abre a catraca sem
  registro e tenta reconectar sozinho em segundo plano.
- O Wi-Fi pode ser escolhido ou trocado pelo celular em um portal local; a
  nova rede só substitui a anterior depois de passar no teste de conexão.

## Arquitetura do firmware

| Arquivo | Responsabilidade |
|---|---|
| [`Main.ino`](Main.ino) | `setup()`/`loop()`, máquina de estados da tela, conexão WiFi/NTP/Firebase, regras de negócio (entrada/saída/cobrança) |
| [`Sensores.ino`](Sensores.ino) | Leitura dos 4 HC-SR04, filtro, diagnóstico e reservas persistentes na NVS |
| [`DisplayUI.ino`](DisplayUI.ino) | Toda a interface gráfica (ILI9341 + touch XPT2046) |
| [`ConfiguracaoWiFi.ino`](ConfiguracaoWiFi.ino) | Portal local, busca de redes 2,4 GHz, teste e persistência segura da rede escolhida |
| [`Credenciais.h`](Credenciais.example.h) | Rede de contingência + chaves do Firebase (**não vai para o Git** — veja [Configuração](#configuração)) |
| [`tests/`](tests/) | Testes de integração e isolamento no emulador Firestore, sem credenciais reais |

> `Sensores.ino`, `DisplayUI.ino` e `ConfiguracaoWiFi.ino` são incluídos explicitamente no topo do
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

A conexão é gerenciada por `gerenciarConexao()` na tela inicial, com a catraca
fechada. Não há chamadas remotas durante a digitação:

1. Se o WiFi caiu, tenta reconectar a cada 10s.
2. Com WiFi ativo, sincroniza a hora via NTP (necessária tanto para os
   timestamps de cobrança quanto para o handshake TLS do Firebase validar o
   certificado).
3. Com a hora sincronizada, configura o Firebase.

Isso funciona tanto na primeira conexão quanto para se recuperar sozinho de
uma queda de rede no meio da operação.

O SSID e a senha escolhidos no portal ficam em um único registro validado na
NVS (`Preferences`). O firmware desativa a cópia implícita do driver Wi-Fi,
testa a rede candidata por até 15 segundos e só então substitui a configuração
anterior. API key, conta do totem e demais credenciais do Firebase nunca são
mostradas ou alteradas pelo portal.

Se nenhuma rede conhecida conectar na inicialização, o totem abre uma rede
temporária `ParaAi-XXXXXX`, mostra a senha aleatória e o endereço
`192.168.4.1` na tela. Para trocar uma rede que ainda funciona, mantenha o
status de Wi-Fi no canto superior direito pressionado por 3 segundos e escolha
**TROCAR WI-FI**. O portal expira após 10 minutos.

O formulário atende somente a interface da rede temporária, exige um token
por sessão e não registra senhas no Serial. Há opção para rede oculta.
WPA2/WPA3 pessoal são aceitos; redes abertas, WEP e redes empresariais não são.
O acesso à manutenção pressupõe controle físico do equipamento: o gesto não
é uma autenticação de administrador. NVS com checksum não é armazenamento
criptografado; proteja fisicamente o protótipo e revogue equipamentos perdidos.

### Touch e digitação da placa

Na primeira inicialização sem calibração válida, quatro miras aparecem na tela.
O firmware coleta várias amostras, valida um toque central e salva os limites
do painel na NVS. Um toque mantido gera apenas um evento e precisa ser solto
antes do próximo, evitando repetição e o vazamento de ENTRADA/SAÍDA para o
teclado.

O teclado segue o formato brasileiro por construção:

1. três letras;
2. um número;
3. escolha entre placa antiga (`ABC-1234`) e Mercosul (`ABC-1D23`);
4. caracteres finais compatíveis com o formato escolhido;
5. confirmação da placa completa.

A calibração pode ser refeita na central escondida no status de Wi-Fi ou pelo
comando serial `C`. Manter o touch pressionado durante a abertura do sistema
também oferece uma rota de recuperação caso uma calibração salva fique ruim.
Formulários abandonados voltam ao início e limpam a placa após 60 segundos.

### Reserva lógica de vaga

Sem isso, dois carros dando entrada em sequência rápida (antes do primeiro
carro ser fisicamente detectado pelo sensor) podiam ser designados para a
**mesma vaga**. Ao encontrar uma vaga livre na entrada, ela é reservada
imediatamente (`reservarVaga`); a reserva:

- é gravada na NVS antes do registro remoto e sobrevive a reinicializações;
- permanece mesmo se o sensor ficar livre ou passar o prazo de 2 minutos
  (esse prazo gera somente um aviso no Serial);
- só é liberada após saída confirmada ou reconciliação com o Firestore;
- é recuperada das associações remotas no início, incluindo versões antigas.

Memória inválida, associação contraditória ou erro de comunicação bloqueiam
novas entradas. Um sensor com três falhas seguidas fica indisponível até três
leituras válidas e coerentes. A vaga vazia precisa gerar eco entre 31 e 400 cm:
ausência de eco não prova que está livre. O painel existente recebe
`ocupada: true` quando não há leitura; o campo adicional `leituraValida: false`
identifica a causa no banco, sem mudar o contrato booleano do site.

### Operações atômicas no Firestore

Abrir a catraca só acontece **depois** de confirmar que a escrita que
registra a entrada/saída no Firestore teve sucesso — evita liberar o carro
sem nenhum registro da cobrança no banco.

- Entrada: veículo e placa da vaga no mesmo `commit`.
- Saída: débito, limpeza da placa da vaga e histórico no mesmo `commit`.
- Precondições `updateTime` impedem sobrescrever recargas ou outra operação
  ocorrida após a leitura. Conflitos pedem uma nova tentativa, que relê tudo.
- O recibo usa `PLACA_horaEntrada` e exige documento inexistente. Repetições
  não criam outro histórico nem cobram novamente a mesma estadia.
- As regras também exigem recibo junto ao débito e validam duração, valor,
  tarifa congelada e vaga liberada, mesmo se outro cliente tentar escrever.
- A cobrança é proporcional aos segundos, arredondada a centavos, e usa
  somente a tarifa congelada na entrada. Horário/tarifa inválidos exigem
  atendimento, não geram uma saída gratuita por suposição.
- Se a resposta de rede se perder depois do commit, o estado é incerto: o
  firmware não abre a catraca automaticamente. O responsável deve conferir o
  registro e a passagem física antes de qualquer liberação manual.
- Durante os 5 segundos de abertura não há chamadas remotas nem leitura de
  sensores. O comando Serial `A` foi removido para evitar abertura acidental.

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
  ocupada: boolean         -- ocupada OU sem leitura confiável
  leituraValida: boolean   -- diagnóstico; false bloqueia nova atribuição
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

catalogoEstacionamentos/{ESTACIONAMENTO_ID}
  ultimaAtualizacao, vagasLivres, vagasEmOperacao -- só estes campos pelo totem

historico/{placa}_{horaEntrada}
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
2. Edite `Credenciais.h` com um SSID/senha 2,4 GHz de contingência e as chaves
   do seu projeto Firebase (API Key, Project ID, Database URL). Depois da
   gravação, o Wi-Fi pode ser trocado pelo portal local sem recompilar.
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
| `S` | Imprime um status completo (WiFi, hora, Firebase, estado das 4 vagas) |
| `W` | Abre o portal local para escolher ou trocar o Wi-Fi |
| `C` | Refaz a calibração guiada do touch |

`W` e `C` só funcionam na tela inicial e com a catraca fechada.

## Verificação e instalação controlada

Em `Main/tests`, com Node.js 22+ e Java 21+ no PATH:

```powershell
npm ci
npm test
```

O comando sobe e encerra o emulador em `127.0.0.1:8180`, usa exclusivamente
`demo-paraai` e recusa outro host. Valida isolamento entre contas/pátios,
revogação do totem, heartbeat, sensores, cadastro, recarga concorrente e
atomicidade dos registros. Não lê `Credenciais.h` nem `Web/.env`.
O workflow `../.github/workflows/firebase-ci.yml` executa essa mesma suíte
nos pull requests que alterem ESP/Firebase, sem credenciais de produção.

Compilação, a partir de `Main/`:

```powershell
arduino-cli compile --fqbn esp32:esp32:esp32:PartitionScheme=huge_app --libraries ../libraries --build-path .codex-build .
```

As regras em `../firestore.rules` acompanham este firmware, mas **não foram
publicadas automaticamente**. Após revisão e autorização: publicar as regras
antes de gravar o novo firmware, em uma janela de manutenção. Conferir no
banco as estadias abertas e a associação `vagas/{n}.placa`; registros antigos
sem tarifa congelada ou com associação ausente exigem conferência manual.
Não apagar a NVS para resolver erros de reserva com estadias abertas.
**Durante essa janela, interromper entradas e saídas:** as novas regras
recusam o débito isolado do firmware anterior. Não deixá-lo em atendimento
após publicar as regras e antes de atualizar a placa.

Checklist no hardware, ainda pendente nesta revisão:

- Calibrar os cinco pontos; digitar `ABC1234` e `ABC1D23`, apagar, cancelar,
  manter o dedo numa tecla e confirmar que não há repetição.
- Trocar Wi-Fi pelo celular; testar senha errada, cancelar, rede oculta,
  perda da rede, expiração do portal e persistência após reiniciar.
- Fazer duas entradas seguidas antes de o primeiro carro ocupar a vaga;
  reiniciar com estadia aberta; confirmar que a vaga não é reaproveitada.
- Desconectar um sensor: a vaga deve ficar indisponível, não livre.
- Fazer entrada/saída completa; alterar a tarifa no painel durante a estadia,
  recarregar durante a saída e conferir débito, recibo e catraca.
- Simular queda de rede na confirmação: sem confirmação, sem abertura.

## Limitações conhecidas

- A credencial do dispositivo fica gravada no firmware. Se um equipamento for
  perdido ou substituído, bloqueie-o em **Perfil > Segurança do totem** e gere
  outra credencial antes de instalar o novo.
- A tarifa por hora é sincronizada com o painel e congelada na entrada. Ainda
  não há faixas por período, convênios ou mensalistas.
- O ESP32 conecta somente a redes **2,4 GHz protegidas por senha**. Redes 5 GHz
  e redes abertas não aparecem no portal.
- A calibração e o portal foram compilados sem o ESP conectado; orientação,
  precisão e abertura automática do portal no celular ainda precisam ser
  confirmadas no hardware real.
- As chamadas do Firebase ainda são síncronas (`getDocument`/`commitDocument`),
  então a tela "Consultando..." pode ficar parada por alguns segundos em
  conexões lentas. Os sensores são escalonados para não somar seus quatro
  timeouts ao atraso normal do touch.
- A catraca é um servo temporizado de demonstração. Não há sensor de passagem
  ou proteção antiesmagamento: isto não é um controlador certificado para
  barreira veicular real.
- O simulador antigo em `Web/public/totem.html` não foi atualizado: o site
  ficou fora desta entrega e ele ainda mostra o teclado anterior.
