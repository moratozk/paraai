# Como trabalhar em dupla no ParaAí

Este é o guia de entrada para os dois autores do TCC. O código compartilhado
fica em **https://github.com/moratozk/paraai**. Cada pessoa usa a própria conta
do GitHub e o próprio assistente: o Nicolas usa o Claude e o Lucas usa o Codex
(ChatGPT).

As conversas dos assistentes não são uma conversa única. O que mantém os dois
sincronizados é o GitHub: código, histórico, branches, revisões e o arquivo
`ESTADO.md`. O arquivo `AGENTS.md` faz os dois assistentes seguirem os mesmos
acordos sempre que o projeto for aberto, inclusive o de não mexer na branch nem
no pull request do outro.

## Primeira configuração no computador do colaborador

1. Aceite o convite do repositório no GitHub, caso ainda esteja pendente.
2. Instale Git, Node.js LTS, Codex e, se for trabalhar no hardware, Arduino IDE
   2.
3. No Codex, conecte a própria conta do GitHub.
4. Clone o projeto:

   ```bash
   git clone https://github.com/moratozk/paraai.git
   cd paraai
   ```

5. Abra no Codex a pasta **`paraai` inteira**, e não somente `web` ou `firmware`.
6. Para rodar o site:

   ```bash
   cd web
   npm install
   npm run dev
   ```

7. Copie `web/.env.example` para `web/.env`. Os valores reais do Firebase devem
   ser enviados em canal privado; nunca pelo GitHub, pull request ou conversa
   pública.

Para o firmware, copie `firmware/totem/Credenciais.example.h` para
`firmware/totem/Credenciais.h`. Credenciais reais de Wi-Fi e do totem também
ficam apenas no computador que grava o equipamento.

### Já tinha o projeto clonado antes da reorganização de pastas?

Em 02/10/2026 as pastas ganharam nomes padrão (`Main/` virou
`firmware/totem/` e `Web/` virou `web/`; o mapa completo está no `ESTADO.md`).
O `git pull` move os arquivos versionados, mas o que existe só no seu
computador fica na pasta antiga. Depois de atualizar:

1. Mova `Main/Credenciais.h` para `firmware/totem/Credenciais.h`.
2. Se a pasta do site continuar como `Web` (W maiúsculo), feche editores e
   terminais abertos nela e renomeie para `web`; o `.env` e o `node_modules`
   vão junto.
3. Apague a pasta `Main/` que sobrar (só terá arquivos de build antigos).
4. Na Arduino IDE, abra `firmware/totem/totem.ino`.

## Rotina para qualquer alteração

### 1. Comece atualizado

```bash
git switch main
git pull origin main
git switch -c seu-nome/resumo-da-tarefa
```

Exemplos: `lucas/corrige-cadastro`, `morato/painel-financeiro` ou
`codex/melhora-menu-mobile`. O Claude do Nicolas cria branches `claude/...`.

### 2. Trabalhe com seu próprio assistente

Mensagem recomendada ao começar uma tarefa:

> Leia AGENTS.md, README.md e ESTADO.md por completo. Confira o estado do Git e
> os pull requests abertos do outro autor, sem mexer neles, e trabalhe apenas
> nesta branch. Preserve a integração entre Web, Firebase e ESP32. Implemente a
> tarefa, teste o que foi alterado e mostre o resultado antes de fazer commit.

### 3. Salve e envie a branch

Peça ao assistente:

> Revise as mudanças, rode as verificações necessárias, faça um commit com
> mensagem clara, envie esta branch ao GitHub e abra um pull request para main,
> ou tire do rascunho o que já estava aberto.

### 4. O outro integrante revisa

O outro autor abre o pull request, confere a tela e o funcionamento, aprova e
então une a mudança com `main`. Se os dois mudarem a mesma parte ao mesmo tempo,
conversem antes de resolver o conflito.

## Regras simples que evitam perder trabalho

- Nunca compartilhem a mesma branch para duas tarefas simultâneas.
- Branch e pull request são de quem os abriu. Para sugerir mudança no pull
  request do outro, comentem nele ou abram outro a partir de `main`.
- Abram o pull request em rascunho logo no começo da tarefa, para o outro ver o
  que está em andamento.
- Nunca usem `git push --force` em `main`.
- Não copiem pastas manualmente por WhatsApp, Drive ou pendrive para juntar
  versões; usem branches e pull requests.
- Antes de começar uma nova tarefa, sempre atualizem `main`.
- Um pull request deve tratar de uma mudança coerente, sem misturar tarefas sem
  relação.
- Nunca coloquem `.env`, `Credenciais.h`, senhas ou tokens no GitHub.

## Firebase

Para alterar apenas o código, o acesso ao GitHub é suficiente. Para publicar o
site, regras ou administrar usuários, o colaborador também precisa ser
adicionado em **Firebase Console > Configurações do projeto > Usuários e
permissões** com a menor permissão necessária.

Depois de receber acesso, ele executa no próprio computador:

```bash
npm install -g firebase-tools
firebase login
firebase use paraai-9514f
```

Somente uma pessoa deve fazer cada publicação combinada. Antes de publicar,
confirme que o pull request já entrou em `main` e que o computador está nessa
versão.

## Links

- Repositório: https://github.com/moratozk/paraai
- Pull requests: https://github.com/moratozk/paraai/pulls
- Site publicado: https://paraai.web.app
