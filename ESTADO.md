# Estado do projeto

Arquivo de retomada: quem abrir isto (pessoa ou assistente) entende onde a
coisa parou sem precisar reler o histórico. Atualizado em **09/10/2026**.

---

## O que é

Sistema acadêmico de atendimento para estacionamentos:

- **`firmware/`** — firmware do totem na placa CYD de 2,8" de duas portas
  (ESP32-2432S028R: ESP32 + tela ST7789 320×240 + touch XPT2046), sem sensores
  ou servo/catraca física; gabinete 3D impresso, ainda a montar
- **`web/`** — painel React/Vite, com Firebase Auth e Firestore
- **`firebase/`** — regras do Firestore e testes no emulador
- **`contratos/`** — casos esperados que o site, o totem e as regras testam
  juntos (conta da estadia, vagas especiais e placas)
- **`e2e/`** — teste do fluxo completo no navegador e demonstração sem
  internet, com os emuladores e o totem simulado
- **`docs/apresentacao.md`** — roteiro da banca, checklist do dia e plano B

O motorista registra entrada/saída por placa. O Firebase associa vaga,
estadia e cobrança simulada. O operador acompanha pelo painel. A ocupação é
lógica; a maquete virtual do administrador mostra os mesmos registros com
carros andando num pátio desenhado (ver "Maquete virtual", abaixo).

Projeto acadêmico (TCC). A `main` tem tudo: a integração (PR #9) e, desde
06/10/2026, os PRs #10 a #15 (pinos e tela da CYD, pastas, vagas especiais,
revisão visual e nova tela inicial). **Regras do Firestore e site publicados
em 06/10/2026** a partir da `main` (`26a97e5`); o site no ar é o build dessa
versão. **O firmware da `main` foi gravado no totem no mesmo dia** e testado:
uma placa sem direito declarado recebeu a primeira vaga comum livre.

## Roteiro da apresentação e demonstração sem internet (09/10/2026)

- **Roteiro (`docs/apresentacao.md`):** o que preparar antes (publicar,
  gravar o totem, contas da demonstração no site publicado, "Não é spam",
  vídeo do fluxo, hotspot em 2,4 GHz salvo no totem), o checklist do dia, a
  ordem da demonstração (cadastro, placa, recarga, reserva, entrada no totem,
  mapa ao vivo e maquete, saída, cobrança e painel da rede), o plano B para
  cada falha e as perguntas que a banca costuma fazer, com as respostas
  tiradas do código.
- **Demonstração sem internet (`npm run apresentacao` em `e2e/`):** o site no
  computador, ligado aos emuladores com as regras do repositório, com
  administrador, dono, dois motoristas prontos (um deles com direito 60+),
  estadias da última semana no painel da rede e uma placa em dívida
  (`e2e/apresentacao.mjs`). O totem é simulado no terminal (`entrada PLACA`,
  `saida PLACA`, `vagas`) e manda o sinal de vida a cada minuto. Cada execução
  começa do zero, e nada vai para a produção. Precisa de Node 22, Java 21 e
  `npm ci` em `web/` e `e2e/`, feitos uma vez com internet; a primeira
  execução baixa os emuladores.
- **Totem simulado (`e2e/patio.js`):** as mesmas leituras e gravações do
  firmware (`firmware/totem/Atendimento.cpp`): placa nova cadastrada sem
  dono, saldo pendente bloqueando a entrada, reserva do app, vaga do direito
  declarado, modelo e cor copiados para a vaga, saída com a conta de
  `web/src/utils/cobranca.js` e o sinal de vida. O teste do fluxo completo
  passou a usar o mesmo módulo, e o CI roda a demonstração com comandos de
  totem em cada PR.
- **Simulador antigo removido:** saíram `web/public/totem.html` (o teclado
  antigo, ainda publicado em `/totem.html`) e `web/public/icons.svg` (sobra do
  modelo do Vite, sem uso). Depois da próxima publicação, `/totem.html` cai no
  site, como qualquer endereço que não existe.
- **Acesso de totem nos emuladores:** "Gerar novo acesso de totem" cria a
  conta num app à parte (`services/totems.js`), que não seguia os emuladores
  e falhava na demonstração. Agora segue (`ligarAuthAoEmulador`, em
  `firebaseConfig.js`). O site publicado não muda.
- **README:** a limitação sobre vagas especiais dizia que só quem reservou
  podia usá-las. Agora segue a decisão de 02/10/2026: no totem, quem declarou
  o direito recebe a primeira vaga livre do seu tipo.
- Regras e firmware não mudam. Para publicar, só o site.

## Testes automáticos (09/10/2026)

Antes, o site só passava por lint e build no CI. Agora cada PR também roda:

- **Contas do site (`web/test/`, `npm test` em `web/`):** cobrança, placa,
  celular, dinheiro, valor digitado na recarga, vagas especiais, modelo e cor
  e os relatórios. A conta da estadia saiu do painel do motorista para
  `web/src/utils/cobranca.js`, com a mesma ordem de contas do totem e das
  regras.
- **Contratos (`contratos/`):** a conta da estadia, a tabela das vagas sem
  tipo gravado e as placas aceitas existem no site, no totem e nas regras. Os
  casos esperados ficam em CSV, num lugar só, e as três partes são testadas
  contra eles: o site em `web/test/contratos.test.js`, o totem em
  `firmware/test/logica_totem.test.cpp` e as regras no emulador, onde cada
  cobrança é aceita com o centavo certo e recusada com um centavo a mais ou a
  menos. O teste do site também compara, no texto do firmware e das regras,
  as cores, o tamanho do nome do carro, a tolerância de meio centavo e os
  limites da recarga. Um caso pega a ordem das contas: 9 minutos a R$ 8,50
  dão R$ 1,27 nas três partes (R$ 1,275 na conta exata).
