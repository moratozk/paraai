# Estado do projeto

Arquivo de retomada: quem abrir isto (pessoa ou assistente) entende onde a
coisa parou sem precisar reler o histórico. Atualizado em **08/09/2026**.

---

## O que é

Sistema de estacionamento sem operador no posto, dividido em duas partes:

- **`Main/`** — firmware do totem (ESP32 + tela ILI9341 320×240 + touch
  XPT2046 + 4 sensores ultrassônicos + servo da catraca)
- **`Web/`** — painel React/Vite, com Firebase Auth e Firestore

O motorista digita a placa na tela do totem, a catraca abre, e na saída o
valor sai da carteira digital dele. O dono do estacionamento acompanha
faturamento e ocupação pelo painel.

Projeto acadêmico (TCC). Branch atual: `main`.

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

Há também um **simulador da tela do totem** em `/totem.html`, que replica as
primitivas do Adafruit_GFX nas mesmas coordenadas do firmware. Serve para
conferir layout sem o hardware ligado.

### Firmware

```bash
cp Main/Credenciais.example.h Main/Credenciais.h   # e preencha
```

Precisa de Wi-Fi **2,4 GHz** — o ESP32 não enxerga 5 GHz. Abrir `Main/Main.ino`
na Arduino IDE e gravar.

---

## O que está pronto

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
- Faturamento por período, ocupação vaga a vaga, histórico de acessos
- Mapa visual e interativo do pátio em tempo real, com corredor, entrada,
  saída e vagas reservadas para PCD, idosos e gestantes
- Controle manual seguro para ocupar, identificar por placa e liberar vagas
  durante a apresentação mesmo sem os sensores físicos ligados
- Atalho “Preparar demo FATEC” preenche o nome Estacionamento FATEC e 20 vagas
- Status do totem em três estados: nunca conectou / offline / online
- Avisa se o operador configurar mais vagas do que o totem tem sensores
- Tarifa e número de vagas editáveis
- Cadastro faz rollback da conta do Authentication se o perfil falhar
- Rotas carregadas sob demanda e Firebase separado no build
- Perfil do operador gera e revoga credenciais exclusivas de totem

**Site**
- Home com fotos que acompanham a rolagem, sem dependência de animação
- Cadastro público de motorista e acesso separado para administradores
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

1. **Calibrar o touch** — grave `CalibracaoTouch/CalibracaoTouch.ino`, toque
   nas 4 miras, cole os `#define` que o Monitor Serial imprimir em
   `Main/DisplayUI.ino` (linhas ~67-70). Sem isso o toque cai na tecla
   vizinha: toca no "O" e registra "I".

2. **Testar o fluxo físico completo** — autenticação, heartbeat e sincronização
   já foram confirmados no ESP real. Ainda falta executar uma entrada e saída
   completas, conferindo teclado touch, sensores e abertura da catraca.

3. **Configurar a recuperação de senha no Firebase** — em Authentication >
   Templates > Redefinição de senha, apontar a URL da ação para
   `https://SEU_DOMINIO/redefinir-senha` e autorizar esse domínio. Sem essa
   etapa, o Firebase abre a página padrão dele em vez da tela do ParaAí.

4. Pagamento é simulado — não há gateway real.

---

## Decisões já tomadas (não refazer sem motivo)

**Identidade é âmbar sobre asfalto.** Houve uma tentativa de mudar para
verde-oliva/terracota com tipografia serifada; foi descartada pelo dono do
projeto, que preferiu voltar ao original. Não sugerir de novo.

**A logo é um arquivo, não código.** `Web/public/logo.png`. Já se tentou
redesenhá-la em SVG por aproximação e o resultado nunca bateu. Para trocar,
substitua o arquivo. A única exceção é a tela do totem, onde não dá para
carregar PNG e a marca é reconstruída com retângulos e círculos.

**O totem não mostra vagas.** A tela é só ENTRADA/SAÍDA. Os sensores
continuam existindo e alimentam a ocupação do painel web, mas não aparecem
para o motorista.

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
livre/ocupada/reservada, sem placas. Assim, motoristas podem abrir uma
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
