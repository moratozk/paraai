#ifndef PARAAI_ATENDIMENTO_H
#define PARAAI_ATENDIMENTO_H
#include <stdint.h>

enum class PedidoTotem : uint8_t { ENTRADA, SAIDA, CADASTRAR_ENTRADA };
enum class TipoResposta : uint8_t { SUCESSO, ALERTA, ERRO, CONFIRMAR_CADASTRO };
enum class ConexaoTotem : uint8_t { INICIANDO, SEM_WIFI, AJUSTANDO_HORA, AUTENTICANDO, PRONTO, ERRO_CONFIGURACAO, MANUTENCAO };

// Filas FreeRTOS copiam bytes: usar somente tipos triviais, nunca String ou
// ponteiros para mensagens que pertencem à outra tarefa.
struct RespostaTotem {
  TipoResposta tipo;
  char titulo[40];
  char detalhe[64];
  char ajuda[64];
};
struct StatusTotem { ConexaoTotem conexao; char etapa[40]; };

bool iniciarAtendimento();
bool solicitarAtendimento(PedidoTotem tipo, const char* placa);
bool receberResposta(RespostaTotem& resposta);
StatusTotem obterStatusTotem();
// Não bloqueia a UI. Retorna true quando a tarefa de rede está ociosa e foi
// exclusivamente reservada para a manutenção; chamar retomar depois.
bool suspenderAtendimento();
void retomarAtendimento();
#endif