- **Fluxo completo (`e2e/`, Playwright):** o site no navegador, ligado aos
  emuladores com as regras de verdade, no tamanho de computador e de celular.
  Cadastro com o aceite da política, placa, recarga, reserva (a vaga PCD é
  recusada sem o direito declarado), entrada no totem na vaga reservada, mapa
  do dono ao vivo, saída e a cobrança no painel, no comprovante e no extrato.
  O totem é simulado com as mesmas gravações do firmware. Qualquer erro no
  console faz o teste falhar.
- **Defeito que o teste achou:** logo depois de criar a conta, às vezes
  aparecia a faixa vermelha "Não conseguimos carregar os dados da sua conta".
  Uma leitura atrasada do perfil disparava o auto-reparo
  (`web/src/context/AuthContext.jsx`), que tentava regravar um perfil que já existia
  e era recusado pelas regras. O reparo agora confere numa transação e só cria
  o perfil que realmente falta. Conta antiga sem perfil continua sendo
  reparada.
- **Emuladores só para projeto de demonstração:** o site liga os emuladores
  apenas com `VITE_EMULADOR_AUTH`, `VITE_EMULADOR_FIRESTORE` e projeto
  `demo-...` (`web/src/firebase/firebaseConfig.js`). O site publicado não tem nenhuma
  delas, e o build de produção descarta esse trecho.
- **Regras e firmware:** não mudam. Só os testes deles leem os casos novos.

## Privacidade e LGPD (09/10/2026)

- **Política de privacidade (`/privacidade`, `pages/Privacidade.jsx`):** aberta
  a todos, com link no rodapé da Home, no cadastro, nas Configurações e no
  Perfil. Uma tabela diz, para cada dado, para que serve e quem vê. O "quem vê"
  segue as regras do Firestore: se uma regra mudar quem lê um dado, mude a
  tabela também. Os controladores são os autores do TCC. A página não traz
  nomes completos, instituição nem e-mail de contato, que ainda não foram
  definidos; quando forem, entram na seção "Quem cuida dos seus dados".
- **Aceite no cadastro:** caixa obrigatória na última etapa. O perfil grava
  `privacidadeAceitaEm` (hora do servidor, conferida pelas regras) e
  `versaoPrivacidade` (`VERSAO_PRIVACIDADE` em `services/conta.js`, que é
  também a data mostrada na página; troque quando a política mudar). Contas
  anteriores a esta versão não têm esse registro, e não há tela pedindo o
  aceite de novo. A declaração da vaga especial passou a valer também como o
  consentimento do dado sensível (`components/CampoDireitoVaga.jsx`).
- **Baixar meus dados (Configurações, aba Privacidade):** um arquivo JSON com
  conta, perfil, veículo, recargas, estadias (com o nome do estacionamento) e
  reserva, com as datas legíveis. Dono de estacionamento e administrador
  baixam o próprio perfil; o dono leva também o cadastro do pátio, sem o
  código de pareamento do totem.
- **Excluir minha conta (só motorista):** pede a senha, cancela a reserva
  ativa e, num lote só, libera a placa (`ownerUid` vazio, saldo 0, sem modelo,
  cor nem vaga especial, `historicoDesde` com a hora do servidor) e apaga o
  extrato, a reserva e o perfil. Por último apaga o acesso no Authentication e
  leva ao início. Com o carro no pátio ou com pendência de saldo, a exclusão
  é recusada e a tela diz o que fazer. As estadias ficam no histórico só com a
  placa, para o estacionamento e a rede, e o saldo positivo (simulado) não é
  devolvido. Se o acesso não for apagado depois dos dados, a tela pede a senha
  de novo, e a segunda tentativa só apaga o acesso.
- **Placa liberada:** quem cadastra a placa depois não vê as estadias do dono
  anterior. As regras só deixam o motorista ler estadias com `entrada` a
  partir de `historicoDesde`, e o site faz a consulta com esse limite
  (`services/historico.js`). Essa consulta (placa + entrada) usa o índice
  composto de `firebase/firestore.indexes.json`, que o `firebase.json` agora
  publica junto com as regras. Placas sem `historicoDesde` (todas as de hoje)
  seguem com a consulta simples, sem índice.
- **Regras:** as permissões novas valem só para a exclusão. O motorista apaga
  o próprio perfil apenas junto com a liberação da placa e sem reserva; apaga a
  reserva vencida ou cancelada apenas junto com o perfil; apaga as próprias
  recargas apenas com a placa já liberada; e só libera a placa sem estadia
  aberta e sem dívida. Dono de estacionamento e administrador não se excluem
  pelo site. São 9 testes novos no emulador (74 no total).
- **Firmware:** não muda. A placa liberada entra pelo totem como placa sem
  dono, e o firmware preserva `historicoDesde` porque grava só os campos que
  altera.

**Publicação: regras e índice primeiro, depois o site.** `firebase deploy
--only firestore` publica os dois; se o Firebase perguntar se deve apagar
índices que não estão no arquivo, responda que não. O índice leva alguns
minutos para ficar pronto, e só a consulta de placa liberada depende dele.
Com as regras antigas, o site novo funciona, menos a exclusão da conta, que é
recusada sem apagar nada.

## Reservas no mapa do dono e acertos de tela (09/10/2026)

