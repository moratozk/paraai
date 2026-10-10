# Roteiro da apresentação

Guia para a banca: o que preparar antes, a ordem da demonstração, o que fazer
quando algo falha e as perguntas que costumam aparecer. A demonstração
principal usa o site publicado (<https://paraai.web.app>) e o totem de verdade.
O plano B roda o sistema inteiro no notebook, sem internet.

## Antes do dia

1. **Publicar a versão final.** Na raiz do repositório, primeiro as regras e o
   índice, depois o site:

   ```bash
   firebase deploy --only firestore    # se perguntar se apaga índices, responda que não
   npm --prefix web run build
   firebase deploy --only hosting
   ```

2. **Gravar no totem o firmware da `main`** e testar entrada, saída, a troca de
   Wi-Fi pela tela e o modelo e a cor ("GOL PRATA") de uma placa com o Perfil
   preenchido. Grave antes de fechar o gabinete, que não deixa o botão BOOT à
   mão.
3. **Criar as contas da demonstração no site publicado**, pelo próprio site.
   Anote e-mails e senhas num papel, nunca no repositório.

   | Conta | Para quê | Como deixar pronta |
   |---|---|---|
   | Motorista pronto | Usar se o cadastro ao vivo falhar | Placa, modelo e cor no Perfil e uma recarga simulada de R$ 50 |
   | Motorista com direito 60+ (ou PCD) | Mostrar o totem levando a pessoa para a vaga especial | Outra placa e o direito declarado no Perfil |
   | Administrador | Painel da rede, vagas ao vivo e maquete | A conta de vocês com `role: "admin"`, trocado no console do Firebase (o site não cria administrador) |
   | Cadastro ao vivo | Mostrar o cadastro na frente da banca | Um e-mail ainda sem conta; no Gmail, `seunome+banca@gmail.com` chega na mesma caixa |

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
8. Opcional: instalar o app no celular ("Instalar o app" no menu da conta;
   no iPhone, Compartilhar e "Adicionar à Tela de Início").

## Checklist do dia

- [ ] Hotspot ligado, em 2,4 GHz, com internet e o notebook conectado nele.
- [ ] Totem ligado na tomada ou num carregador portátil, com ENTRADA e SAÍDA na
      tela e ONLINE no status, não CONECTANDO.
- [ ] Notebook carregado, no hotspot, com as abas abertas e já logadas: painel
      do administrador, vagas ao vivo e a maquete.
- [ ] Celular com a conta do motorista pronto aberta, "Na rua" e sem reserva.
- [ ] Modo não perturbe no notebook e no celular; brilho no máximo.
- [ ] Vídeo do fluxo no notebook e no celular.
- [ ] Demonstração sem internet abrindo no notebook (`npm run apresentacao`).
- [ ] Papel com as contas e senhas, e o PIN do totem.

## Ordem da demonstração

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
| 12 | GitHub (opcional) | Actions verdes: contratos, regras e fluxo completo | A conta da cobrança é a mesma no site, no totem e nas regras, testada em cada PR |

Com pouco tempo, fique com 2, 5, 6, 7, 9 e 10.

## Plano B

| Se acontecer | Faça |
|---|---|
| A internet do local não funciona | Use o hotspot do celular, que já está salvo no totem |
| O totem mostra CONECTANDO ou SEM WI-FI | Tire e ponha o cabo USB (ou aperte RST, se o gabinete deixar). Se não voltar logo, confira a rede em TROCAR WIFI |
| O toque do totem erra | Menu do PIN, RECALIBRAR TOUCH |
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
`npm run apresentacao` em `e2e/` (a primeira vez baixa os emuladores).

**No dia:** em `e2e/`, `npm run apresentacao`. Quando aparecer `totem>`, abra
<http://127.0.0.1:5180> no navegador do notebook.

| Conta (senha `Banca2026`) | O que tem |
|---|---|
| `admin@paraai.test` | Painel da rede, vagas ao vivo e maquete |
| `dono@paraai.test` | Painel do Pátio da Banca e movimentações |
| `marina@paraai.test` | Placa TCC2E26, Gol prata, saldo na carteira |
| `antonio@paraai.test` | Placa BRA2E19, Uno branco, direito a vaga 60+ |
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
dono, como no CONFIRMAR da tela.

Limites: só abre no próprio notebook (para a tela de celular, use o modo de
dispositivo do navegador, no F12) e o totem é simulado; diga isso à banca.
Sem internet nenhuma, o site aparece com a fonte do sistema no lugar da fonte
da marca.

## Perguntas que a banca costuma fazer

**E se o motorista mudar o saldo pelo navegador?** As regras do banco só
deixam o saldo subir junto com um registro de recarga novo, do mesmo valor,
entre R$ 0,01 e R$ 1.000. O teste das regras tenta e é recusado
(`firebase/test/`).

**Qualquer um pode registrar a placa de outra pessoa no totem?** Hoje, sim,
como num estacionamento de ticket. As saídas estudadas são um código de
entrada gerado no app (a recomendada), um PIN pessoal ou a aprovação no
celular. Fica como trabalho futuro.

**Como o totem se autentica?** Cada totem tem uma conta própria. As regras
deixam cada um fazer só o que o atendimento precisa (entrada, saída, placa
nova e o sinal de vida), e só no próprio estacionamento. O administrador
bloqueia um totem pelo painel.

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
