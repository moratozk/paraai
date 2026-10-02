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
  vinculada à estadia no Firebase. A maquete virtual web fica para uma etapa
  posterior; não reintroduzir sensores ou atuadores.
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