- **Mapa do dono (`components/MapaVagas.jsx`):** passou a juntar a vaga do
  totem com a projeção pública, como o mapa do administrador
  (`combinarVagasDoPatio` em `utils/mapaVagas.js`). A vaga reservada pelo app
  aparece em âmbar ("Reserva", "até 14:05"), em vez de "Livre", e o tipo
  definido pela administração vale também aqui. O tipo vem primeiro da
  projeção pública, que é de onde o totem lê; o campo `tipo` da vaga
  operacional só existe em vagas antigas. "Ocupação agora" conta as reservas
  à parte. Os selos não repetem mais o rótulo ("60+ 60+", "G GESTANTE") e
  "Gestante" desce para baixo do número em vez de vazar da vaga.
- **Movimentações do dono:** 10 linhas e "Ver mais" (+20), como no painel da
  rede; o CSV continua levando o período inteiro. A página do dono no celular
  tinha mais de 10 mil pixels de altura com 25 linhas.
- **Vagas ao vivo do administrador:** cada estado mostra só o que tem (vaga
  livre não tem placa nem origem; a reservada mostra até quando vale e quanto
  falta, em linhas separadas). O painel lateral não é mais `aria-live`: a
  contagem da reserva muda a cada segundo e o leitor de tela anunciava sem
  parar. Na lista, a reserva aparece como "Reservada", e não como uma placa
  "SEM PLACA".
- **Saldo baixo (`pages/PainelMotorista.jsx`):** o aviso usava uma tarifa fixa
  de R$ 5. Agora compara com a tarifa que a pessoa vai pagar: a congelada na
  entrada, descontado o que a estadia já soma; a do local reservado; a do
  último local usado; ou a mais barata da rede, para quem nunca estacionou.
- **Perfil:** o erro da placa aparece embaixo do campo, com o foco nele (no
  topo do cartão ficava fora da tela do celular), e campo com erro fica com a
  borda vermelha. A nota do dono não fala mais em `Credenciais.h`, e a lista
  de acessos chama o equipamento de totem. "Bloquear" virou um botão de
  verdade no celular.
- **Gerais:** o anel de foco usa o âmbar de texto (no tema claro o âmbar dos
  botões ficava em 1,8:1 e o anel quase sumia), o select tem a mesma altura do
  campo de texto ao lado, a logo da barra tem 44 px de largura a 320 px, e os
  avisos vazios ("Estacionamento não encontrado") ficaram centralizados, com
  respiro e título no tamanho de seção.

Sem mudança nas regras do Firestore: o dono já podia ler a projeção pública.
Só o site precisa ser publicado.

## App instalável no celular (09/10/2026)

O site virou um app que se instala pelo navegador (PWA), sem loja:

- **Instalar:** no Android e no computador (Chrome e Edge), "Instalar o app"
  aparece no menu da conta e no menu de três traços quando o navegador oferece
  a instalação; no iPhone, o mesmo item explica o caminho (Compartilhar e
  "Adicionar à Tela de Início"). Aberto como app, o item some. O app abre no
  painel (`/dashboard`, que leva ao login quem não entrou), sem a barra do
  navegador, com a logo como ícone. `icone-maskable-512.png` e
  `apple-touch-icon.png` são a própria `logo.png` sobre o mesmo âmbar, sem
  redesenho: o "P" no lugar, só a moldura arredondada vira fundo.
- **Sem internet:** o service worker (`public/sw.js`) mostra
  `public/offline.html`, com a logo e o tema escolhido, em vez do erro do
  navegador, e recarrega sozinho quando a rede volta. Ele não guarda telas nem
  dados: tudo continua vindo do Firebase, e cada publicação chega na hora.
- **Depois de cada publicação:** quem estava com o site aberto e abria uma tela
  ainda não visitada pedia um arquivo que a publicação apagou, e a página
  ficava inteira em branco. Agora o site recarrega uma vez para pegar a versão
  nova (`src/pwa.js`); se ainda falhar, aparece "Esta tela não abriu", com o
  menu no topo e o botão de recarregar (`components/ErroDeTela.jsx`). No
  `firebase.json`, o `no-cache` passou a valer para `/` e para os endereços de
  todas as telas, e não só para `/index.html`, além do `sw.js`.
- A barra do navegador e a do app acompanham o tema (`ThemeContext`), e o
  `index.html` aplica o tema claro antes do primeiro quadro: quem usa o claro
  não vê mais o escuro piscar ao abrir o site.

Sem mudança nas regras do Firestore. Só o site precisa ser publicado (os
cabeçalhos do `firebase.json` vão junto com ele).

## Comprovante da estadia (09/10/2026)

Cada estadia encerrada tem um comprovante (`components/ComprovanteEstadia.jsx`):
estacionamento e endereço, placa, vaga, entrada, saída, permanência, tarifa
congelada na entrada, valor, quanto saiu da carteira e o que ficou pendente,
com o código da estadia (o id do recibo em `historico`). O motorista abre pelo
"Últimos acessos" do painel (a linha inteira) e pelo botão "Ver" em "Meus
acessos"; o dono do estacionamento, pelo mesmo botão em "Movimentações".
"Imprimir ou salvar PDF" usa a impressão do navegador: só a folha sai, com
tinta escura sobre papel branco, mesmo no tema escuro. O texto avisa que a
carteira é simulada e que o comprovante não tem valor fiscal. Sem mudança nas
regras: tudo vem do recibo que o totem já grava e que ninguém altera.

## Painel da rede do administrador (09/10/2026)

A conta `admin` deixou de ver só a lista de estacionamentos e passou a ter o
painel da rede inteira, no mesmo `/dashboard`:

- **Período** (hoje, 7 dias, 30 dias, tudo) para o recebido na rede, o que
  ficou a receber, estadias, ticket médio e permanência média; ao lado, a
  ocupação agora, quantos totens estão online, quantos estacionamentos estão
  publicados e o horário de pico. O gráfico mostra a receita por dia.
