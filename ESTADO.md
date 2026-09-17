# Estado do projeto

Arquivo de retomada: quem abrir isto (pessoa ou assistente) entende onde a
coisa parou sem precisar reler o histórico. Atualizado em **09/09/2026**.

---

## O que é

Sistema acadêmico de atendimento para estacionamentos:

- **`Main/`** — firmware do totem (ESP32 + tela ILI9341 320×240 + touch
  XPT2046), sem sensores ou servo/catraca física; gabinete 3D ainda a projetar
- **`Web/`** — painel React/Vite, com Firebase Auth e Firestore

O motorista registra entrada/saída por placa. O Firebase associa vaga,
estadia e cobrança simulada. O operador acompanha pelo painel. A ocupação é
lógica; a maquete virtual online é uma etapa futura, não implementada.

Projeto acadêmico (TCC). Revisão atual: `codex/totem-atendimento`.

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
- CI executa testes Firestore + C++ e guarda frames para revisão. Compilação
  ESP32 Dev Module/Huge APP em verificação; resultado final será registrado aqui.
- **Nada publicado no Firebase e nada gravado no ESP32.** Sem hardware
  conectado: calibração, responsividade sob TLS e montagem física pendentes.
  App Check continua em monitoramento. Ver checklist em Main/README.md.

### Implantação e próxima etapa

Autorizar e agendar regras + firmware juntos, interrompendo atendimento na
troca. O firmware de sensores não é compatível com as novas regras. Conferir
estadias abertas, tarifa congelada e vínculos veículo/vaga antes de instalar;
não apagar dados para resolver inconsistências. Calibrar com o display montado.

Depois da validação do totem: evoluir o site e criar a maquete virtual para
visualizar os registros, sem redefinir cobrança nem simular sensores como
dados reais. Web/public/totem.html e textos de sensores do site permanecem
legados, deliberadamente fora desta entrega.

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
cd Web
cp .env.example .env      # e preencha com os valores do Firebase
npm install
npm run dev               # http://localhost:5173
```

Sem o `.env` o site abre mas login e dados não funcionam — ele não está no
Git de propósito.

Existe um simulador **legado** em `/totem.html`, com teclado antigo. Para
inspecionar o firmware atual, usar Main/tests/ui_totem.test.cpp e preview.mjs,
conforme Main/README.md. Nenhum deles é a futura maquete virtual.

### Firmware

```bash
cp Main/Credenciais.example.h Main/Credenciais.h   # e preencha
```

Precisa de Wi-Fi **2,4 GHz** — o ESP32 não enxerga 5 GHz. Abrir `Main/Main.ino`
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
- Faturamento por período, ocupação vaga a vaga, histórico de acessos
- Status do totem em três estados: nunca conectou / offline / online
- Avisa se o operador configurar mais vagas do que o totem tem sensores
- Tarifa e número de vagas editáveis
- Cadastro faz rollback da conta do Authentication se o perfil falhar
- Rotas carregadas sob demanda e Firebase separado no build
- Perfil do operador gera e revoga credenciais exclusivas de totem

**Site**
- Home com fotos que acompanham a rolagem, sem dependência de animação
- Cadastro em duas frentes: motorista e estacionamento
- Recuperação e redefinição de senha
- Recarga de saldo (PIX/cartão simulados)
- Tema claro e escuro, ambos com contraste conferido em WCAG AA
- Papel da conta é definitivo: motorista não pode cadastrar estacionamento e
  operador não usa o fluxo de motorista; as regras do Firestore reforçam isso
- Marketplace do motorista em `/estacionamentos`, com busca, filtros, tarifa,
  disponibilidade e rota; usa `catalogoEstacionamentos` para não expor dados
  operacionais ou credenciais dos pátios

---

## O que falta

1. **Validar o touch no novo firmware** — a calibração agora é integrada e
   persistente. Após autorização para gravar, completar cinco pontos e testar
   os dois formatos de placa, confirmação, correção e toque mantido.

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

**A logo é um arquivo, não código.** `Web/public/logo.png`. Já se tentou
redesenhá-la em SVG por aproximação e o resultado nunca bateu. Para trocar,
substitua o arquivo. A única exceção é a tela do totem, onde não dá para
carregar PNG e a marca é reconstruída com retângulos e círculos.

**A inicial do totem não mostra contagem de vagas.** Só ENTRADA/SAÍDA. A
confirmação informa a vaga atribuída. Desde 09/09 não há sensores nem
atuadores; o painel recebe a ocupação lógica dos registros no Firebase.

**Textos do site sem jargão.** Nada de "ESP32", "Firestore", "ultrassônico" —
quem entra quer estacionar, não conhecer o hardware.

**Modo claro não usa branco puro.** Cansa a vista. A base é um cinza
levemente quente; o contraste vem da hierarquia, não do brilho.

**Motorista e operador são contas separadas.** O papel é escolhido no
cadastro. Motorista não vê nem consegue criar estacionamento; um operador só
vincula o próprio estacionamento inicial. Não oferecer conversão entre papéis
no Perfil.

**O marketplace usa uma projeção pública autenticada.** Motoristas leem
`catalogoEstacionamentos`, nunca o documento operacional completo. Novos
estacionamentos criam a vitrine junto com o cadastro; os antigos são migrados
quando o operador abre o painel. Sem leitura recente, a tela mostra “Sem
leitura” em vez de inventar vagas disponíveis.

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

**Regras do Firestore precisam acompanhar o site.** O arquivo
`firestore.rules` permite que o motorista consulte uma placa inexistente antes
de criá-la e limita cada totem às transições de entrada/saída do próprio
estacionamento. Publique as regras depois que essa alteração entrar na `main`;
sem a publicação, o erro `Missing or insufficient permissions` ao cadastrar
uma placa nova continua no Firebase já implantado.

**`getComputedStyle` devolve valor em cache** logo após trocar o atributo do
tema. Para auditar contraste, force um repaint antes de medir — sem isso o
resultado é falso.

**Vite pode servir arquivo vazio** depois de certas edições. Se um componente
sumir sem erro no console, limpe `node_modules/.vite` e reinicie.
