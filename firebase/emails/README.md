# E-mails de conta (Firebase Authentication)

Os e-mails de redefinir senha e de trocar e-mail saem do Firebase, não do site.

## Situação em 07/10/2026

O e-mail de redefinição chega, mas no modelo padrão do Firebase ("Redefinir a
senha do app paraai-9514f", com o link cru) e costuma cair no spam. **Neste
projeto o Firebase bloqueou a edição dos modelos.** Authentication > Modelos
mostra "As atualizações de modelos de e-mail não estão disponíveis para este
projeto". Por isso não dá para trocar remetente, assunto, texto, domínio nem o
URL de ação pelo console. Na demonstração, marcar "Não é spam" nas contas de
teste.

O que já está pronto para quando houver saída:

- [`redefinir-senha.html`](redefinir-senha.html): o e-mail com a identidade do
  ParaAí. `%LINK%` e `%EMAIL%` são os marcadores do Firebase.
- A página `/acao` (`web/src/pages/AcaoConta.jsx`), que trata redefinir senha,
  confirmar e-mail novo e desfazer troca de e-mail. Hoje nenhum e-mail aponta
  para ela.

## Caminhos para trocar o e-mail

1. **O próprio ParaAí envia o e-mail (ideia guardada).** Uma Cloud Function
   recebe o pedido, gera o link com o Admin SDK (`generatePasswordResetLink`),
   troca o destino para
   `https://paraai.web.app/acao?mode=resetPassword&oobCode=…` e envia o HTML
   acima por uma conta de envio (Gmail com senha de app, Brevo, Resend…).
   Resolve o visual e, por sair de um remetente autenticado, quase sempre o
   spam. Exige o plano Blaze (pede cartão; o uso do TCC cabe na cota gratuita)
   e a senha da conta de envio no Secret Manager, nunca no Git. Também exige
   cuidado contra abuso: responder igual exista ou não a conta, e limitar os
   pedidos por e-mail. Adiado em 07/10/2026 pelo dono do projeto, para não
   cadastrar cartão.
2. **Pedir ao suporte do Firebase** que libere a edição dos modelos. É grátis,
   mas sem prazo. Se liberarem: remetente `ParaAí`, assunto
   `Redefina sua senha do ParaAí` e mensagem igual a `redefinir-senha.html`;
   depois de publicar o site, URL de ação `https://paraai.web.app/acao`. O
   remetente continua `@paraai-9514f.firebaseapp.com`, então o spam só melhora
   com domínio próprio (DNS) ou SMTP próprio, configurados na mesma tela.
