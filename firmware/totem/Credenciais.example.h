// =========================================================================
// Credenciais.example.h
// -------------------------------------------------------------------------
// Modelo para o Credenciais.h (que fica fora do Git). Copie este ficheiro,
// renomeie a cópia para "Credenciais.h" e preencha com os seus dados reais:
//
//   copy Credenciais.example.h Credenciais.h      (Windows)
//   cp Credenciais.example.h Credenciais.h        (Linux/Mac)
//
// Onde encontrar cada valor:
//   WIFI_SSID / WIFI_PASSWORD -> rede Wi-Fi 2.4GHz de contingência. Vazio,
//                    o totem abre a lista de redes sozinho no primeiro uso.
//                    Depois, troque pela tela (PIN), sem recompilar.
//   MANUTENCAO_PIN -> 4 a 8 dígitos pedidos antes das configurações do
//                    totem (troca de Wi-Fi e calibração). Prefira 6 ou mais.
//   API_KEY      -> Firebase Console > Configurações do projeto > Geral
//                    > "Chave da API da Web"
//   PROJECT_ID   -> Firebase Console > Configurações do projeto > Geral
//                    > "ID do projeto"
//   DATABASE_URL -> Firebase Console > Realtime Database (se não usar,
//                    pode deixar o valor de exemplo abaixo)
//   TOTEM_EMAIL / TOTEM_PASSWORD / ESTACIONAMENTO_ID -> deixe vazios para
//                    instalar pelo código: depois do Wi-Fi, o totem pede o
//                    código gerado no site (Perfil > Segurança do totem >
//                    Instalar um totem) e guarda o próprio acesso na memória.
//                    Preencha só com o acesso da opção "e-mail e senha" do
//                    site; preenchidos, eles valem mais que o código. Não use
//                    a conta pessoal do dono.
//
// Nunca faça commit do Credenciais.h real - ele já está no .gitignore.
// =========================================================================

#ifndef CREDENCIAIS_H
#define CREDENCIAIS_H

// Fallback usado se ainda não houver uma rede validada na memória do ESP32.
// Deixe vazio para configurar pela tela: sem nenhuma rede, o totem abre a
// lista de redes sozinho. Com rede definida, ele só reconecta; para trocar,
// segure o status do cabeçalho por 3 s, informe o PIN e toque TROCAR WIFI.
#define WIFI_SSID     ""
#define WIFI_PASSWORD ""

// PIN das configurações locais. Escolha um valor próprio; não use datas.
#define MANUTENCAO_PIN "000000"

#define API_KEY      "SUA_API_KEY_DO_FIREBASE"
#define PROJECT_ID   "seu-projeto-firebase"
#define DATABASE_URL "https://seu-projeto-firebase-default-rtdb.firebaseio.com/"

// Acesso fixo, opcional. Vazios (o normal), o totem pede o código de
// instalação na tela e cria sozinho a própria conta. Para usar o acesso fixo,
// gere em Perfil > Segurança do totem > "Prefere configurar com e-mail e
// senha?" e copie os três valores, exibidos uma única vez. O ID do
// estacionamento aparece em Perfil > Meu estacionamento (formato EST-XXXXXX).
#define TOTEM_EMAIL       ""
#define TOTEM_PASSWORD    ""
#define ESTACIONAMENTO_ID ""

#endif
