#ifndef PARAAI_ATENDIMENTO_H
#define PARAAI_ATENDIMENTO_H
#include <stdint.h>

enum class PedidoTotem : uint8_t { ENTRADA, SAIDA, CADASTRAR_ENTRADA, VINCULAR };
enum class TipoResposta : uint8_t { SUCESSO, ALERTA, ERRO, CONFIRMAR_CADASTRO };
// SEM_VINCULO: rede e hora prontas, mas o totem ainda não tem acesso (espera o
// código de instalação).
enum class ConexaoTotem : uint8_t { INICIANDO, SEM_WIFI, AJUSTANDO_HORA, AUTENTICANDO, PRONTO, ERRO_CONFIGURACAO, MANUTENCAO, SEM_VINCULO };
// De onde vem o acesso do totem ao Firebase: do Credenciais.h, da instalação
// por código (guardado na memória do totem) ou de nenhum ainda.
enum class OrigemIdentidade : uint8_t { NENHUMA, CREDENCIAIS, CODIGO };

// Filas FreeRTOS copiam bytes: usar somente tipos triviais, nunca String ou
// ponteiros para mensagens que pertencem à outra tarefa.
struct RespostaTotem {
  TipoResposta tipo;
  char titulo[40];
  char detalhe[64];
  char ajuda[64];
  char carro[32]; // "GOL PRATA": modelo e cor informados no site; vazio = não informado.
};
struct StatusTotem { ConexaoTotem conexao; char etapa[40]; };

bool iniciarAtendimento();
bool solicitarAtendimento(PedidoTotem tipo, const char* placa);
// Código de instalação digitado na tela (8 caracteres, ver LogicaTotem.h). A
// resposta chega por receberResposta, como a de um atendimento.
bool solicitarVinculo(const char* codigo);
bool receberResposta(RespostaTotem& resposta);
StatusTotem obterStatusTotem();
OrigemIdentidade origemIdentidade();
// Não bloqueia a UI. Retorna true quando a tarefa de rede está ociosa e foi
// exclusivamente reservada para a manutenção; chamar retomar depois.
bool suspenderAtendimento();
void retomarAtendimento();
// Só com o atendimento suspenso: apaga o acesso criado pelo código, e o totem
// pede um código novo depois de reiniciar. O acesso do Credenciais.h fica.
bool esquecerVinculo();
#endif