- **Cada estacionamento** mostra recebido e estadias do período, ocupação
  agora, tarifa e a situação do totem pelo último sinal gravado no
  estacionamento (online, offline, nunca conectou ou sem totem). "Gerenciar
  totens" abre ali mesmo a lista do Perfil do dono: bloquear, reativar e gerar
  acesso novo (`components/GerenciarTotens.jsx`, usado nos dois lugares).
- **Movimentações da rede:** filtro por estacionamento e por placa, dez linhas
  e "Ver mais"; o CSV leva todas as do filtro, com a coluna do estacionamento.
- Os cálculos do período ficaram em `utils/relatorios.js` e o gráfico em
  `components/GraficoReceita.jsx`, compartilhados com o painel do operador.
- **Sem mudança nas regras:** o administrador já lia `historico`, `totems` e
  as vagas de todos os estacionamentos. Basta publicar o site.

## Saldo protegido e extrato da carteira (09/10/2026)

Achado na revisão geral de 08/10/2026: a regra do Firestore deixava o dono da
placa gravar qualquer `saldo` no próprio veículo. No emulador passaram saldo
de 1.000.000, texto no lugar do número, dívida zerada e saldo de -500.

- **O saldo só sobe com registro.** A recarga simulada grava, no mesmo lote, o
  crédito (`increment`) e um documento em `veiculos/{placa}/recargas/{id}` com
  `valor`, `forma` (`pix` ou `cartao`), `uid` e `criadaEm` (hora do servidor).
  As regras conferem um contra o outro: o registro é novo, o veículo aponta
  para ele em `ultimaRecarga` e o saldo sobe exatamente o valor dele, de
  R$ 0,01 a R$ 1.000, em centavos. Ninguém altera nem apaga um registro. O
  totem continua só debitando junto com o recibo da saída, e painel e totem
  criam o veículo com saldo 0.
- **Extrato no Perfil** (`components/ExtratoCarteira.jsx`): recargas como
  crédito e estadias encerradas como débito, da mais recente para a mais
  antiga, com a parte não coberta pelo saldo. Só quem recarregou lê o registro
  (nem o estacionamento, nem o totem, nem o administrador). As recargas
  anteriores a esta versão não têm registro: quando o saldo passa da soma do
  extrato, ele avisa que essas recargas não aparecem.
- **Tela de recarga:** o valor digitado segue o formato brasileiro ("1.000" é
  mil reais, não um; mais de dois centavos é recusado) e o "Novo saldo" do fim
  deixou de somar a recarga duas vezes.
- **Publicação: regras e site juntos, regras primeiro.** O site antigo não
  recarrega com as regras novas, e o novo não recarrega com as antigas (nelas
  a subcoleção `recargas` não existe). O firmware não muda: já cria o veículo
  com saldo 0 e só debita.

## Wi-Fi na tela do totem (07/10/2026)

Pedido do dono do projeto: trocar a rede sem editar código nem depender do
celular, com acesso para quem cuida do totem e não para o motorista.

- **TROCAR WIFI** (menu de manutenção, atrás do PIN) abre
  `totem/AssistenteWiFi.h`: lista as redes 2,4 GHz com senha (mais forte
  primeiro, quatro por página, a rede em uso marcada como ATUAL), teclado
  completo (maiúsculas, ?123 e #+=, cobrindo os 95 caracteres ASCII
  imprimíveis) e OUTRA REDE para rede oculta. A senha aparece como foi
  digitada, sem opção de ocultar (decisão do dono do projeto).
- Só salva depois de conectar de verdade (até 20 s). Senha errada, rede fora
  de alcance ou cancelamento voltam ao teclado com a senha e um aviso, e a
  rede anterior é retomada. O aviso vem do motivo da desconexão informado pelo
  ESP-IDF (`classificarFalhaWifi` em `LogicaTotem.h`).
- O portal pelo celular continua no menu como **WIFI PELO CELULAR** e no
  Serial `W`: é o caminho quando o toque está ruim ou a senha tem acento.
- Sem rede alguma configurada, a lista abre sozinha no primeiro uso (sem PIN,
  como o portal antes). Sem toque por 3 min, fecha sem alterar nada.
- SSID e senha usam a fonte mono da Adafruit, porque as fontes próprias não
  têm `_ " [ ] { } | ~`. Acentos do SSID somem só na tela; a conexão usa os
  bytes originais.
- Testes no PC cobrem cada tecla, as larguras dos textos e o fluxo inteiro com
  um rádio simulado. **Ainda não gravado nem testado no totem.**

## Nova tela inicial (06/10/2026)

A Home foi refeita tendo como referência o site de um amigo do dono do
projeto (mastercommercialcare.vercel.app): seções que alternam claro e escuro,
movimento ligado à rolagem e uma interação central ligada ao negócio. Lá é
"limpar o vidro"; aqui é **estacionar o carro**. Tudo dentro da identidade
(âmbar sobre asfalto, logo oficial, Anton/Archivo/JetBrains Mono).

- **Hero com pátio interativo** (`components/home/PatioInterativo.jsx`): o
  visitante arrasta o carro até uma vaga livre. Segue o dedo 1:1 a partir do
  ponto em que foi pego, herda a velocidade ao soltar, decide pela projeção
  do impulso e encaixa com mola (`utils/mola.js`: resposta + amortecimento,
  como na Apple); além da borda resiste em vez de travar. Pode ser
  interrompido no meio do movimento. A vaga PCD recusa e explica por quê. Tem
  teclado (setas escolhem, Enter estaciona) e anúncio para leitor de tela.
  Sozinho, o carro só anda até a frente da vaga indicada, como convite.
