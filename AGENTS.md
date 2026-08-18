# Instruções compartilhadas do projeto ParaAí

Este arquivo é a memória técnica comum dos assistentes que trabalham neste
repositório. Antes de alterar qualquer coisa, leia também `README.md` e
`ESTADO.md`.

## Objetivo

O ParaAí é um TCC composto por:

- `Web/`: painel React/Vite integrado ao Firebase.
- `Main/`: firmware Arduino para ESP32, tela ILI9341, touch XPT2046, sensores e
  servo da catraca.
- `firestore.rules`: regras de acesso do banco em produção.

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

## Segurança e dados

- Nunca adicione ao Git: `Web/.env`, `Main/Credenciais.h`, senhas de Wi-Fi,
  chaves, tokens, credenciais de totem ou arquivos de conta de serviço.
- Use somente `Web/.env.example` e `Main/Credenciais.example.h` como modelos.
- Não enfraqueça `firestore.rules`. Motoristas acessam apenas os próprios
  dados, operadores apenas o próprio estacionamento e totens apenas as ações
  necessárias do equipamento autorizado.
- O Firebase App Check deve permanecer em modo de monitoramento enquanto o
  ESP32 não tiver uma integração compatível.
- Não publique no Firebase nem grave o ESP32 sem solicitação explícita do
  responsável pelo projeto.

## Verificação mínima

Quando alterar o site, execute em `Web/`:

```bash
npm run lint
npm run build
```

Quando alterar `firestore.rules`, valide as regras antes da publicação. Quando
alterar o firmware, compile para `ESP32 Dev Module` com partição `Huge APP` e
registre no pull request se o teste foi apenas compilado ou também realizado no
hardware.

## Decisões de produto que devem ser preservadas

- A identidade visual aprovada é âmbar sobre asfalto e a logo oficial é
  `Web/public/logo.png`; não redesenhe a logo por aproximação.
- O modo claro usa cinza quente, nunca branco puro.
- O site fala com motoristas e donos de estacionamento sem expor jargão de
  hardware na interface.
- A tela inicial do totem mostra somente `ENTRADA` e `SAÍDA`, sem contagem de
  vagas.
- A recarga é simulada para fins acadêmicos e não deve ser apresentada como
  pagamento real.

## Regras de revisão

- Bloqueie qualquer alteração que exponha segredo, permita acesso entre contas
  ou estacionamentos, quebre login/cadastro ou abra a catraca em estado
  incoerente.
- Verifique responsividade, tema claro/escuro e mensagens de erro nas mudanças
  visuais.
- Em mudanças de cobrança, preserve a tarifa congelada na entrada e o cálculo
  entre entrada e saída.
