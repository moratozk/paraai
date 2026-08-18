# Estado do projeto

Arquivo de retomada: quem abrir isto (pessoa ou assistente) entende onde a
coisa parou sem precisar reler o histórico. Atualizado em **17/08/2026**.

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

**`getComputedStyle` devolve valor em cache** logo após trocar o atributo do
tema. Para auditar contraste, force um repaint antes de medir — sem isso o
resultado é falso.

**Vite pode servir arquivo vazio** depois de certas edições. Se um componente
sumir sem erro no console, limpe `node_modules/.vite` e reinicie.