- **Letreiro** com as vantagens, que anda com a rolagem (não gira sozinho).
- **Por que**, **Promessas** (cartões com brilho que segue o mouse),
  **Como funciona** (coluna fixa, linha de progresso e passos que acendem),
  **Mapa ao vivo** (simulação do mapa do app, identificada como tal e com
  botão de pausar), **Para quem** e **Chamada final**.
- **Rodapé** com colunas de links e a marca em corpo gigante, só no contorno.
- **Barra de navegação na Home**: vira uma pílula de vidro ao rolar, marca a
  seção que está na tela e mostra uma linha de progresso de leitura. As outras
  páginas continuam com a barra de antes.
- **Ilhas escuras** (`.ilha-escura`): painéis que ficam escuros também no
  tema claro, reaproveitando os mesmos tokens do tema escuro (`:root,
  .ilha-escura` em `index.css`).
- A Home não usa mais fotos externas; `components/Imagem.jsx` saiu.

Da referência ficaram de fora, de propósito: rolagem suave artificial (Lenis),
tela de carregamento, botões "magnéticos" e o letreiro que anda sozinho.
Todos atrasam a resposta ou tiram o controle de quem navega. Com "reduzir
movimento" ligado no sistema, nada se anima sozinho.

## Maquete virtual (08/10/2026)

Pedida pelo dono do projeto, que a uniu à `main` em 09/10/2026, antes da
revisão do outro autor. Fica no painel do administrador, ao lado do mapa de
vagas ("Ver maquete"), em `/admin/estacionamentos/:id/maquete`. O `AGENTS.md`
deixou de dizer que a maquete fica para uma etapa posterior e passou a exigir
que ela só mostre os registros, sem simular nada.

- **Só leitura, com os dados de verdade.** Usa as mesmas vagas do mapa do
  administrador: ocupação do totem e reservas do app, combinadas em
  `combinarVagasAdmin` (`utils/mapaVagas.js`), agora usada pelas duas telas.
  Cada mudança entre duas leituras vira um carro andando: entra pela
  esquerda, para no totem, segue até a vaga e estaciona de frente; na saída,
  sai de ré e deixa o pátio pela direita. Nada é gravado e nada é simulado:
  sem registro do totem, nada se mexe. Não há sensor, cancela nem catraca.
- **Pátio gerado do número de vagas** (`components/maquete/geometria.js`):
  fileiras a 90°, duas por corredor, circulação de mão única. O formato
  acompanha a tela (largo no computador e no projetor, alto no celular), e
  os números das vagas nunca ficam abaixo de 12 px: pátio grande ganha mais
  corredores em vez de encolher. Trajetos conferidos de 1 a 400 vagas. Mudar
  o número de vagas no painel redesenha a maquete na hora, sem recarregar; o
  carro que estiver andando chega de uma vez na vaga.
