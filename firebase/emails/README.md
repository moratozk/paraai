# E-mails de conta (Firebase Authentication)

Os e-mails de redefinir senha e de trocar e-mail saem do Firebase, não do site.
Remetente, assunto e texto são configurados no console; aqui fica o modelo
versionado, para não depender de memória.

## Redefinição de senha

1. **Authentication > Modelos > Redefinição de senha > lápis**:
   - Nome do remetente: `ParaAí`
   - Assunto: `Redefina sua senha do ParaAí`
   - Mensagem: o conteúdo de [`redefinir-senha.html`](redefinir-senha.html)
     (o Firebase troca `%LINK%` e `%EMAIL%` ao enviar).
2. **Só depois de publicar o site com a página `/acao`**: no mesmo modelo,
   **Personalizar URL de ação** → `https://paraai.web.app/acao`.

O modelo, o assunto e o remetente escrevem "ParaAí" direto, sem `%APP_NAME%`.
Esse marcador é o *nome público* do projeto, que o console atual não mostra em
Configurações do projeto (lá está só o nome do projeto); sem ele configurado, o
Firebase usa o ID `paraai-9514f`, como no e-mail padrão.

O URL de ação vale para todos os modelos. A página `/acao`
(`web/src/pages/AcaoConta.jsx`) trata redefinir senha, confirmar e-mail novo e
desfazer troca de e-mail. Trocar o URL antes de publicar o site quebra os
links.

## Spam

O remetente padrão, `@paraai-9514f.firebaseapp.com`, é um domínio
compartilhado por todos os projetos Firebase e muito usado em golpes. Por isso
o Gmail desconfia dele mesmo com um texto bem feito. O modelo acima ajuda pouco
nesse ponto; o que resolve é mandar por um domínio próprio:

- **Domínio personalizado** (Modelos > Personalizar domínio): exige um domínio
  registrado e os registros DNS (TXT e CNAME) que o console mostrar.
- **SMTP próprio** (Modelos > Configurações de SMTP, quando disponível): envia
  por uma conta de e-mail do projeto.

Sem isso, na demonstração, marcar "Não é spam" na caixa de quem vai receber.
