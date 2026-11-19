# Roteiro da apresentação

Guia para a feira de 04/12/2026: o que preparar antes, a demonstração curta
que se repete para cada visitante, a completa para quem quer ver mais, o que
fazer quando algo falha e as perguntas que costumam aparecer. A demonstração
usa o site publicado (<https://paraai.web.app>) e o totem de verdade. O plano
B roda o sistema inteiro no notebook, sem internet.

Numa feira, o público passa e fica poucos minutos, o totem fica ligado por
horas e quem usa é o próprio visitante. Por isso a demonstração curta é o
centro, o mapa ao vivo fica o tempo todo numa tela e as placas usadas são as
dos cartões de demonstração, nunca a placa de verdade do visitante.

Situação em 18/11/2026: o site no ar e o firmware do totem são da `main`
`539668b`, e todas as conferências passaram (ver
[Conferência na véspera](#conferência-na-véspera)). O que ainda falta está
marcado em cada item de "Antes do dia".

## Antes do dia

1. **Publicar a versão final.** Na raiz do repositório, primeiro as regras e o
   índice, depois o site:

   ```bash
   firebase deploy --only firestore    # se perguntar se apaga índices, responda que não
   npm --prefix web run build
   firebase deploy --only hosting
   ```

   **Feito em 18/11/2026:** regras e índice de 15/11 e o site da `main`
   `539668b`. Só publique de novo se a `main` mudar, sempre as regras antes
   do site.

2. **Gravar no totem o firmware da `main`** (passo a passo e volta atrás em
   [firmware/README.md](../firmware/README.md#gravar-a-versão-da-feira-e-voltar-atrás))
   e testar entrada, saída, a troca de Wi-Fi pela tela e o modelo e a cor
   ("GOL PRATA") de uma placa com o Perfil preenchido. Grave antes de fechar o
   gabinete, que não deixa o botão BOOT à mão. Depois de fechado, deixe o
   totem ligado por pelo menos 4 horas seguidas, fazendo entradas e saídas de
   vez em quando, para ver se ele aguenta o dia da feira.

   **Gravado em 18/11/2026** (`539668b`) e testado com uma entrada. Faltam a
   saída, a troca de Wi-Fi, o modelo e a cor e as 4 horas ligado. Para gravar
   de novo, a placa só entra no modo de gravação segurando BOOT, apertando RST
   e soltando BOOT, e só grava a 115200. Depois de apagar a memória, o
   primeiro boot pede a calibração do toque.
3. **Criar as contas da demonstração no site publicado**, pelo próprio site.
   Anote e-mails e senhas num papel, nunca no repositório.

   | Conta | Para quê | Como deixar pronta |
   |---|---|---|
   | Motorista pronto | A placa dos cartões e o cadastro que falhar | Placa, modelo e cor no Perfil e uma recarga simulada de R$ 200, que cobre muitas voltas de poucos minutos |
   | Motorista com direito 60+ (ou PCD) | Mostrar o totem levando a pessoa para a vaga especial | Outra placa e o direito declarado no Perfil |
   | Administrador | Painel da rede, vagas ao vivo e maquete | A conta de vocês com `role: "admin"`, trocado no console do Firebase (o site não cria administrador) |
   | Estacionamento em análise | Mostrar a aprovação de um pátio novo | Cadastro em "Tenho um estacionamento" com outro e-mail; o pedido fica esperando no painel da rede. Depois da feira, oculte o pátio dos motoristas |
   | Cadastro ao vivo | Mostrar o cadastro para um avaliador | Um e-mail ainda sem conta; no Gmail, `seunome+feira@gmail.com` chega na mesma caixa |

4. **Marcar "Não é spam".** O e-mail de recuperação de senha ainda sai no
   modelo padrão do Firebase e cai no spam (ver `ESTADO.md`). Peça uma
   recuperação para a conta pronta e marque a mensagem como "Não é spam".
5. **Gravar o vídeo do fluxo completo**, na ordem abaixo, com o celular
   filmando o totem e a tela. É o plano B se o totem ou a internet falharem.
   Guarde uma cópia no notebook e outra no celular, fora da nuvem.
6. **Deixar o hotspot do celular salvo no totem.** O ESP32 só enxerga redes de
   2,4 GHz (no iPhone, ligue "Maximizar compatibilidade"). No totem, segure o
   status do canto superior direito por 3 segundos, digite o PIN e escolha
   TROCAR WIFI.
7. **Preparar a demonstração sem internet no notebook** (ver
   [abaixo](#demonstração-sem-internet)), uma vez, com internet.
   **Testada em 18/11/2026** no computador do Nicolas: sobe em menos de 30
   segundos, e a entrada, a saída e a recusa da placa com saldo pendente
   funcionaram.
8. **Imprimir os cartões de placa**: dois ou três cartões com as placas das
   contas prontas (a comum e a 60+), para o visitante digitar no totem. Assim
   nenhuma placa de verdade de visitante fica gravada no banco (LGPD), e cada
   entrada cai numa conta com saldo.
9. Opcional: um cartaz com o QR code de <https://paraai.web.app>, para o
   visitante abrir o site no próprio celular.
10. Opcional: instalar o app no celular ("Instalar o app" no menu da conta;
   no iPhone, Compartilhar e "Adicionar à Tela de Início").

## Conferência na véspera

Um dia antes, rode tudo de novo na `main` que vai para a feira. Os testes usam
só os emuladores e nunca tocam no Firebase de produção. As regras, o fluxo
completo e a demonstração sem internet precisam do Java 21.

| O quê | Onde e como | Resultado em 18/11/2026 |
|---|---|---|
| Site | `web/`: `npm ci`, `npm run lint`, `npm test` e `npm run build` | 30 testes e o build |
| Regras | `firebase/test/`: `npm ci` e `npm test` | 123 testes |
| Fluxo completo | `e2e/`: `npm ci`, `npx playwright install chromium` e `npm test` | 8 testes, no computador e no celular |
| Firmware | `firmware/test/`: os comandos de [Verificação](../firmware/README.md#verificação-e-instalação-controlada) | Lógica e 43 telas |
| Plano B | `e2e/`: `npm run apresentacao`, depois `entrada`, `saida` e `sair` | Entrada, saída e recusa por saldo pendente |
| Site no ar | As páginas públicas no celular, nos dois temas, e um endereço que não existe | Tudo certo, sem erros no console |
| Totem | Serial a 115200 e `S`: Wi-Fi conectado, `estado=4` e o acesso do `Credenciais.h` | Pronto, com uma entrada |

## Checklist do dia

- [ ] Hotspot ligado, em 2,4 GHz, com internet e o notebook conectado nele.
- [ ] Totem ligado na tomada (o carregador portátil fica de reserva), com
      ENTRADA e SAÍDA na tela e ONLINE no status, não CONECTANDO.
- [ ] Notebook na tomada, no hotspot, com as abas abertas e já logadas: painel
      do administrador, vagas ao vivo e a maquete. Suspensão e protetor de tela
      desligados, para a maquete ficar no ar o dia todo.
- [ ] Cartões de placa na mesa, ao lado do totem.
- [ ] Celular com a conta do motorista pronto aberta, "Na rua" e sem reserva.
- [ ] Modo não perturbe no notebook e no celular; brilho no máximo.
- [ ] Vídeo do fluxo no notebook e no celular.
- [ ] Demonstração sem internet abrindo no notebook (`npm run apresentacao`).
- [ ] Papel com as contas e senhas, e o PIN do totem.

## Quem faz o quê

Com duas pessoas no estande, uma fica no totem e a outra no notebook:

- **No totem:** recebe o visitante, entrega o cartão de placa, guia a
  ENTRADA e a SAÍDA e confere que toda volta termina com a saída.
- **No notebook e no celular:** mostra o mapa ao vivo e o celular do
  motorista e responde às perguntas técnicas.

Troquem de lugar de tempos em tempos. Com uma pessoa só, fique na
demonstração curta e deixe o mapa na tela.

## Demonstração curta (2 a 3 minutos, para cada visitante)

1. **Uma frase:** "O ParaAí é uma rede de estacionamentos em que o motorista
   paga pelo app e o totem registra a entrada e a saída pela placa."
2. **O visitante usa o totem:** ENTRADA, escolhe o tipo da placa, digita a do
   cartão e confirma. O totem mostra a vaga, com o modelo e a cor do carro.
3. **Mostre a tela do mapa:** a vaga ficou ocupada sozinha, sem recarregar.
   No celular, a conta do motorista mostra "Estacionado".
4. **O visitante faz a SAÍDA** com a mesma placa: o totem mostra o valor pelo
   tempo exato e o celular mostra o débito e o comprovante. Numa volta de
   segundos, o valor é R$ 0,01: a cobrança é pelo tempo exato, sem arredondar
   para a hora.
5. **Uma frase de fecho:** "Tudo isso passa por regras de segurança no banco,
   testadas automaticamente a cada mudança."

Sempre feche a volta com a SAÍDA. Uma entrada sem saída deixa a vaga ocupada,
e na próxima vez o totem recusa a mesma placa. Se alguém sair sem fazer a
saída, faça você mesmo antes do próximo visitante.

## Fala de 1 minuto (para avaliadores)

Antes da demonstração completa, em cinco frases:

1. **Problema:** estacionar ainda é pegar ticket, procurar o caixa e esperar
   troco.
2. **Solução:** no ParaAí, o motorista digita a placa no totem, o totem indica
   a vaga e, na saída, o app desconta só o tempo usado.
3. **Como funciona:** o totem (um ESP32 com tela de toque), o site de
   motoristas, donos e administração, e o Firebase, com os dados e as regras
   de segurança.
4. **Diferenciais:** tarifa travada na entrada, reserva grátis, vagas PCD, 60+
   e gestante, comprovante no celular e a mesma conta de cobrança no site, no
   totem e nas regras, testada a cada mudança.
5. **Limites:** é um protótipo acadêmico, a recarga é simulada e o totem não
   tem cancela.

## Demonstração completa (para avaliadores e quem quer ver mais)

| # | Onde | O que mostrar | O que destacar |
|---|---|---|---|
| 1 | Notebook, sem login | Página inicial: arrastar o carro até uma vaga no pátio interativo | A vaga PCD recusa e explica por quê |
| 2 | Celular | Cadastro com nome, e-mail, celular e o aceite da política de privacidade | O aceite fica registrado com data e versão (LGPD) |
| 3 | Celular | Perfil: placa, marca, modelo e cor | É o que o totem mostra na entrada |
| 4 | Celular | "Adicionar saldo": recarga simulada pelo Pix | É simulada, para fins acadêmicos; o saldo só sobe com o registro da recarga, conferido pelas regras |
| 5 | Celular | Estacionamentos, "Abrir mapa de vagas": tocar numa vaga PCD (recusada sem o direito) e reservar uma comum | Reserva grátis por 30 minutos |
| 6 | Totem | ENTRADA, tipo da placa, digitar, CONFIRMAR | "Vaga reservada N", com o modelo e a cor do carro |
| 7 | Projetor (administrador) | Vagas ao vivo e a maquete em tela cheia; no celular, "Estacionado" | Tudo muda sozinho, sem recarregar a página |
| 8 | Totem (opcional) | Entrada do motorista 60+, sem reserva | O totem escolhe a primeira vaga 60+ livre |
| 9 | Totem | SAÍDA, digitar a placa, CONFIRMAR | Valor pelo tempo exato, com a tarifa congelada na entrada |
| 10 | Celular | Painel "Na rua", o comprovante (Imprimir ou salvar PDF) e o extrato no Perfil | Débito, recibo e vaga livre gravados juntos |
| 11 | Projetor (administrador) | Painel da rede: recebido no período, totens online, movimentações e o CSV | Visão da rede inteira de estacionamentos |
| 12 | Projetor (administrador) | "Pedidos para entrar na rede": aprovar o estacionamento em análise; depois, entrar com a conta dele | Só a equipe aprova; na hora, o pátio entra no mapa e a conta ganha o painel de dono |
| 13 | GitHub (opcional) | Actions verdes: contratos, regras e fluxo completo | A conta da cobrança é a mesma no site, no totem e nas regras, testada em cada PR |

Com pouco tempo, fique com 2, 5, 6, 7, 9 e 10. Para quem pergunta como um
totem novo entra na rede: no Perfil do dono, "Segurança do totem", gere o
código de 8 letras e mostre na tela; um totem novo pede esse código depois do
Wi-Fi e se instala sozinho (o da feira usa o acesso fixo e não precisa).

## Plano B

| Se acontecer | Faça |
|---|---|
| A internet do local não funciona | Use o hotspot do celular, que já está salvo no totem |
| O totem mostra CONECTANDO ou SEM WI-FI | Tire e ponha o cabo USB (ou aperte RST, se o gabinete deixar). Se não voltar logo, confira a rede em TROCAR WIFI |
| O toque do totem erra | Menu do PIN, RECALIBRAR TOUCH |
| O toque não responde logo depois de gravar o firmware | Com a memória apagada, o primeiro boot pede a calibração: aperte RST e toque no centro das quatro miras (cada uma espera 30 segundos) |
| O totem não volta | Mostre a parte do totem pelo vídeo e siga no site; ou passe para a demonstração sem internet, onde o totem é simulado |
| O cadastro ao vivo falha | Entre com o motorista pronto |
| O e-mail de recuperação não chega | A demonstração não depende dele: entre com a conta pronta |
| O site publicado não abre, ou não há internet nenhuma | Demonstração sem internet no notebook, ou o vídeo |
| O projetor não reconhece o notebook | Leve adaptador; em último caso, mostre pelo celular |

## Demonstração sem internet

O mesmo site, rodando no notebook e ligado aos emuladores do Firebase com as
regras do repositório. Já vem com contas prontas, estadias dos últimos dias no
painel da rede e o totem simulado no terminal, com as mesmas leituras e
gravações do firmware. Nada vai para o Firebase de produção, e cada vez que
roda começa do zero.

**Preparar, uma vez, com internet:** instale o Node.js 22 e o Java 21 (por
exemplo, o Temurin 21), rode `npm ci` em `web/` e em `e2e/` e depois
`npm run apresentacao` em `e2e/` (a primeira vez baixa os emuladores). Sem o
Java 21 instalado, o JRE portátil que os testes do firmware usam
(`firmware/test/.runtime/`, fora do Git) também serve: ponha o `bin` dele no
PATH antes de rodar.

**No dia:** em `e2e/`, `npm run apresentacao`. Quando aparecer `totem>`, abra
<http://127.0.0.1:5180> no navegador do notebook.

| Conta (senha `Banca2026`) | O que tem |
|---|---|
| `admin@paraai.test` | Painel da rede, vagas ao vivo e maquete |
| `dono@paraai.test` | Painel do Pátio da Banca e movimentações |
| `marina@paraai.test` | Placa TCC2E26, Gol prata, saldo na carteira |
| `antonio@paraai.test` | Placa BRA2E19, Uno branco, direito a vaga 60+ |
| `ana@paraai.test` | Pedido do Estacionamento Central, esperando a aprovação no painel da rede |
| Qualquer e-mail novo | Para o cadastro ao vivo |

| No terminal | O totem faz |
|---|---|
| `entrada TCC2E26` | Registra a entrada; usa a vaga reservada no app, se houver |
| `saida TCC2E26` | Registra a saída e a cobrança |
| `vagas` | Mostra o pátio |
| `contas` | Mostra as contas e os comandos de novo |
| `sair` | Encerra tudo (Ctrl+C também) |

A placa GHI7J89 ficou com uma estadia sem saldo: a entrada dela é recusada,
como acontece com quem está em dívida. Placa nova é cadastrada no totem, sem
dono, como no CONFIRMAR da tela. O cadastro de estacionamento ao vivo precisa
de internet, porque o endereço vem do CEP; sem ela, mostre a aprovação com o
pedido da `ana@paraai.test`.

Limites: só abre no próprio notebook (para a tela de celular, use o modo de
dispositivo do navegador, no F12) e o totem é simulado; diga isso ao visitante.
As fontes da marca vêm junto com o site, então aparecem mesmo sem internet.

## Perguntas que costumam aparecer

**E se o motorista mudar o saldo pelo navegador?** As regras do banco só
deixam o saldo subir junto com um registro de recarga novo, do mesmo valor,
entre R$ 0,01 e R$ 1.000. O teste das regras tenta e é recusado
(`firebase/test/`).

**Qualquer um pode registrar a placa de outra pessoa no totem?** Hoje, sim,
como num estacionamento de ticket. As saídas estudadas são um código de
entrada gerado no app (a recomendada), um PIN pessoal ou a aprovação no
celular. Fica como trabalho futuro.

**Qualquer um pode pôr um estacionamento na rede?** Não. O dono se cadastra
e manda um pedido, e só a administração aprova. A aprovação cria o pátio no
nome de quem pediu, publica no mapa e libera o painel de dono num lote só, que
as regras conferem inteiro. Enquanto isso, a conta em análise só vê o próprio
pedido.

**Como o totem se autentica?** Cada totem tem uma conta própria. As regras
deixam cada um fazer só o que o atendimento precisa (entrada, saída, placa
nova e o sinal de vida), e só no próprio estacionamento. O administrador
bloqueia um totem pelo painel.

**Como se instala um totem novo?** O dono gera no site um código de 8 letras,
que vale 15 minutos e uma vez só. O totem pede o código depois do Wi-Fi, cria
a própria conta e se liga ao estacionamento. Ninguém precisa de computador nem
de mexer no código do firmware.

**Por que não tem sensor nem cancela?** Decisão de 09/09/2026: o totem é de
atendimento e a ocupação é lógica, vinda da estadia registrada. Sem cancela,
a saída sempre é registrada; o que o saldo não cobre fica pendente e bloqueia
a próxima entrada.

**E se a internet do totem cair?** Ele não confirma nem guarda operações para
depois. Se a conexão cai no meio de uma gravação, a tela pede para conferir o
registro no painel, e o totem nunca repete a gravação sozinho. As estadias
ficam no Firebase, então um reinício não perde o carro estacionado.

**Como garantem que o site, o totem e o banco cobram o mesmo valor?** Os
casos esperados ficam em `contratos/` e são testados nas três partes em cada
PR. Por exemplo, 9 minutos a R$ 8,50 dão R$ 1,27 nas três.

**E a LGPD?** Política de privacidade, aceite registrado no cadastro, "Baixar
meus dados" e "Excluir minha conta". O direito a vaga especial só é guardado
quando a pessoa declara.

**O pagamento é real?** Não. A recarga é simulada, para fins acadêmicos.
Pagamento real exigiria um intermediador de pagamento e conta de empresa.

**Dois carros podem ficar com a mesma vaga?** Não. O totem grava o veículo e a
vaga no mesmo lote, com conferência de versão, e as regras recusam a vaga que
já tem outra placa.

As limitações conhecidas estão no [README](../README.md#limitações-conhecidas-transparência-acadêmica).
