# Estado do projeto

Arquivo de retomada: quem abrir isto (pessoa ou assistente) entende onde a
coisa parou sem precisar reler o histórico. Atualizado em **02/10/2026**.

---

## O que é

Sistema acadêmico de atendimento para estacionamentos:

- **`firmware/`** — firmware do totem na placa CYD de 2,8" (ESP32-2432S028R:
  ESP32 + tela ILI9341 320×240 + touch XPT2046), sem sensores ou servo/catraca
  física; gabinete 3D ainda a projetar
- **`web/`** — painel React/Vite, com Firebase Auth e Firestore
- **`firebase/`** — regras do Firestore e testes no emulador

O motorista registra entrada/saída por placa. O Firebase associa vaga,
estadia e cobrança simulada. O operador acompanha pelo painel. A ocupação é
lógica; a maquete virtual online é uma etapa futura, não implementada.

Projeto acadêmico (TCC). A `main` tem a versão integrada (PR #9, unida em
02/10/2026). Revisão atual: `claude/organiza-pastas` (reorganização de pastas), feita
sobre `claude/firmware-cyd` (placa CYD).

## Reorganização de pastas (02/10/2026)

As pastas ganharam nomes padrão de mercado, que dizem o que cada parte é.
Código não mudou além de caminhos (includes dos testes, CI e `firebase.json`).
As seções mais antigas citam os nomes anteriores; use esta tabela:

| Antes | Agora |
|---|---|
| `Main/` (sketch) | `firmware/totem/` |
| `Main/Main.ino` | `firmware/totem/totem.ino` |
| `Main/README.md` | `firmware/README.md` |
| `Main/tests/` (C++ e prévia das telas) | `firmware/test/` |
| `Main/tests/` (regras no emulador) | `firebase/test/` |
| `CalibracaoTouch/` | `firmware/touch-calibration/` |
| `Ferramentas/` | `firmware/tools/` |
| `firestore.rules`, `firebase.test.json` | `firebase/` |
| `Web/` | `web/` |
| `Marca/` | `docs/brand/` |
| `COLABORACAO.md` | `CONTRIBUTING.md` |
| `firebase-ci.yml` | `firmware.yml` e `firebase.yml` |
| `web-ci.yml` | `web.yml` (o job "Lint e build" manteve o nome) |

Os segredos locais passaram a ser ignorados pelo `.gitignore` da raiz em
qualquer pasta (`Credenciais.h`, `.env`). Quem já tinha o projeto clonado
precisa mover `Main/Credenciais.h` e conferir a pasta `web/` (ver
`CONTRIBUTING.md`).

## Placa CYD de 2,8" (02/10/2026)

O totem passou a usar a placa **ESP32-2432S028R ("CYD")**, que já traz a tela
ILI9341 320×240 e o touch XPT2046 ligados. Os pinos da tela são os mesmos da
montagem anterior; no touch, o T_OUT (MISO) fica no GPIO39 (antes 36, que na
CYD é o T_IRQ e não é usado). Firmware e `firmware/touch-calibration/` ajustados; o
assistente de calibração mede o painel novo no primeiro boot.
**Ainda não testado na placa.**

## Integração de 02/10/2026 — versão única (PR #9)

