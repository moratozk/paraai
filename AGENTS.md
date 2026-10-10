# Instruções compartilhadas do projeto ParaAí

Este arquivo é a memória técnica comum dos assistentes que trabalham neste
repositório. Antes de alterar qualquer coisa, leia também `README.md` e
`ESTADO.md`.

## Objetivo

O ParaAí é um TCC composto por:

- `web/`: painel React/Vite integrado ao Firebase, incluindo administração
  central da rede.
- `firmware/`: firmware Arduino do totem de atendimento (sketch em
  `firmware/totem/`): placa ESP32 CYD de 2,8" de duas portas, tela ST7789 e
  touch XPT2046, sem sensores nem servo/catraca física.
- `firebase/firestore.rules`: regras de acesso do banco em produção, com
  testes no emulador em `firebase/test/`.

Preserve o fluxo completo entre painel, Firebase e totem. Uma mudança em um
componente não pode quebrar os outros.

## Acordos de trabalho

- Nunca trabalhe diretamente em `main`. Crie uma branch curta e descritiva,
  como `morato/perfil-operador`, `lucas/tela-totem` ou `codex/corrige-login`.
- Antes de editar, atualize a referência remota e confirme que a branch nasceu
  da versão mais recente de `main`.
- Não descarte mudanças locais de outra pessoa e não use comandos destrutivos
  para resolver conflitos.
- Ao concluir, execute as verificações aplicáveis, faça commit, envie a branch
  e abra um pull request. O outro integrante revisa antes da união com `main`.
- Atualize `ESTADO.md` quando mudar arquitetura, configuração, decisões de
  produto, estado do hardware ou pendências relevantes.

## Trabalho em dupla (Claude e Codex)

Os dois autores trabalham ao mesmo tempo, cada um com o próprio assistente: o
Nicolas (`moratozk`) usa o Claude, que cria branches `claude/...`, e o Lucas
(`LucasLopes12`) usa o Codex, com branches `codex/...` ou `lucas/...`. Os
assistentes não enxergam a conversa um do outro; o que mantém os dois em dia é
o GitHub: a `main`, os pull requests e o `ESTADO.md`. Recado para o outro lado
vai na descrição ou num comentário do pull request.

- Antes de começar, confira os pull requests abertos. Se a tarefa mexe nos
  mesmos arquivos ou no mesmo tema de um pull request aberto do outro autor,
  combine com ele antes.
- Abra o pull request em rascunho logo no primeiro commit: é por ele que o
  outro lado sabe o que está em andamento.
- Branch e pull request pertencem a quem os abriu. Não faça commit, push,
  rebase nem force-push na branch do outro autor, e não feche, una nem resolva
  as conversas de revisão do pull request dele por conta própria. Para sugerir
  uma mudança, comente no pull request ou abra outro a partir da `main`.
- Resolva conflitos na sua própria branch, trazendo a `main` com merge e
  mantendo as duas mudanças. Se não estiver claro o que manter, pergunte ao
  outro autor.
- No `ESTADO.md`, acrescente a sua seção ou edite só as linhas do seu tema; não
  reescreva nem apague o que o outro registrou.
- Mudança em decisão de produto, principalmente no totem, é combinada com o
  outro autor antes do pull request.

## Segurança e dados

- Nunca adicione ao Git: `web/.env`, `firmware/totem/Credenciais.h`, senhas de Wi-Fi,
  chaves, tokens, credenciais de totem ou arquivos de conta de serviço.
- Use somente `web/.env.example` e `firmware/totem/Credenciais.example.h` como
  modelos.
- Não enfraqueça `firebase/firestore.rules`. Motoristas acessam apenas os próprios
  dados, operadores antigos apenas o próprio estacionamento, administradores
  gerenciam a rede e totens executam somente as ações necessárias do
  equipamento autorizado. Contas `admin` nunca podem ser criadas ou promovidas
  pelo cliente web.
- O Firebase App Check deve permanecer em modo de monitoramento enquanto o
  ESP32 não tiver uma integração compatível.
- Não publique no Firebase nem grave o ESP32 sem solicitação explícita do
  responsável pelo projeto.

## Verificação mínima

Quando alterar o site, execute em `web/`:

```bash
npm run lint
npm run build
```

Quando alterar `firebase/firestore.rules`, valide as regras antes da publicação. Quando
alterar o firmware, compile para `ESP32 Dev Module` com partição `Huge APP` e
registre no pull request se o teste foi apenas compilado ou também realizado no
hardware.

## Decisões de produto que devem ser preservadas

- A identidade visual aprovada é âmbar sobre asfalto e a logo oficial é
  `web/public/logo.png`; não redesenhe a logo por aproximação.
- O modo claro usa cinza quente, nunca branco puro.
- O site fala com motoristas e donos de estacionamento sem expor jargão de
  hardware na interface.
- A tela inicial do totem mostra somente `ENTRADA` e `SAÍDA`, sem contagem de
  vagas.
- Decisão de 09/09/2026: o ESP terá gabinete impresso em 3D. Ocupação é lógica,
  vinculada à estadia no Firebase; não reintroduzir sensores ou atuadores.
- A maquete virtual (no painel do administrador desde 09/10/2026) só mostra as
  entradas e saídas registradas pelo totem: não simula ocupação nem grava
  dados.
- A recarga é simulada para fins acadêmicos e não deve ser apresentada como
  pagamento real.

## Regras de revisão

- Bloqueie qualquer alteração que exponha segredo, permita acesso entre contas
  ou estacionamentos, quebre login/cadastro ou confirme uma operação com
  veículo, vaga e cobrança em estado incoerente.
- Verifique responsividade, tema claro/escuro e mensagens de erro nas mudanças
  visuais.
- Em mudanças de cobrança, preserve a tarifa congelada na entrada e o cálculo
  entre entrada e saída.
