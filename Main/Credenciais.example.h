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
//   WIFI_SSID / WIFI_PASSWORD -> rede Wi-Fi 2.4GHz que o ESP32 vai usar
//   API_KEY      -> Firebase Console > Configurações do projeto > Geral
//                    > "Chave da API da Web"
//   PROJECT_ID   -> Firebase Console > Configurações do projeto > Geral
//                    > "ID do projeto"
//   DATABASE_URL -> Firebase Console > Realtime Database (se não usar,
//                    pode deixar o valor de exemplo abaixo)
//
// Nunca faça commit do Credenciais.h real - ele já está no .gitignore.
// =========================================================================

#ifndef CREDENCIAIS_H
#define CREDENCIAIS_H

#define WIFI_SSID     "NOME_DA_SUA_REDE"
#define WIFI_PASSWORD "SENHA_DA_SUA_REDE"

#define API_KEY      "SUA_API_KEY_DO_FIREBASE"
#define PROJECT_ID   "seu-projeto-firebase"
#define DATABASE_URL "https://seu-projeto-firebase-default-rtdb.firebaseio.com/"

// Vincula ESTE totem a um estacionamento da rede ParaAí. Cadastre o
// estacionamento no painel web e copie o ID exibido em
// Perfil > Meu estacionamento (formato EST-XXXXXX).
#define ESTACIONAMENTO_ID "EST-XXXXXX"

#endif