O site publicado (paraai.web.app) era o PR #4 do Lucas, nunca unido à `main`;
o totem (PR #7), a responsividade (PR #6) e a correção da logo (PR #8) partiam
da `main`. O PR #9 junta tudo, com estas decisões do responsável:

- **Base: versão do Lucas.** Administração central, cadastro público só de
  motoristas (contas administrativas provisionadas fora do cliente), mapa
  público e vagas especiais (PCD, 60+, gestante).
- **Reserva no app, totem decide.** Reservar é gratuito e vale 30 minutos
  (`reservas/{uid}` + `reservadaAte` na vaga pública). Na entrada, o totem usa
  a vaga reservada; sem reserva, escolhe a primeira vaga comum livre. Vagas
  especiais só por reserva. A cobrança é uma só: no totem, da entrada à saída,
  pela tarifa por hora. Sai a estadia cobrada pelo app (`estadiasApp`, pagar
  agora/depois, tarifa por minuto); registros antigos ficam no histórico.
- **Ocupação só pelo totem.** A marcação manual de vagas saiu (deixava vaga e
  estadia incoerentes). O mapa do operador virou só leitura; o mapa público é
  espelhado pelo totem na entrada e na saída.
- **Design** revisado com as diretrizes da Apple (skill `apple-design`),
  mantendo âmbar/asfalto, logo e Anton: contraste AA nos dois temas,
  tipografia por tamanho, nada abaixo de 12 px, hover só com mouse, resposta no
  toque, alvo de 44 px, modais e menu com movimento ancorado, mola sem rebote,
  transparência reduzida e contraste aumentado.
- **Verificação:** 49 testes de regras e as suítes C++ no CI; firmware
  compilado (1.403.508 bytes no CI, 44%); site com lint e build; telas
  conferidas num ambiente local de dados simulados (temas e 375 px).
  **Nada testado no hardware nem publicado.**

### Antes de publicar a versão integrada

1. Regras, firmware e site juntos, em janela de manutenção (as regras novas
   recusam o firmware e o site antigos).
2. Limpar pelo console os dados da versão anterior que as regras não deixam
   o site nem o totem corrigirem: `veiculos` com `vagaAtual` diferente de 0
   (estadia de teste aberta), vagas em `estacionamentos/{id}/vagas` com
   `placa` preenchida (sobra da marcação manual; trava a vaga) e `historico`
   com `status: ativa` (estadia pelo app que nunca terminou; o site mostra
   "Em andamento"). O resto (`estadiasApp`, `reservada` nas vagas públicas,
   `tarifaMinuto`) a versão nova ignora.
3. Publicar o mapa de cada estacionamento pelo painel (grava o tipo de cada
   vaga, que o totem lê) e conferir as vagas especiais.
4. ~~Fechar os PRs #3 a #8~~ — feito em 02/10/2026: #4, #6, #7 e #8 foram
   unidos junto com o #9; #3 e #5 fechados como substituídos.

## Revisão de 30/09 a 02/10/2026 — segurança, pendência e robustez

Feita sobre o PR #7 a partir de uma revisão de código; cada parte é um commit.

- **Regras:** `horaEntrada` e `saida` só valem entre −5 min e +1 min de
  `request.time` (antes, uma credencial de totem abria estadia retroativa e
  debitava anos de tarifa de outra conta). Dono só apaga vaga livre. Entrada
  exige saldo > −0,005. Recibo ganhou `valorPendente`, conferido contra o saldo
  final sem somar dívida antiga. `ownerNome` deixou de ser exigido.
- **Saldo pendente:** sem catraca, a saída é sempre registrada. Se o saldo não
  cobre, o totem mostra SAIDA COM PENDENCIA (sem exibir o saldo), o recibo
  guarda a parte não coberta e uma nova entrada fica bloqueada até a recarga.
  O auto-cadastro (saldo 0) continua entrando. Painel separa recebido de a
  receber, marca recibos pendentes e exporta `valor_pendente` no CSV.
- **Manutenção com PIN:** `MANUTENCAO_PIN` (4 a 8 dígitos) é obrigatório em
  `Credenciais.h`; sem ele a compilação para com mensagem clara. Cinco erros
  bloqueiam por 5 min. Serial W/C e a primeira instalação dispensam o PIN.
- **Portal automático** só abre sem nenhuma rede configurada. Antes, toda queda
  de energia deixava o totem até 10 min no portal, com a senha na tela.
- **TLS:** Firestore valida certificado com as raízes GTS R1/R3/R4
  (`Main/RaizesGoogle.h`, até 2036; conferidas com openssl e no CI).
  Limitação conhecida da Firebase-ESP-Client 4.4.17: login e renovação do token
  ignoram `config.cert`; por isso a troca de rede ficou atrás do PIN.
  `PARAAI_TLS_SEM_VERIFICACAO` desliga a verificação só para diagnóstico.
- **Falhas:** telas distinguem rede, recusa e configuração; recusa ou versão
  vencida (recarga no mesmo instante) é repetida uma vez relendo tudo; rede
  nunca é repetida. Cabeçalho mostra CONECTANDO ou VERIFICAR PAINEL. Uma vaga
  com documento fora do padrão não derruba mais o pátio inteiro.
- **Textos do totem:** 7 títulos passavam de 304 px e saíam cortados; `|` não
  existe nas fontes (ASCII 0x20–0x7A) e nunca aparecia. O teste da interface
  agora reprova texto largo ou fora da fonte.
- **Site:** textos de sensores removidos; o nome do dono não vai mais para o
  veículo (todo totem lê esse documento) e o nome legado é apagado na recarga;
  saldo baixo volta a ficar vermelho (classe `perigo` inexistente → `danger`).
- **CI:** novo job compila o firmware com o modelo de credenciais e versões
  fixadas (core 3.3.10, Firebase 4.4.17, ILI9341 1.6.3, GFX 1.12.6, BusIO
  1.17.4, XPT2046 1.4) e confere se `RaizesGoogle.h` valida o Firestore.
- **Verificação:** testes de regras e as duas suítes C++ aprovados no CI;
  firmware compilado localmente (ESP32 Dev Module/Huge APP, 1.398.824 bytes,
  44%; RAM global 53.448 bytes); site com lint e build aprovados.
  **Não testado no hardware.** Telas logadas do site não foram conferidas
  visualmente (exigem login real no Firebase).
- **Nada publicado no Firebase e nada gravado no ESP32.**

### Decisões abertas desta revisão

- ~~PR #3 (`atualizarVagaManual`)~~: resolvido na integração — ocupação só
  pelo totem; o mapa do operador é só leitura.
- Qualquer pessoa digita a placa de outra e abre estadia no nome dela (placa é
  pública). Hoje é limitação declarada; ideia: aviso no app a cada entrada e
  saída, com "não fui eu".
- Totens leem `estacionamentoId`/`horaEntrada` de qualquer veículo (custo da
  carteira global): dá para saber onde uma placa está estacionada.
- Rede institucional (WPA2-Enterprise ou login no navegador) não é suportada;
  na apresentação, usar hotspot do celular.
- Fechar o PR #5 ao unir o #7 (agora: fechar #3 a #8 ao unir o #9).

## Revisão de 09/09/2026 — totem sem sensores

- Mudança de produto aprovada pelos autores: ESP somente para atendimento,
  em gabinete impresso em 3D. Não implementar a maquete nem mudar Web nesta etapa.
- Branch criada de origin/main `78199b9`, recuperando por cherry-pick as
  melhorias de touch/Wi-Fi/testes da proposta anterior (#5), ainda não unida.
  Nenhum stash de trabalho anterior foi aplicado ou apagado.
- Sensores.ino removido; sem ESP32Servo, leitura de GPIO de vagas ou comandos
  de catraca. Biblioteca antiga preservada; histórico do código disponível no Git.
- Atendimento.cpp concentra Firebase em uma tarefa FreeRTOS exclusiva; Main
  mantém tela/touch ativos. Filas fixas, uma operação por vez, mensagens sem
  ponteiros compartilhados e manutenção protegida por exclusão mútua.
- Tela inicial aparece antes de esperar Wi-Fi. Cabeçalho distingue conexão,
  ajuste de hora e autenticação. Animação/etapa/tempo durante consulta; tecla
  destacada e atualização parcial, ENT/SAI e progresso n/7. Resultado tem
  CONCLUIR, retorno automático e placa limpa. Identidade preservada.
- Calibração persistente e portal Wi-Fi pelo celular mantidos. Troca de rede
  espera Firebase ficar ocioso, testa antes de salvar e reinicia no sucesso.
- Ocupação baseada na placa associada à vaga, sem fingir presença física.
  Capacidade 1..200 acompanha o limite já existente no painel; consulta paginada
  de 16 documentos limita a RAM. Sem limitação artificial a quatro sensores.
- Entrada exige veículo + vaga atômicos e preço igual à configuração; saída
  exige débito + vaga + recibo exclusivo. Precondições de revisão protegem
  recarga concorrente e disputa de vaga. Tarifa da entrada permanece congelada.
- Campos novos: modoTotem=atendimento no documento operacional e
  origemOcupacao=registro na vaga. ocupada continua booleano para o site.
  leituraValida é removido na transição; heartbeat remove vagasSuportadasTotem.
- Firestore é a fonte das estadias. NVS só é usada para Wi-Fi/calibração;
  antigas reservas paraai-res não são lidas nem apagadas. Sem confirmação
  offline ou repetição automática de escrita com resultado incerto.
- **31 testes Firestore aprovados**, incluindo criação de vaga inexistente,
  capacidade 200, paginação, migração de campos e rejeição de ocupação isolada.
- Testes C++ da lógica e da interface real aprovados no computador. Harness
  compila DisplayUI.ino com Adafruit_GFX/fontes reais e periféricos simulados;
  verifica antirrepetição, transição de tela, confirmação, animação e mapeamento.
  Gera 13 frames SVG; inspeção visual realizada pelo navegador local.
- CI executa testes Firestore + C++ e guarda frames para revisão. Adafruit GFX
  1.12.6 é baixada do commit oficial fixado, sem depender do cache local ignorado.
- Revalidação de 17/09/2026: 31 testes Firestore e as duas suítes C++ aprovados.
  Compilação final ESP32 Dev Module/Huge APP, core 3.3.10, aprovada:
  **1.390.844 bytes (44%) de programa; 53.440 bytes (16%) de RAM global**.
- Código enviado em codex/totem-atendimento; revisão no [PR #7](https://github.com/moratozk/paraai/pull/7),
  em rascunho, sem merge. Substitui a proposta com sensores do PR #5, que foi
  preservado aberto para decisão dos autores; não unir as duas independentemente.
- **Nada publicado no Firebase e nada gravado no ESP32.** Sem hardware
  conectado: calibração, responsividade sob TLS e montagem física pendentes.
  App Check continua em monitoramento. Ver checklist em Main/README.md.

### Implantação e próxima etapa

Autorizar e agendar regras + firmware juntos, interrompendo atendimento na
troca. O firmware de sensores não é compatível com as novas regras, e o
firmware anterior a 02/10 também não (recibo sem `valorPendente`). Antes de
gravar, incluir `MANUTENCAO_PIN` no `Credenciais.h`. Conferir
estadias abertas, tarifa congelada e vínculos veículo/vaga antes de instalar;
não apagar dados para resolver inconsistências. Calibrar com o display montado.

Depois da validação do totem: evoluir o site e criar a maquete virtual para
visualizar os registros, sem redefinir cobrança nem simular sensores como
dados reais. Web/public/totem.html permanece legado, fora desta entrega; os
textos de sensores do site foram removidos em 02/10/2026.

---

## Histórico de 08/09/2026 — proposta anterior com sensores (superada)

- Site preservado. Alterações anteriores desta sessão em `Web/` foram
  guardadas no stash `backup-web-fora-escopo-20260908`, sem entrar na entrega.
- Teclado contextual com letras/números separados, escolha antiga/Mercosul,
  confirmação final, antirrepetição e limpeza após 60s sem interação.
- Calibração guiada de cinco pontos no firmware, salva em `Preferences`.
  Recalibrar pelo status superior direito (3s), Serial `C` ou segurar a tela
  no início. Não precisa mais trocar de sketch e copiar limites manualmente.
- Novo módulo `Main/ConfiguracaoWiFi.ino`: portal temporário WPA2 pelo celular,
  seleção de rede/SSID oculto, token de formulário, acesso só pelo AP local,
  teste de conexão antes de salvar e encerramento em 10 minutos. Serial `W`
  oferece acesso quando o touch precisa de manutenção.
- Reservas persistem na NVS e são reconciliadas com veículo/vaga no Firestore.
  Reinicialização, sensor livre e prazo de 2 minutos não encerram estadias.
  Erro de memória ou estado contraditório bloqueia novas entradas.
- Sensores lidos individualmente; falhas não são interpretadas como vaga
  livre. `leituraValida` é diagnóstico adicional; `ocupada` continua booleano
  para compatibilidade com o site e fica `true` quando o sensor está inválido.
- Entrada atômica (veículo + vaga) e saída atômica (débito + vaga + recibo),
  com precondições de revisão. Recibo `PLACA_horaEntrada`, exclusivo por estadia.
- Regras exigem recibo junto ao débito, validam tarifa congelada, duração,
  cobrança e liberação da vaga. Totem só altera disponibilidade no próprio
  catálogo; não pode criar vitrine, mudar cadastro/preço ou operar outro pátio.
- NTP não bloqueia o loop. I/O remoto não roda durante digitação ou abertura
  da catraca; abertura manual pelo Serial `A` foi removida.
- **21 testes passaram** no emulador local `demo-paraai`, incluindo isolamento,
  revogação, atomicidade, adulteração, recarga concorrente e disputa de vaga.
  Rodar: `cd Main/tests`, `npm ci`, `npm test` (Node 22+ e Java 21+).
  O workflow `firebase-ci.yml` repete a suíte em PRs que alterem ESP/Firebase;
  não usa secrets, não faz deploy e não substitui a compilação/hardware local.
- Compilação para ESP32 Dev Module/Huge APP aprovada; validação física ainda
  pendente. A inspeção visual automatizada do portal não pôde ser executada
  porque a ferramenta de navegador não inicializou.
- **Nada publicado no Firebase e nada gravado no ESP32 nesta revisão.**
  App Check continua em monitoramento. A gravação física de agosto abaixo
  corresponde à versão anterior, não a esta revisão.

### Instalação e limitações desta revisão

As novas regras recusam o débito isolado do firmware antigo. Implantar regras
e firmware juntos em janela de manutenção, somente após autorização. Antes,
conferir as estadias abertas: precisam de tarifa congelada e associação
coerente entre `veiculos/{placa}` e `vagas/{n}.placa`. Inconsistências antigas
exigem conferência do responsável; não apagar reservas/NVS como atalho.

O portal usa HTTP dentro do AP protegido e pressupõe controle físico do
equipamento; o gesto de manutenção não autentica um administrador. Não há
flash criptografada nem proteção antiesmagamento no servo de demonstração.
Não apresentar o protótipo como controlador certificado de barreira real.

O simulador `Web/public/totem.html` permaneceu sem alterações e ainda reflete
o teclado antigo. O checklist físico completo está em `Main/README.md`.

---

## Como rodar

### Site

```bash
cd web
cp .env.example .env      # e preencha com os valores do Firebase
npm install
npm run dev               # http://localhost:5173
```

Sem o `.env` o site abre mas login e dados não funcionam — ele não está no
Git de propósito.

Existe um simulador **legado** em `/totem.html`, com teclado antigo. Para
inspecionar o firmware atual, usar firmware/test/ui_totem.test.cpp e preview.mjs,
conforme firmware/README.md. Nenhum deles é a futura maquete virtual.

### Firmware

```bash
cp firmware/totem/Credenciais.example.h firmware/totem/Credenciais.h   # e preencha
```

Inclui `MANUTENCAO_PIN` (PIN das configurações do totem). O Wi-Fi pode ficar
em branco: sem rede alguma, o totem abre a configuração na própria tela.

Precisa de Wi-Fi **2,4 GHz** — o ESP32 não enxerga 5 GHz. Abrir `firmware/totem/totem.ino`
na Arduino IDE e gravar.

---

## Histórico do que já estava pronto antes da revisão atual

**Totem**
- Tela inicial com dois botões: ENTRADA e SAÍDA (não mostra mais contagem de vagas)
- Recusa operação incoerente em vez de abrir a catraca por engano
  ("entrada já registrada", "sem entrada aberta", "placa não encontrada")
- Autocadastro de placa na entrada, sem gravar `ownerUid` — assim o motorista
  consegue reivindicar a placa depois pelo app
- Cobrança de `horaEntrada` (instante em que a catraca abre) até a saída
- Tarifa sincronizada com o painel e congelada no instante da entrada
- Fontes próprias geradas de Bahnschrift (`Ferramentas/gerar_fonte.py`)
- Reserva de vaga fecha a corrida de duas placas digitadas em sequência rápida
- Autenticação por dispositivo: cada ESP usa conta própria e pode ser bloqueado
  no painel sem expor as coleções do Firestore publicamente
- Firmware compilado com sucesso para `ESP32 Dev Module`, core 3.3.10 e partição
  **Huge APP**: 1.322.863 bytes (42% de 3 MB), RAM global em 16%
- Firmware autenticado gravado no ESP32-D0WD-V3 pela COM3; token Firebase
  chegou a `ready` e o heartbeat real confirmou 4 sensores e tarifa de R$ 8,50

**Painel**
- Painel administrativo central para cadastrar, editar, publicar e ocultar
  estacionamentos de toda a rede, com resumo de locais e capacidade
- Cada cartão do painel administrativo abre uma central de monitoramento
  dedicada. A tela combina sensores e reservas do aplicativo em tempo real,
  diferencia vagas livres, ocupadas e reservadas, permite filtrar por estado
  ou placa e mostra tempo e valor acumulado de estadias ativas para o guarda.
  O mapa pode ocupar a tela inteira, com saída pelo botão ou pela tecla Esc
- O administrador pode reclassificar cada vaga como comum, PCD, 60+ ou
  gestante. A escolha é persistida nos mapas operacional e público; as vagas
  especiais usam fundos azul, roxo e rosa, não apenas contornos, e os números
  usam uma tipografia mais leve para facilitar a leitura à distância
- Faturamento por período, ocupação vaga a vaga, histórico de acessos
- Mapa visual e interativo do pátio em tempo real, com corredor, entrada,
  saída e vagas reservadas para PCD, idosos e gestantes
- Controle manual seguro para ocupar, identificar por placa e liberar vagas
  durante a apresentação mesmo sem os sensores físicos ligados
- Atalho “Preparar demo FATEC” preenche o nome Estacionamento FATEC e 20 vagas
- Status do totem em três estados: nunca conectou / offline / online
- Aviso de "mais vagas do que sensores" removido em 02/10/2026 (sem sensores)
- Tarifa e número de vagas editáveis
- Cadastro faz rollback da conta do Authentication se o perfil falhar
- Rotas carregadas sob demanda e Firebase separado no build
- Perfil do operador gera e revoga credenciais exclusivas de totem

**Site**
- Home com fotos que acompanham a rolagem, sem dependência de animação
- Cadastro público de motorista e acesso separado para administradores
- Layout responsivo revisado para celulares: navegação e modais roláveis,
  formulários e ações sem compressão, cartões reorganizados e tabelas exibidas
  como blocos legíveis em telas estreitas
- Recuperação e redefinição de senha
- Recarga de saldo (PIX/cartão simulados)
- Tema claro e escuro, ambos com contraste conferido em WCAG AA
- Papel da conta é definitivo: motorista não pode cadastrar estacionamento e
  operador não usa o fluxo de motorista; as regras do Firestore reforçam isso
- A antiga opção pública “Tenho um estacionamento” foi substituída pelo acesso
  administrativo. Contas `admin` são promovidas de forma controlada fora do
  cliente web
- Marketplace do motorista em `/estacionamentos`, com busca, filtros, tarifa,
  disponibilidade e rota; usa `catalogoEstacionamentos` para não expor dados
  operacionais ou credenciais dos pátios
- O mapa público abre um checkout depois da escolha da vaga. Na FATEC, a
  tarifa demonstrativa é R$ 0,22 por minuto iniciado; o motorista pode
  antecipar o primeiro minuto ou deixar o débito completo para o encerramento
- Estadias iniciadas pelo aplicativo aparecem no painel do motorista com
  cronômetro e total crescente, reservam a vaga escolhida e descontam o valor
  final da carteira simulada ao encerrar
- A compra da vaga cria imediatamente uma movimentação em `historico`, por
  isso aparece em “Meus acessos” ainda em andamento. O horário de entrada
  persistido alimenta o temporizador mesmo se a página for fechada; a tela
  separa total acumulado, valor já descontado e saldo ainda a pagar
- “Meus acessos” mantém a lista completa, identifica compras pelo aplicativo
  e entradas pelo totem, permite filtrar as duas origens e mostra local, forma
  de pagamento, situação, duração e total de cada utilização. A última estadia
  criada antes desse histórico dedicado também é recuperada como legado

---

## O que falta

1. **Validar o touch no novo firmware** — a calibração agora é integrada e
   persistente. Após autorização para gravar, completar cinco pontos e testar
   os dois formatos de placa, confirmação, correção, toque mantido e o PIN.
   Confirmar no Serial que o Firestore conecta com o certificado validado.

2. **Testar o fluxo completo do novo totem no hardware** — entrada/saída,
   reinicialização com estadia aberta, troca/perda de Wi-Fi, responsividade
   durante Firebase, calibração com gabinete e estabilidade prolongada.
   As validações físicas anteriores referem-se ao firmware antigo.

3. **Configurar a recuperação de senha no Firebase** — em Authentication >
   Templates > Redefinição de senha, apontar a URL da ação para
   `https://SEU_DOMINIO/redefinir-senha` e autorizar esse domínio. Sem essa
   etapa, o Firebase abre a página padrão dele em vez da tela do ParaAí.

4. Pagamento é simulado — não há gateway real.

5. Projetar o gabinete 3D pelas medidas reais; depois evoluir o site e criar
   a maquete virtual, sem reintroduzir sensores/catraca no ESP.

---

## Decisões já tomadas (não refazer sem motivo)

**Identidade é âmbar sobre asfalto.** Houve uma tentativa de mudar para
verde-oliva/terracota com tipografia serifada; foi descartada pelo dono do
projeto, que preferiu voltar ao original. Não sugerir de novo.

**A logo é um arquivo, não código.** `web/public/logo.png`. Já se tentou
redesenhá-la em SVG por aproximação e o resultado nunca bateu. Para trocar,
substitua o arquivo. A única exceção é a tela do totem, onde não dá para
carregar PNG e a marca é reconstruída com retângulos e círculos.

**Reserva no app, totem decide (02/10/2026).** O app só reserva (grátis, 30
min). Quem registra a estadia e cobra é o totem. Não reintroduzir cobrança
pelo app nem marcação manual de vagas.

**Design segue as diretrizes da Apple dentro da identidade.** Contraste AA nos
dois temas, texto mínimo de 12 px, hover só em `@media (hover: hover)`,
resposta no `:active`, animação só em `transform`/`opacity`. Ao criar um
componente, usar os tokens de `index.css` (`--esp-*`, `--dur-*`,
`--mola-critica`, `--rotulo-*`).

**A inicial do totem não mostra contagem de vagas.** Só ENTRADA/SAÍDA. A
confirmação informa a vaga atribuída. Desde 09/09 não há sensores nem
atuadores; o painel recebe a ocupação lógica dos registros no Firebase.

**Textos do site sem jargão.** Nada de "ESP32", "Firestore", "ultrassônico" —
quem entra quer estacionar, não conhecer o hardware.

**Modo claro não usa branco puro.** Cansa a vista. A base é um cinza
levemente quente; o contraste vem da hierarquia, não do brilho.

**Motorista e administrador são contas separadas.** O cadastro público cria
somente motoristas. Administradores usam `users/{uid}.role = "admin"`, são
promovidos apenas pelo Firebase Console/Admin SDK e gerenciam a rede inteira.
Contas `operador` antigas continuam funcionando para não quebrar instalações,
mas não são mais oferecidas no cadastro público. Não permitir autopromoção de
papel no cliente.

**O marketplace usa uma projeção pública autenticada.** Motoristas leem
`catalogoEstacionamentos`, nunca o documento operacional completo. Novos
estacionamentos criam a vitrine junto com o cadastro; os antigos são migrados
quando o operador abre o painel. Sem leitura recente, a tela mostra “Sem
leitura” em vez de inventar vagas disponíveis.

**O mapa manual é uma contingência do operador.** Ele grava o mesmo documento
`estacionamentos/{id}/vagas/{numero}` usado pelo totem e chega aos painéis por
`onSnapshot`. Se os sensores estiverem ligados, a leitura física continua
podendo atualizar esses documentos. As novas regras precisam ser publicadas
depois que a alteração entrar em `main`.

Quando o mapa manual está ativo, sua contagem de vagas livres também é
publicada em `catalogoEstacionamentos`. Ela usa campos próprios, separados do
heartbeat dos sensores, para que as 20 vagas mapeadas da FATEC continuem
visíveis ao motorista e cada ocupação/liberação manual atualize a vitrine.
O catálogo também recebe uma subcoleção `vagas` somente com o estado
livre/ocupada/reservada e o tipo da vaga, sem placas. Tipos explícitos definidos
pelo administrador prevalecem sobre a distribuição padrão da FATEC. Assim,
motoristas podem abrir uma
sobreposição dedicada do mapa da FATEC, escolher visualmente uma das 20
posições e iniciar uma estadia pelo aplicativo. O documento
`estadiasApp/{uid}` mantém no máximo uma estadia ativa por conta, sem reutilizar
os campos de entrada física do totem. Enquanto ela está ativa, a mesma placa
não pode abrir outra entrada no equipamento. Cada nova estadia também cria um
documento próprio em `historico`, que muda de `ativa` para `finalizada` no
encerramento e não é perdido quando a próxima compra começa.

**Pagamento pelo aplicativo também é simulado.** “Pagar agora” antecipa um
minuto (R$ 0,22) e cobra o restante ao encerrar; “Pagar depois” não desconta no
início e cobra o total no fim. Todo minuto iniciado é cobrado, sem o motorista
informar previamente a duração. Não apresentar esse fluxo como pagamento real.

---

## Armadilhas conhecidas

**Posicionamento de texto no totem** usa a baseline com altura de fonte fixa,
não `getTextBounds` no eixo Y. Dependendo da versão da biblioteca aquele valor
vem diferente e o texto sobe ~17px, invadindo o elemento de cima.

**No tema claro o âmbar tem dois papéis:** `--accent` preenche superfícies e
leva texto escuro por cima; `--accent-text` pinta texto sobre fundo claro.
Usar o mesmo tom nos dois reprova em um dos casos.

**Firebase App Check** precisa continuar em "Monitorando" (não forçado), senão
bloqueia tanto o site quanto o ESP32.

**Fontes do totem só têm ASCII 0x20–0x7A.** Acento, `|`, `{` e `~` somem da tela
sem erro. O teste `ui_totem.test.cpp` confere caracteres e largura de todas as
mensagens; ao criar uma mensagem nova, incluí-la lá.

**Regras do Firestore precisam acompanhar o site.** O arquivo
`firebase/firestore.rules` permite que o motorista consulte uma placa inexistente antes
de criá-la e limita cada totem às transições de entrada/saída do próprio
estacionamento. Publique as regras depois que essa alteração entrar na `main`;
sem a publicação, o erro `Missing or insufficient permissions` ao cadastrar
uma placa nova continua no Firebase já implantado.

**`getComputedStyle` devolve valor em cache** logo após trocar o atributo do
tema. Para auditar contraste, force um repaint antes de medir — sem isso o
resultado é falso.

**Vite pode servir arquivo vazio** depois de certas edições. Se um componente
sumir sem erro no console, limpe `node_modules/.vite` e reinicie.
