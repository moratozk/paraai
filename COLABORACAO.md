# Como trabalhar em dupla no ParaAí

Este é o guia de entrada para os dois autores do TCC. O código compartilhado
fica em **https://github.com/moratozk/paraai**. Cada pessoa usa a própria conta
do GitHub e a própria conta do Codex/ChatGPT.

As conversas dos assistentes não são uma conversa única. O que mantém os dois
sincronizados é o GitHub: código, histórico, branches, revisões e o arquivo
`ESTADO.md`. O arquivo `AGENTS.md` faz o Codex dos dois seguir os mesmos acordos
sempre que o projeto for aberto.

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

5. Abra no Codex a pasta **`paraai` inteira**, e não somente `Web` ou `Main`.
6. Para rodar o site:

   ```bash
   cd Web
   npm install
   npm run dev
   ```

7. Copie `Web/.env.example` para `Web/.env`. Os valores reais do Firebase devem
   ser enviados em canal privado; nunca pelo GitHub, pull request ou conversa
   pública.

Para o firmware, copie `Main/Credenciais.example.h` para
`Main/Credenciais.h`. Credenciais reais de Wi-Fi e do totem também ficam apenas
no computador que grava o equipamento.

## Rotina para qualquer alteração

### 1. Comece atualizado

```bash
git switch main
git pull origin main
git switch -c seu-nome/resumo-da-tarefa
```

Exemplos: `lucas/corrige-cadastro`, `morato/painel-financeiro` ou
`codex/melhora-menu-mobile`.

### 2. Trabalhe com seu próprio Codex

Mensagem recomendada ao começar uma tarefa:

> Leia AGENTS.md, README.md e ESTADO.md por completo. Confira o estado do Git e
> trabalhe apenas nesta branch. Preserve a integração entre Web, Firebase e
> ESP32. Implemente a tarefa, teste o que foi alterado e mostre o resultado
> antes de fazer commit.

### 3. Salve e envie a branch

Peça ao Codex:

> Revise as mudanças, rode as verificações necessárias, faça um commit com
> mensagem clara, envie esta branch ao GitHub e abra um pull request para main.

### 4. O outro integrante revisa

O outro autor abre o pull request, confere a tela e o funcionamento, aprova e
então une a mudança com `main`. Se os dois mudarem a mesma parte ao mesmo tempo,
conversem antes de resolver o conflito.

## Regras simples que evitam perder trabalho

- Nunca compartilhem a mesma branch para duas tarefas simultâneas.
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
