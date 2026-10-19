#ifndef PARAAI_TELA_VINCULO_H
#define PARAAI_TELA_VINCULO_H

// =========================================================================
// ParaAi - instalacao do totem pelo codigo do site
// -------------------------------------------------------------------------
// Sem acesso ao Firebase (nem no Credenciais.h, nem na memoria), esta e a
// primeira tela: o dono gera no site um codigo de 8 caracteres, que vale 15
// minutos, e o digita aqui. Aqui so ha tela e toque; o pedido segue para a
// tarefa de rede como um atendimento (solicitarVinculo, em Atendimento.cpp),
// por isso a tela tambem roda nos testes do PC (firmware/test/ui_totem.test.cpp).
// =========================================================================

#ifndef PARAAI_ASSISTENTE_WIFI_H
#error "Inclua AssistenteWiFi.h antes de TelaVinculo.h (ver totem.ino)."
#endif

// Teclado (TV_ = tela de vinculo) so com os 32 caracteres do codigo, em ordem
// e com os numeros em cima, como no celular. APAGAR e OK ficam a direita, cada
// um da altura de duas linhas. Mesma tecla do teclado do Wi-Fi (TeclaWifi).
const char* const TECLADO_VINCULO[4] = {"23456789", "ABCDEFGH", "JKLMNPQR", "STUVWXYZ"};
const int TV_COLUNAS = 8, TV_LINHAS = 4;
const int TV_TOTAL_TECLAS = TV_COLUNAS * TV_LINHAS + 2;
const int TV_X0 = 5, TV_UNIDADE = 34, TV_GAP = 3;
const int TV_Y0 = 110, TV_TECLA_H = 30, TV_PASSO_Y = 32;
const int TV_LADO_X = TV_X0 + TV_COLUNAS * TV_UNIDADE;
const int TV_LADO_W = TELA_W - TV_X0 - TV_LADO_X;
const int TV_LADO_H = TV_PASSO_Y + TV_TECLA_H;
const int TV_APAGAR_Y = TV_Y0, TV_OK_Y = TV_Y0 + 2 * TV_PASSO_Y;
const char TV_APAGAR = '\x02', TV_CONFIRMAR = '\x07';
// Oito casas em dois grupos de quatro, como o site mostra ("K7M2 Q9XZ").
const int TV_CASA_W = 28, TV_CASA_H = 30, TV_CASA_GAP = 4, TV_GRUPO_GAP = 14;
const int TV_CASAS_W = 8 * TV_CASA_W + 6 * TV_CASA_GAP + TV_GRUPO_GAP;
const int TV_CASA_X0 = (TELA_W - TV_CASAS_W) / 2, TV_CASA_Y = 75;
const int TV_TITULO_Y = 36, TV_DICA_Y = 55;

enum class AcaoVinculo : uint8_t { NENHUMA, CARACTERE, APAGAR, CONFIRMAR };
struct EventoVinculo { AcaoVinculo acao; char caractere; };

// As 34 teclas, na ordem do desenho: as letras e numeros por linha, depois
// APAGAR e OK.
TeclaWifi teclaVinculo(int indice) {
  if (indice < TV_COLUNAS * TV_LINHAS) {
    const int linha = indice / TV_COLUNAS, coluna = indice % TV_COLUNAS;
    return {TECLADO_VINCULO[linha][coluna], TV_X0 + coluna * TV_UNIDADE, TV_Y0 + linha * TV_PASSO_Y,
            TV_UNIDADE - TV_GAP, TV_TECLA_H};
  }
  const bool ok = indice > TV_COLUNAS * TV_LINHAS;
  return {ok ? TV_CONFIRMAR : TV_APAGAR, TV_LADO_X, ok ? TV_OK_Y : TV_APAGAR_Y, TV_LADO_W, TV_LADO_H};
}

// O alvo de cada tecla inclui o vao ate a vizinha; as das pontas vao ate a
// borda da tela. Nenhum toque dentro do teclado se perde.
bool teclaVinculoEm(int x, int y, TeclaWifi& tecla) {
  if (y < TV_Y0 || x < 0 || x >= TELA_W || y >= TELA_H) return false;
  if (x >= TV_LADO_X) {
    tecla = teclaVinculo(TV_COLUNAS * TV_LINHAS + (y >= TV_OK_Y ? 1 : 0));
    return true;
  }
  int linha = (y - TV_Y0) / TV_PASSO_Y, coluna = x < TV_X0 ? 0 : (x - TV_X0) / TV_UNIDADE;
  if (linha >= TV_LINHAS) linha = TV_LINHAS - 1;
  if (coluna >= TV_COLUNAS) coluna = TV_COLUNAS - 1;
  tecla = teclaVinculo(linha * TV_COLUNAS + coluna);
  return true;
}

int casaVinculoX(int i) {
  return TV_CASA_X0 + i * (TV_CASA_W + TV_CASA_GAP) + (i >= 4 ? TV_GRUPO_GAP - TV_CASA_GAP : 0);
}