- **Mesma linguagem do pátio da Home:** asfalto escuro nos dois temas, faixa
  âmbar, carros vistos de cima, vagas especiais nas cores `--vaga-*` e
  reserva tracejada em âmbar. O carro tem a cor que o dono informou no
  Perfil (campo `cor` que o totem copia para a vaga, PR #22), em tons
  ajustados ao asfalto; sem ela, uma cor fixa por placa. Canteiros com gramado
  aparado e árvores vistas de cima. O totem fica numa ilha com meio-fio
  zebrado em âmbar, mostra os dois botões da tela inicial (ENTRADA e SAÍDA)
  e a luz de status, e ilumina a pista quando um carro para nele.
- **Projetor:** "Tela cheia" mostra só a maquete e os últimos movimentos; Esc
  sai. Com "reduzir movimento" ligado no sistema, o carro aparece direto na
  vaga, que acende.
- Um carro por vez na pista do totem: entradas seguidas esperam a vez. A
  lista de movimentos começa vazia ao abrir a página (mostra o que acontece
  dali em diante, não o histórico).
- Conferido só com dados simulados, no navegador (temas, celular, projetor,
  menos movimento e pátios de 20, 50 e 200 vagas). **Ainda não visto com o
  totem de verdade nem publicado.**

## Revisão visual de 04/10/2026 (diretrizes da Apple)

O site inteiro foi conferido nos dois temas, no computador e a 375 px, contra
as diretrizes da skill `apple-design`. O que mudou:

- **Escala de texto única** em `index.css`: `--t-legenda` (12 px), `--t-apoio`
  (14), `--t-corpo` (16), `--t-destaque` (18), `--t-subtitulo` (20),
  `--t-titulo` (24), `--t-titulo-g` (28) e `--t-numero` (36). Os 184
  `font-size` avulsos viraram tokens; só as manchetes fluidas (`clamp`)
  ficaram de fora. O corpo deixou de usar `vw`, para respeitar o tamanho de
  texto escolhido pela pessoa.
- **Cores das vagas especiais** em tokens (`--vaga-pcd`, `--vaga-idoso`,
  `--vaga-gestante`), iguais nos três mapas (o do operador usava outra paleta).
- **Mapa do administrador:** células de 78 px com número, selo do tipo,
  estado em caixa normal e a placa só quando existe; nada é cortado.
- **Mapa do motorista:** vaga especial livre mostra "Livre" e o tipo num selo
  ao lado do número; as vagas ocupadas ficaram legíveis (4,5:1).
- **Perfil e Configurações:** cartões com o mesmo respiro da grade, cartões
  de veículo iguais aos demais (só a aresta âmbar) e dados só de leitura como
  linhas de informação, em vez de campos desabilitados.
- **Nome do estacionamento** no painel e no histórico do motorista, nunca o
  identificador interno.
- **Toque:** botões, links e filtros com no mínimo 44 px.
- **Modais:** o foco do teclado fica preso na janela e volta ao botão que a
  abriu (`hooks/useFocoNoModal.js`); a recarga entra e sai pelo mesmo
  caminho, sem quique.
- **Modal de recarga com uma folha só:** `Pages.css` também estilizava as
  classes do modal e a janela saía misturada (etapas sobre o título, valores
  em 3 colunas, aviso partido ao meio). Agora só `ModalRecarga.css` as define.
- **Tema claro:** corrigidos o subtítulo e o botão de contorno da chamada
  final da Home (texto escuro sobre o véu escuro), a aba ativa de
  Configurações e o campo de busca do administrador, que estava sem estilo.
- `.spinner-grande` e `.input-spinner` foram para o CSS global: só existiam
  na folha de outras páginas e ficavam sem estilo em acesso direto
  (Redefinir senha, CEP do Cadastro).

Ficou pendente: servir as fotos da Home e do login pelo próprio site (hoje
vêm do Unsplash), o que depende de baixar os arquivos.

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

O totem passou a usar a placa **ESP32-2432S028R ("CYD")** na versão de **duas
portas (micro-USB + USB-C)**, que já traz tela e touch XPT2046 ligados. Os pinos
da tela são os mesmos da montagem anterior; no touch, o T_OUT (MISO) fica no
GPIO39 (antes 36, que na CYD é o T_IRQ e não é usado).

O que a primeira gravação mostrou, e como foi resolvido:

- **A tela é ST7789, não ILI9341**, embora a placa seja vendida como ILI9341
  (a CYD de uma porta usa ILI9341). Com o driver ILI9341 a imagem saía virada e
  com as cores invertidas. Um diagnóstico das 4 rotações nos dois controladores
  confirmou: `Adafruit_ST7789`, `init(240, 320)`, rotação 3, sem inversão de
  cor. O firmware e `firmware/touch-calibration/` usam essa sequência.
- **Toque:** a calibração não fechava. O assistente agora detecta pelos cantos
  se o painel está com os eixos trocados e grava isso junto com os limites
  (`VERSAO_CALIBRACAO_TOUCH` 2 força uma calibração nova). Pode calibrar com o
  plástico protetor da tela; o toque é resistivo e precisa de pressão firme.
- **Watchdog:** com rede lenta, o login TLS da biblioteca do Firebase prendia o
  núcleo 0 por mais de 5 s e o ESP reiniciava (backtrace em `Firebase.begin`).
  A tarefa `paraai-cloud` passou a rodar com a prioridade da tarefa ociosa.

Gravação na placa: com o esptool direto e `--before no-reset`, depois de pôr a
placa em modo de gravação (segurar BOOT, apertar RST, soltar BOOT); o reset
automático desta placa não entra sozinho nesse modo.

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
  especiais só por reserva (substituído pela "vaga especial por direito
  declarado", nas decisões abaixo). A cobrança é uma só: no totem, da entrada à saída,
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
  saída, com "não fui eu". Como esse botão só age depois do prejuízo, ficaram
  reservadas em 07/10/2026, para os autores decidirem, três formas de impedir
  a entrada em vez de contestá-la. As três valem só para placa com dono: o
  autocadastro do totem segue como hoje, e a saída continua livre.
  1. **Código de entrada no app** (a preferida): "Vou entrar" gera 4 a 6
     dígitos de uso único, válidos por poucos minutos, que o motorista digita
     no totem depois da placa; as regras do Firestore conferem. Não precisa
     de plano pago, e espiar o código não adianta. Exige o celular na entrada
     (dá para gerar antes de chegar, se a garagem não tiver sinal).
  2. **PIN pessoal** cadastrado no app: dispensa o celular, mas é sempre o
     mesmo e pode ser visto por cima do ombro; exige limite de tentativas
     conferido no servidor.
  3. **Aprovação no app** ("confirme no seu celular"): a mais elegante, mas
     deixa a entrada lenta e depende do app aberto ou de notificação (no
     iPhone, só com o site instalado na tela inicial).
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
dados reais. Web/public/totem.html permanece legado, fora desta entrega
(removido em 09/10/2026); os textos de sensores do site foram removidos em
02/10/2026.

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
o teclado antigo (removido em 09/10/2026). O checklist físico completo está
em `Main/README.md`.

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

Para ver as telas do firmware atual no computador, usar
firmware/test/ui_totem.test.cpp e preview.mjs, conforme firmware/README.md.
Para o sistema inteiro sem internet, com o totem simulado no terminal, usar
`npm run apresentacao` em `e2e/` (ver `docs/apresentacao.md`). Nenhum deles é
a maquete virtual, que fica no painel do administrador.

### Firmware

```bash
cp firmware/totem/Credenciais.example.h firmware/totem/Credenciais.h   # e preencha
```

Inclui `MANUTENCAO_PIN` (PIN das configurações do totem). O Wi-Fi pode ficar
em branco: sem rede alguma, o totem abre a configuração na própria tela.

Precisa de Wi-Fi **2,4 GHz** — o ESP32 não enxerga 5 GHz. Abrir `firmware/totem/totem.ino`
na Arduino IDE e gravar.

### Testes

Cada bloco parte da raiz do repositório.

```bash
cd web
npm test                  # contas do site e contratos
```

```bash
cd firebase/test
npm ci
npm test                  # regras no emulador (precisa do Java 21)
```

```bash
cd e2e                    # depois do npm install em web/
npm ci
npx playwright install chromium
npm test                  # fluxo completo no computador e no celular (Java 21)
```

Os testes do totem no PC estão em `firmware/README.md`. O CI também abre a
demonstração sem internet e passa alguns comandos pelo totem simulado. Nenhum
usa o Firebase de produção.

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
   reinicialização com estadia aberta, troca/perda de Wi-Fi (incluindo a nova
   tela de Wi-Fi: lista, senha errada, rede oculta e persistência após
   reiniciar), responsividade durante Firebase, calibração com gabinete e
   estabilidade prolongada.
   As validações físicas anteriores referem-se ao firmware antigo.

3. **E-mails de conta (recuperação de senha).** Em 07/10/2026 o dono do
   projeto autorizou `paraai.web.app` nos domínios do Firebase e o e-mail
   passou a chegar, mas no modelo padrão ("app paraai-9514f", link cru) e na
   caixa de spam. O site também deixou de mostrar "e-mail enviado" quando o
   Firebase recusa o envio e, se o destino não estiver autorizado, reenvia sem
   link de retorno.
   - **O Firebase bloqueou a edição dos modelos neste projeto** ("As
     atualizações de modelos de e-mail não estão disponíveis"): não dá para
     trocar remetente, assunto, texto, domínio nem URL de ação pelo console.
     O e-mail segue no padrão; na demonstração, marcar "Não é spam".
   - Pronto no código, à espera de uma saída: o modelo
     `firebase/emails/redefinir-senha.html` e a página `/acao`
     (`AcaoConta.jsx`), que trata redefinir senha, confirmar e-mail novo
     (`verifyAndChangeEmail`) e desfazer troca (`recoverEmail`).
   - **Ideia guardada:** o próprio ParaAí enviar o e-mail (Cloud Function com
     `generatePasswordResetLink` + conta de envio), o que resolve visual e
     spam. Exige o plano Blaze, com cartão, e o dono do projeto preferiu não
     cadastrar por ora. Alternativa grátis: pedir ao suporte do Firebase que
     libere os modelos. Detalhes em `firebase/emails/README.md`.

4. Pagamento é simulado — não há gateway real.

5. **Gabinete 3D:** já desenhado e impresso pelo dono do projeto (06/10/2026),
   ainda não retirado. Falta guardar o modelo em `hardware/gabinete/`, montar a
   placa e conferir janela da tela, USB e toque com a tampa fechada, sem
   reintroduzir sensores ou catraca no ESP.

6. ~~Foto do fundo do login servida pelo próprio site.~~ Feito em 06/10/2026:
   o login e o cadastro trocaram a foto do Unsplash por um fundo desenhado em
   CSS (o pátio visto de cima, como na Home). Nenhuma página usa mais foto
   externa.

7. ~~Gravar no totem o firmware da `main`.~~ Feito em 06/10/2026 pela COM3
   (1.405.792 bytes, gravação conferida pelo hash). Teste: entrada de uma placa
   sem direito declarado recebeu a vaga comum, não a PCD. Para gravar de novo:
   placa na COM3 e modo de gravação (segurar BOOT, apertar RST, soltar BOOT).

8. **Modelo e cor do veículo (08/10/2026, PR próprio).** Para funcionar por
   inteiro, nesta ordem: publicar as regras (sem elas, o Perfil não salva
   modelo e cor, mas o cadastro da placa continua funcionando), publicar o
   site e gravar o firmware novo, que mostra "GOL PRATA" e copia modelo e cor
   para a vaga. Qualquer ordem é segura: firmware antigo continua aceito pelas
   regras novas, e o firmware novo só copia o que as regras deixaram gravar.
   Falta testar no hardware.

9. **Saldo protegido e extrato (09/10/2026, PR próprio).** Publicar as regras
   e logo em seguida o site: entre uma coisa e outra, a recarga falha (o saldo
   não muda). Depois, fazer uma recarga e conferir o extrato no Perfil.

10. **App instalável (09/10/2026, PR próprio).** Depois de publicar o site,
    instalar no celular (Android: menu e "Instalar o app"; iPhone: Compartilhar
    e "Adicionar à Tela de Início"), abrir pelo ícone e ligar o modo avião para
    ver a página sem internet. O pedido de instalação do navegador só foi
    simulado nos testes locais.

11. **Privacidade e LGPD (09/10/2026, PR próprio).** Publicar as regras e o
    índice (`firebase deploy --only firestore`) e depois o site. Para conferir:
    criar uma conta de teste, cadastrar uma placa, baixar os dados, excluir a
    conta e cadastrar a mesma placa com outra conta, que não deve ver as
    estadias anteriores.

12. **Testes automáticos (09/10/2026, PR próprio).** Rodam sozinhos em cada
    PR. Para publicar, só o site, que leva a correção do aviso vermelho falso
    logo depois do cadastro. Regras e firmware não mudam.

13. **Roteiro da apresentação (09/10/2026, PR próprio).** Seguir "Antes do
    dia" em `docs/apresentacao.md`. Para publicar, só o site, que tira do ar
    o simulador antigo em `/totem.html`. Preparar a demonstração sem internet
    no notebook da apresentação (Node 22, Java 21 e `npm ci` em `web/` e
    `e2e/`, com internet) e abri-la uma vez antes do dia.

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

**Vaga especial por direito declarado (02/10/2026).** O motorista declara no
cadastro ou no Perfil se tem direito a vaga PCD, 60+ ou gestante
(autodeclaração com confirmação; na vida real a credencial fica no painel do
carro e é fiscalizada no local). O valor fica na conta e no veículo
(`vagaEspecial`), que é o que o totem lê. Sem reserva, o totem dá a primeira
vaga livre do tipo declarado e, se não houver, uma comum; quem não declarou
nunca recebe vaga especial, nem pelo totem nem por reserva. Na reserva quem
confere são as regras do Firestore; na entrada pelo totem, é o firmware (as
regras não olham o tipo da vaga na entrada). O tipo de cada vaga segue a mesma regra no site
(`obterTipoVaga`), no totem (`tipoDaVaga`) e nas regras (`tipoDaVaga`): o
campo `tipo` do mapa público (definido pelo administrador no painel, vaga a
vaga) ou, só quando a vaga não tem esse campo, a tabela padrão da
demonstração. O totem relê o mapa a cada entrada: mudar o tipo no painel vale
na entrada seguinte, sem regravar o firmware.
É dado sensível: gravar só o tipo declarado, e apagar o campo quando a pessoa
deixa de declarar.

**Design segue as diretrizes da Apple dentro da identidade.** Contraste AA nos
dois temas, texto mínimo de 12 px, hover só em `@media (hover: hover)`,
resposta no `:active`, animação só em `transform`/`opacity`. Ao criar um
componente, usar os tokens de `index.css` (`--esp-*`, `--dur-*`,
`--mola-critica`, `--rotulo-*`). Tamanho de texto só pelos tokens `--t-*`
(nada de `font-size` avulso), cores de vaga especial só por `--vaga-*`, área
de toque mínima de 44 px, e cada componente com uma folha própria: nenhuma
outra folha estiliza as classes dele (a ordem de carregamento do CSS muda
entre páginas e entre o modo de desenvolvimento e o build).

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

**Excluir a conta não apaga as estadias (09/10/2026).** Elas são o registro
de entradas, saídas e faturamento do estacionamento e ficam só com a placa,
sem nome, e-mail ou celular. O que é só da pessoa (perfil, extrato, reserva,
modelo, cor e vaga especial) é apagado. Só o motorista se exclui pelo site;
dono de estacionamento e administrador são encerrados pela administração.

**Modelo e cor vêm do cadastro do motorista, não de consulta pela placa
(08/10/2026).** Não há consulta oficial gratuita (a do SINESP saiu do ar e a
Senatran só mostra os veículos da própria conta); as APIs pagas cobram de R$ 4
a R$ 8 por consulta e exigiriam guardar a chave num servidor (plano Blaze, com
cartão). O motorista informa marca, modelo e cor uma vez no Perfil, com uma
lista nossa de marcas e modelos comuns (`web/src/utils/veiculo.js`) e não a
Tabela FIPE, que cadastra cada versão ("Gol (novo) 1.0 Mi Total Flex 8V 4p")
e não caberia na tela do totem. Nomes sem acento, até 20 caracteres, como no
documento do carro; cores da tabela do RENAVAM. A mesma regra está em
`firestore.rules`, no site e em `LogicaTotem.h`. Todo totem lê o veículo e
portanto vê modelo e cor. O dono do estacionamento e o administrador **não**
leem o veículo, que tem o saldo: veem modelo e cor na vaga, onde o totem os
copia na entrada e apaga na saída, então só enquanto o carro está no pátio.

---

## Armadilhas conhecidas

**Posicionamento de texto no totem** usa a baseline com altura de fonte fixa,
não `getTextBounds` no eixo Y. Dependendo da versão da biblioteca aquele valor
vem diferente e o texto sobe ~17px, invadindo o elemento de cima.

**Largura de texto no totem** é medida sem quebra de linha (`larguraTexto`
chama `setTextWrap(false)`). Com a quebra ligada, `getTextBounds` mede só até a
borda da tela, e um texto mais largo que ela parecia caber.

**No tema claro o âmbar tem dois papéis:** `--accent` preenche superfícies e
leva texto escuro por cima; `--accent-text` pinta texto sobre fundo claro.
Usar o mesmo tom nos dois reprova em um dos casos.

**Texto sobre verde e vermelho cheios** usa `--success-contrast` e
`--danger-contrast`, nunca `#fff` fixo: no tema escuro esses tons são claros e
o branco fica em 2:1 e 3,2:1. No claro, verde, vermelho e âmbar de texto
passam em 4,5:1 também sobre os próprios fundos suaves.

**Saldo não se grava direto.** Qualquer crédito novo precisa do registro em
`veiculos/{placa}/recargas` no mesmo lote, como faz `adicionarSaldo`
(`services/veiculos.js`); um `updateDoc` com `saldo` é recusado pelas regras.

**Regra que existe em três lugares muda nos três, e em `contratos/`.** A
conta da estadia, a tabela das vagas especiais e o formato da placa estão no
site, no firmware e nas regras. Mudar só um deles faz o CI falhar; mude o CSV
de `contratos/` e as três implementações no mesmo PR.

**O perfil pode chegar "inexistente" logo depois do cadastro.** Uma leitura
atrasada do servidor ainda diz que `users/{uid}` não existe. Nada que grave
o perfil pode confiar só nesse aviso: o auto-reparo confere numa transação.

**O totem simulado repete o firmware.** O teste do fluxo completo e a
demonstração sem internet usam `e2e/patio.js`, que faz as mesmas leituras e
gravações de `firmware/totem/Atendimento.cpp`. Ao mudar o que o totem lê ou
grava, mude o `patio.js` no mesmo PR: as regras recusam só parte das
diferenças, e o resto passaria sem ninguém notar.

**Estadias de uma placa se consultam com o limite.** Use
`consultaHistoricoDaPlaca(placa, inicioDoHistorico(veiculo))`
(`services/historico.js`). Uma consulta só pela placa é recusada pelas regras
quando a placa foi liberada por uma exclusão de conta.

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

**Service worker só no site publicado.** `registrarServiceWorker` (`src/pwa.js`)
não roda no `npm run dev`; para testar, use `npm run build` e `npm run preview`.
Ao mudar `public/offline.html`, troque `VERSAO` em `public/sw.js`, senão o
celular continua com a página guardada antes. O service worker não deve passar
a guardar arquivos de tela nem respostas do Firebase: o site conta com cada
publicação chegando na hora.

**Vite pode servir arquivo vazio** depois de certas edições. Se um componente
sumir sem erro no console, limpe `node_modules/.vite` e reinicie.