// Casas preenchidas e a do proximo caractere em ambar; o traco marca onde
// entra o proximo.
void desenharCasasVinculo(const String& codigo) {
  tft.fillRect(0, TV_CASA_Y - 1, TELA_W, TV_CASA_H + 2, corFundo);
  const int digitados = codigo.length();
  for (int i = 0; i < (int)paraai::CODIGO_INSTALACAO_TAMANHO; ++i) {
    const int x = casaVinculoX(i);
    tft.fillRoundRect(x, TV_CASA_Y, TV_CASA_W, TV_CASA_H, 5, corPainel);
    tft.drawRoundRect(x, TV_CASA_Y, TV_CASA_W, TV_CASA_H, 5, i <= digitados ? corDestaque : corBotaoBorda);
    if (i < digitados)
      textoCentralizadoEm(String(codigo[i]), x, TV_CASA_Y, TV_CASA_W, TV_CASA_H, corTexto, FONTE_LITERAL);
    else if (i == digitados)
      tft.fillRect(x + TV_CASA_W / 2 - 6, TV_CASA_Y + TV_CASA_H - 7, 12, 2, corDestaque);
  }
}

void desenharTeclaVinculo(const TeclaWifi& t, bool completo) {
  if (t.codigo == TV_CONFIRMAR) {
    desenharTeclaConfirmarWifi(t, completo, "OK");
    return;
  }
  const bool apagar = t.codigo == TV_APAGAR;
  tft.fillRoundRect(t.x, t.y, t.w, t.h, 5, apagar ? corPainel : corBotao);
  tft.drawRoundRect(t.x, t.y, t.w, t.h, 5, corBotaoBorda);
  if (apagar) desenharIconeApagar(t.x, t.y, t.w, t.h, corTexto);
  else textoCentralizadoEm(String(t.codigo), t.x, t.y, t.w, t.h, corTexto, FONTE_LITERAL);
}

// O OK so acende com os 8 caracteres.
void atualizarCodigoVinculo(const String& codigo, bool completoAntes) {
  desenharCasasVinculo(codigo);
  const bool completo = codigo.length() == paraai::CODIGO_INSTALACAO_TAMANHO;
  if (completo != completoAntes) desenharTeclaVinculo(teclaVinculo(TV_TOTAL_TECLAS - 1), completo);
}

void desenharTelaVinculo(const String& codigo) {
  feedbackAtivo = false;
  tft.fillScreen(corFundo);
  desenharCabecalho();
  centralizarTexto("CODIGO DE INSTALACAO", TV_TITULO_Y, corTexto, FONTE_MEDIA);
  centralizarTexto("Gere o codigo no site do ParaAi", TV_DICA_Y, corTextoFraco, FONTE_PEQUENA);
  desenharCasasVinculo(codigo);
  const bool completo = codigo.length() == paraai::CODIGO_INSTALACAO_TAMANHO;
  for (int i = 0; i < TV_TOTAL_TECLAS; ++i) desenharTeclaVinculo(teclaVinculo(i), completo);
  bloquearToqueAtualAteSoltar();
}

EventoVinculo verificarToqueVinculo() {
  EventoVinculo evento = {AcaoVinculo::NENHUMA, 0};
  int x, y;
  TeclaWifi t;
  if (!lerNovoToque(x, y) || !teclaVinculoEm(x, y, t)) return evento;
  if (t.codigo == TV_APAGAR) evento.acao = AcaoVinculo::APAGAR;
  else if (t.codigo == TV_CONFIRMAR) evento.acao = AcaoVinculo::CONFIRMAR;
  else {
    evento.acao = AcaoVinculo::CARACTERE;
    evento.caractere = t.codigo;
    realcarTeclaComFonte(t.x, t.y, t.w, t.h, t.codigo, FONTE_LITERAL);
  }
  return evento;
}

// Instalar de novo, na manutencao: o totem esquece o acesso criado pelo codigo
// e, depois de reiniciar, pede outro. Mesmos botoes da confirmacao do cadastro.
void desenharTelaConfirmarNovoCodigo() {
  feedbackAtivo = false;
  tft.fillScreen(corFundo);
  desenharCabecalho();
  centralizarTexto("INSTALAR DE NOVO?", 46, corAlerta, FONTE_GRANDE);
  centralizarTexto("O totem para de atender ate", 88, corTexto, FONTE_MEDIA);
  centralizarTexto("receber um codigo novo do site.", 110, corTexto, FONTE_MEDIA);
  centralizarTexto("No site, bloqueie o acesso antigo.", 142, corTextoFraco, FONTE_PEQUENA);

  tft.fillRoundRect(CONF_BTN_X_NAO, CONF_BTN_Y, CONF_BTN_W, CONF_BTN_H, 8, corPainel);
  tft.drawRoundRect(CONF_BTN_X_NAO, CONF_BTN_Y, CONF_BTN_W, CONF_BTN_H, 8, corBotaoBorda);
  textoCentralizadoEm("NAO", CONF_BTN_X_NAO, CONF_BTN_Y, CONF_BTN_W, CONF_BTN_H, corTextoFraco, FONTE_MEDIA);

  tft.fillRoundRect(CONF_BTN_X_SIM, CONF_BTN_Y, CONF_BTN_W, CONF_BTN_H, 8, corAlerta);
  textoCentralizadoEm("SIM", CONF_BTN_X_SIM, CONF_BTN_Y, CONF_BTN_W, CONF_BTN_H, corFundo, FONTE_GRANDE);
  bloquearToqueAtualAteSoltar();
}

#endif  // PARAAI_TELA_VINCULO_H
