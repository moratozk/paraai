#ifndef PARAAI_ASSISTENTE_WIFI_H
#define PARAAI_ASSISTENTE_WIFI_H

// =========================================================================
// ParaAi - Wi-Fi escolhido na propria tela do totem
// -------------------------------------------------------------------------
// Lista as redes ao redor, recebe a senha num teclado completo e so troca a
// rede depois de conectar de verdade. Fica atras do PIN de manutencao, como o
// portal pelo celular: o motorista nao chega aqui.
//
// O radio fica do lado de fora (AcoesWifiTela, implementada com o ESP32 em
// ConfiguracaoWiFi.ino). Aqui so ha tela, toque e estado, por isso o fluxo
// inteiro tambem roda nos testes do PC (firmware/test/ui_totem.test.cpp).
// =========================================================================

#ifndef DISPLAY_UI_H
#error "Inclua DisplayUI.ino antes de AssistenteWiFi.h (ver totem.ino)."
#endif

struct RedeWifiTela {
  String ssid;     // bytes originais: e com eles que o totem conecta
  int32_t rssi;
};

enum class TesteWifi : uint8_t { EM_ANDAMENTO, CONECTOU, SENHA, SEM_REDE, FALHOU };

class AcoesWifiTela {
public:
  virtual ~AcoesWifiTela() {}
  virtual bool iniciarBusca() = 0;
  // -1: ainda buscando; -2: falhou; >= 0: redes copiadas, da mais forte.
  virtual int consultarBusca(RedeWifiTela* redes, uint8_t capacidade) = 0;
  virtual void cancelarBusca() = 0;
  virtual void iniciarTeste(const String& ssid, const String& senha) = 0;
  // Com o prazo esgotado, nunca devolve EM_ANDAMENTO.
  virtual TesteWifi consultarTeste(bool prazoEsgotado) = 0;
  // false: desfaz a tentativa e volta para a rede que estava configurada.
  virtual void encerrarTeste(bool manterNovaRede) = 0;
  virtual bool salvarRede(const String& ssid, const String& senha) = 0;
  virtual String redeConfigurada() = 0;
};

// -------------------------------------------------------------------------
// TECLADO COMPLETO (TW_ = teclado Wi-Fi)
// Quatro linhas por camada. Codigos abaixo de 0x20 sao teclas de comando; o
// resto e o proprio caractere. As tres camadas cobrem os 95 caracteres ASCII
// imprimiveis (o teste no PC confere).
// -------------------------------------------------------------------------
const char TW_MAIUSCULAS      = '\x01';
const char TW_APAGAR          = '\x02';
const char TW_SIMBOLOS        = '\x03';
const char TW_LETRAS          = '\x04';
const char TW_MAIS_SIMBOLOS   = '\x05';
const char TW_MENOS_SIMBOLOS  = '\x06';
const char TW_CONFIRMAR       = '\x07';

enum CamadaTecladoWifi : uint8_t { CAMADA_LETRAS, CAMADA_SIMBOLOS, CAMADA_MAIS_SIMBOLOS };

// Literais separados de proposito: "\x01zx" seria lido como um unico escape.
const char* const TECLADO_WIFI[3][4] = {
  {"qwertyuiop", "asdfghjkl",  "\x01" "zxcvbnm" "\x02",  "\x03" " " "\x07"},
  {"1234567890", "@#$%&*-+()", "\x05" "_.,!?'\"" "\x02", "\x04" " " "\x07"},
  {"[]{}<>^~`|", "\\/:;=.,_-@", "\x06" "!?'\"$%&" "\x02", "\x04" " " "\x07"},
};

// Geometria: 10 unidades de 31px por linha; teclas de 30px de altura.
const int TW_X0 = 6, TW_UNIDADE = 31, TW_GAP = 3;
const int TW_Y0 = 108, TW_TECLA_H = 30, TW_PASSO_Y = 32;
const int TW_VOLTAR_X = 6, TW_VOLTAR_Y = 37, TW_VOLTAR_W = 78, TW_VOLTAR_H = 31;
const int TW_TITULO_X = 90, TW_TITULO_W = TELA_W - TW_TITULO_X - 6;
const int TW_CAMPO_X = 6, TW_CAMPO_Y = 76, TW_CAMPO_H = 29;
const int TW_CAMPO_W = TELA_W - 2 * TW_CAMPO_X;

struct EstadoTecladoWifi {
  CamadaTecladoWifi camada = CAMADA_LETRAS;
  uint8_t maiusculas = 0;  // 0 minusculas, 1 so a proxima letra, 2 fixas
  bool senha = true;       // campo de senha ou nome de rede oculta
};

enum class AcaoTecladoWifi : uint8_t { NENHUMA, CARACTERE, APAGAR, CONFIRMAR, VOLTAR, MAIUSCULAS, CAMADA };
struct EventoTecladoWifi {
  AcaoTecladoWifi acao;
  char caractere;
  CamadaTecladoWifi camada;
};

struct TeclaWifi { char codigo; int x, y, w, h; };

int meiasUnidadesTeclaWifi(char codigo) {
  switch (codigo) {
    case TW_MAIUSCULAS: case TW_APAGAR: case TW_MAIS_SIMBOLOS: case TW_MENOS_SIMBOLOS: return 3;
    case TW_SIMBOLOS: case TW_LETRAS: return 4;
    case TW_CONFIRMAR: return 8;  // cabe "CONECTAR"
    case ' ': return 8;
    default: return 2;
  }
}

bool posicaoTeclaWifi(CamadaTecladoWifi camada, int linha, int coluna, TeclaWifi& tecla) {
  if (linha < 0 || linha > 3) return false;
  const char* teclas = TECLADO_WIFI[camada][linha];
  const int quantidade = strlen(teclas);
  if (coluna < 0 || coluna >= quantidade) return false;
  int total = 0;
  for (int i = 0; i < quantidade; ++i) total += meiasUnidadesTeclaWifi(teclas[i]);
  int inicio = (20 - total) / 2;  // linha mais curta fica centralizada
  for (int i = 0; i < coluna; ++i) inicio += meiasUnidadesTeclaWifi(teclas[i]);
  const int fim = inicio + meiasUnidadesTeclaWifi(teclas[coluna]);
  tecla.codigo = teclas[coluna];
  tecla.x = TW_X0 + inicio * TW_UNIDADE / 2;
  tecla.w = TW_X0 + fim * TW_UNIDADE / 2 - TW_GAP - tecla.x;
  tecla.y = TW_Y0 + linha * TW_PASSO_Y;
  tecla.h = TW_TECLA_H;
  return true;
}

// O alvo de cada tecla inclui o vao ate a vizinha; as das pontas vao ate a
// borda da tela. Assim nenhum toque dentro do teclado se perde.
bool teclaWifiEm(CamadaTecladoWifi camada, int x, int y, TeclaWifi& tecla) {
  if (y < TW_Y0) return false;
  int linha = (y - TW_Y0) / TW_PASSO_Y;
  if (linha > 3) linha = 3;
  const int quantidade = strlen(TECLADO_WIFI[camada][linha]);
  for (int coluna = 0; coluna < quantidade; ++coluna) {
    TeclaWifi candidata;
    posicaoTeclaWifi(camada, linha, coluna, candidata);
    const int esquerda = coluna == 0 ? 0 : candidata.x;
    const int direita = coluna == quantidade - 1 ? TELA_W : candidata.x + candidata.w + TW_GAP;
    if (x >= esquerda && x < direita) {
      tecla = candidata;
      return true;
    }
  }
  return false;
}

char caractereTeclaWifi(char codigo, const EstadoTecladoWifi& estado) {
  if (estado.camada == CAMADA_LETRAS && estado.maiusculas && codigo >= 'a' && codigo <= 'z')
    return codigo - 'a' + 'A';
  return codigo;
}

void desenharIconeMaiusculas(int cx, int cy, uint16_t cor) {
  tft.fillTriangle(cx, cy - 9, cx - 9, cy, cx + 9, cy, cor);
  tft.fillRect(cx - 4, cy, 9, 7, cor);
}

void desenharIconeApagar(int x, int y, int w, int h, uint16_t cor) {
  const int cy = y + h / 2, ponta = x + 9, corpo = x + 16, fim = x + w - 9;
  for (int e = 0; e < 2; ++e) {
    tft.drawLine(ponta + e, cy, corpo + e, cy - 8, cor);
    tft.drawLine(ponta + e, cy, corpo + e, cy + 8, cor);
  }
  tft.drawFastHLine(corpo, cy - 8, fim - corpo, cor);
  tft.drawFastHLine(corpo, cy + 8, fim - corpo, cor);
  tft.drawFastVLine(fim, cy - 8, 17, cor);
  const int xc = (corpo + fim) / 2 + 1;
  for (int e = 0; e < 2; ++e) {
    tft.drawLine(xc - 4 + e, cy - 4, xc + 4 + e, cy + 4, cor);
    tft.drawLine(xc - 4 + e, cy + 4, xc + 4 + e, cy - 4, cor);
  }
}

void desenharTeclaConfirmarWifi(const TeclaWifi& t, bool ativo, const char* rotulo) {
  tft.fillRoundRect(t.x, t.y, t.w, t.h, 5, ativo ? corDestaque : corPainel);
  if (!ativo) tft.drawRoundRect(t.x, t.y, t.w, t.h, 5, corBotaoBorda);
  textoCentralizadoEm(rotulo, t.x, t.y, t.w, t.h, ativo ? corFundo : corBotaoBorda, FONTE_MEDIA);
}

void desenharTeclaWifi(const TeclaWifi& t, const EstadoTecladoWifi& estado,
                       bool confirmarAtivo, const char* rotuloConfirmar) {
  if (t.codigo == TW_CONFIRMAR) {
    desenharTeclaConfirmarWifi(t, confirmarAtivo, rotuloConfirmar);
    return;
  }
  const bool comando = static_cast<unsigned char>(t.codigo) < 0x20;
  const bool maiusculasFixas = t.codigo == TW_MAIUSCULAS && estado.maiusculas == 2;
  tft.fillRoundRect(t.x, t.y, t.w, t.h, 5, maiusculasFixas ? corDestaque : comando ? corPainel : corBotao);
  if (!maiusculasFixas) tft.drawRoundRect(t.x, t.y, t.w, t.h, 5, corBotaoBorda);
  const int cx = t.x + t.w / 2, cy = t.y + t.h / 2;
  switch (t.codigo) {
    case TW_MAIUSCULAS:
      desenharIconeMaiusculas(cx, cy - 1, maiusculasFixas ? corFundo
                              : estado.maiusculas ? corDestaque : corTextoFraco);
      if (maiusculasFixas) tft.fillRect(cx - 8, cy + 9, 17, 2, corFundo);
      break;
    case TW_APAGAR:          desenharIconeApagar(t.x, t.y, t.w, t.h, corTexto); break;
    case TW_SIMBOLOS:        textoCentralizadoEm("?123", t.x, t.y, t.w, t.h, corTextoFraco, FONTE_PEQUENA); break;
    case TW_LETRAS:          textoCentralizadoEm("ABC", t.x, t.y, t.w, t.h, corTextoFraco, FONTE_PEQUENA); break;
    case TW_MAIS_SIMBOLOS:   textoCentralizadoEm("#+=", t.x, t.y, t.w, t.h, corTextoFraco, FONTE_PEQUENA); break;
    case TW_MENOS_SIMBOLOS:  textoCentralizadoEm("123", t.x, t.y, t.w, t.h, corTextoFraco, FONTE_PEQUENA); break;
    case ' ':                textoCentralizadoEm("ESPACO", t.x, t.y, t.w, t.h, corTextoFraco, FONTE_PEQUENA); break;
    default:
      textoCentralizadoEm(String(caractereTeclaWifi(t.codigo, estado)), t.x, t.y, t.w, t.h,
                          corTexto, FONTE_LITERAL);
      break;
  }
}

void desenharTecladoWifi(const EstadoTecladoWifi& estado, bool confirmarAtivo, const char* rotuloConfirmar) {
  feedbackAtivo = false;  // o realce pendente desenharia o rotulo da camada anterior
  tft.fillRect(0, TW_Y0 - 2, TELA_W, TELA_H - TW_Y0 + 2, corFundo);
  for (int linha = 0; linha < 4; ++linha) {
    TeclaWifi t;
    for (int coluna = 0; posicaoTeclaWifi(estado.camada, linha, coluna, t); ++coluna)
      desenharTeclaWifi(t, estado, confirmarAtivo, rotuloConfirmar);
  }
}

void atualizarTeclaConfirmarWifi(const EstadoTecladoWifi& estado, bool ativo, const char* rotulo) {
  const char* ultima = TECLADO_WIFI[estado.camada][3];
  TeclaWifi t;
  if (posicaoTeclaWifi(estado.camada, 3, strlen(ultima) - 1, t)) desenharTeclaConfirmarWifi(t, ativo, rotulo);
}

// A senha aparece como foi digitada: quem configura confere letra por letra.
// Texto maior que o campo mostra o final, com "<" na frente.
void desenharCampoTextoWifi(const String& texto, const EstadoTecladoWifi& estado) {
  tft.fillRoundRect(TW_CAMPO_X, TW_CAMPO_Y, TW_CAMPO_W, TW_CAMPO_H, 6, corPainel);
  tft.drawRoundRect(TW_CAMPO_X, TW_CAMPO_Y, TW_CAMPO_W, TW_CAMPO_H, 6, corDestaque);
  const int x0 = TW_CAMPO_X + 8, avanco = 14;
  const int base = TW_CAMPO_Y + (TW_CAMPO_H + 13) / 2;  // FreeMonoBold12pt7b
  const int vagas = (TW_CAMPO_W - 16) / avanco;          // inclui a do cursor

  if (texto.isEmpty()) {
    tft.fillRect(x0 + 1, TW_CAMPO_Y + 6, 2, TW_CAMPO_H - 12, corDestaque);
    tft.setFont(FONTE_PEQUENA);
    tft.setTextSize(1);
    tft.setTextColor(corTextoFraco);
    tft.setCursor(x0 + 10, TW_CAMPO_Y + (TW_CAMPO_H - 15) / 2 + 15);
    tft.print(estado.senha ? "minimo 8 caracteres" : "nome exato da rede");
    return;
  }

  const int tamanho = texto.length();
  const bool cortado = tamanho > vagas - 1;
  const int primeiro = cortado ? tamanho - (vagas - 2) : 0;
  int x = x0;
  tft.setFont(FONTE_LITERAL);
  tft.setTextSize(1);
  if (cortado) {
    tft.setTextColor(corTextoFraco);
    tft.setCursor(x, base);
    tft.print('<');
    x += avanco;
  }
  tft.setTextColor(corTexto);
  for (int i = primeiro; i < tamanho; ++i, x += avanco) {
    tft.setCursor(x, base);
    tft.print(texto[i]);
  }
  tft.fillRect(x + 1, TW_CAMPO_Y + 6, 2, TW_CAMPO_H - 12, corDestaque);
}

// Titulo (ou aviso) e, abaixo, a rede escolhida; sem rede, uma dica.
void desenharTopoTecladoWifi(const String& titulo, uint16_t corTitulo, const String& rede) {
  tft.fillRect(0, HEADER_H + 4, TELA_W, TW_CAMPO_Y - HEADER_H - 5, corFundo);
  tft.fillRoundRect(TW_VOLTAR_X, TW_VOLTAR_Y, TW_VOLTAR_W, TW_VOLTAR_H, 6, corPainel);
  tft.drawRoundRect(TW_VOLTAR_X, TW_VOLTAR_Y, TW_VOLTAR_W, TW_VOLTAR_H, 6, corBotaoBorda);
  textoCentralizadoEm("VOLTAR", TW_VOLTAR_X, TW_VOLTAR_Y, TW_VOLTAR_W, TW_VOLTAR_H,
                      corTextoFraco, FONTE_PEQUENA);

  String texto = titulo;
  while (texto.length() && larguraTexto(texto, FONTE_PEQUENA, 1) > TW_TITULO_W) texto.remove(texto.length() - 1);
  tft.setFont(FONTE_PEQUENA);
  tft.setTextSize(1);
  tft.setTextColor(corTitulo);
  tft.setCursor(TW_TITULO_X, TW_VOLTAR_Y + 15);
  tft.print(texto);

  if (rede.isEmpty()) {
    tft.setTextColor(corTextoFraco);
    tft.setCursor(TW_TITULO_X, TW_VOLTAR_Y + 33);
    tft.print("Igual ao do roteador");
  } else {
    desenharTextoLiteral(textoLiteralExibivel(rede), TW_TITULO_X, 62, TW_TITULO_W, corDestaque, false);
  }
}

void desenharTelaTecladoWifi(const String& titulo, uint16_t corTitulo, const String& rede,
                             const String& texto, const EstadoTecladoWifi& estado,
                             bool confirmarAtivo, const char* rotuloConfirmar) {
  tft.fillScreen(corFundo);
  desenharCabecalho();
  desenharTopoTecladoWifi(titulo, corTitulo, rede);
  desenharCampoTextoWifi(texto, estado);
  desenharTecladoWifi(estado, confirmarAtivo, rotuloConfirmar);
  bloquearToqueAtualAteSoltar();
}

EventoTecladoWifi verificarToqueTecladoWifi(const EstadoTecladoWifi& estado) {
  EventoTecladoWifi evento = {AcaoTecladoWifi::NENHUMA, 0, estado.camada};
  int x, y;
  if (!lerNovoToque(x, y)) return evento;
  if (toqueDentro(x, y, TW_VOLTAR_X, TW_VOLTAR_Y, TW_VOLTAR_W, TW_VOLTAR_H)) {
    evento.acao = AcaoTecladoWifi::VOLTAR;
    return evento;
  }
  TeclaWifi t;
  if (!teclaWifiEm(estado.camada, x, y, t)) return evento;
  switch (t.codigo) {
    case TW_MAIUSCULAS: evento.acao = AcaoTecladoWifi::MAIUSCULAS; break;
    case TW_APAGAR:     evento.acao = AcaoTecladoWifi::APAGAR; break;
    case TW_CONFIRMAR:  evento.acao = AcaoTecladoWifi::CONFIRMAR; break;
    case TW_SIMBOLOS:
    case TW_MENOS_SIMBOLOS:
      evento.acao = AcaoTecladoWifi::CAMADA;
      evento.camada = CAMADA_SIMBOLOS;
      break;
    case TW_MAIS_SIMBOLOS:
      evento.acao = AcaoTecladoWifi::CAMADA;
      evento.camada = CAMADA_MAIS_SIMBOLOS;
      break;
    case TW_LETRAS:
      evento.acao = AcaoTecladoWifi::CAMADA;
      evento.camada = CAMADA_LETRAS;
      break;
    default:
      evento.acao = AcaoTecladoWifi::CARACTERE;
      evento.caractere = caractereTeclaWifi(t.codigo, estado);
      // O espaco mostra "ESPACO", que o realce nao saberia restaurar.
      if (t.codigo != ' ') realcarTeclaComFonte(t.x, t.y, t.w, t.h, evento.caractere, FONTE_LITERAL);
      break;
  }
  return evento;
}

// -------------------------------------------------------------------------
// LISTA DE REDES
// -------------------------------------------------------------------------
const int LW_REDES_POR_PAGINA = 4;
const int LW_LINHA_X = 6, LW_LINHA_W = 258, LW_LINHA_H = 32, LW_LINHA_Y0 = 58, LW_LINHA_PASSO = 35;
const int LW_SETA_X = 270, LW_SETA_W = 44;
const int LW_ACIMA_Y = 58, LW_ACIMA_H = 66, LW_ABAIXO_Y = 128, LW_ABAIXO_H = 67;
const int LW_RODAPE_Y = 200, LW_RODAPE_H = 36;
const int LW_VOLTAR_X = 6, LW_VOLTAR_W = 76;
const int LW_OUTRA_X = 88, LW_OUTRA_W = 117;
const int LW_ATUALIZAR_X = 211, LW_ATUALIZAR_W = 103;

enum class EstadoListaWifi : uint8_t { BUSCANDO, PRONTA, FALHOU };
enum class AcaoListaWifi : uint8_t { NENHUMA, REDE, ACIMA, ABAIXO, VOLTAR, OUTRA, ATUALIZAR };
struct EventoListaWifi { AcaoListaWifi acao; int indice; };

int paginasListaWifi(uint8_t quantidade) {
  return quantidade == 0 ? 1 : (quantidade + LW_REDES_POR_PAGINA - 1) / LW_REDES_POR_PAGINA;
}

void desenharBarrasSinalWifi(int x, int y, int barras) {
  for (int i = 0; i < 4; ++i) {
    const int h = 4 + i * 3;
    tft.fillRect(x + i * 5, y + 13 - h, 3, h, i < barras ? corTexto : corBotaoBorda);
  }
}

bool redeEhConfigurada(const RedeWifiTela& rede, const String& configurada) {
  return !configurada.isEmpty() && rede.ssid == configurada;
}

int larguraNomeRedeWifi(bool configurada) {
  return LW_LINHA_W - 40 - (configurada ? 68 : 0);  // "ATUAL" ocupa o fim da linha
}

// Uma fonte so para a lista toda: a maior apenas se todos os nomes couberem.
bool listaWifiCabeNaFonteGrande(const RedeWifiTela* redes, uint8_t quantidade, const String& configurada) {
  for (int i = 0; i < quantidade; ++i) {
    const int largura = larguraNomeRedeWifi(redeEhConfigurada(redes[i], configurada));
    if ((int)textoLiteralExibivel(redes[i].ssid).length() * 14 > largura) return false;
  }
  return true;
}

void desenharLinhaRedeWifi(int posicao, const RedeWifiTela& rede, bool configurada, bool fonteGrande) {
  const int y = LW_LINHA_Y0 + posicao * LW_LINHA_PASSO;
  tft.fillRoundRect(LW_LINHA_X, y, LW_LINHA_W, LW_LINHA_H, 6, corPainel);
  tft.drawRoundRect(LW_LINHA_X, y, LW_LINHA_W, LW_LINHA_H, 6, configurada ? corDestaque : corBotaoBorda);
  desenharBarrasSinalWifi(LW_LINHA_X + 9, y + (LW_LINHA_H - 13) / 2, paraai::barrasSinalWifi(rede.rssi));
  if (configurada)
    textoCentralizadoEm("ATUAL", LW_LINHA_X + LW_LINHA_W - 68, y, 62, LW_LINHA_H, corDestaque, FONTE_PEQUENA);
  desenharTextoLiteral(textoLiteralExibivel(rede.ssid), LW_LINHA_X + 32, y + LW_LINHA_H / 2,
                       larguraNomeRedeWifi(configurada), corTexto, false, fonteGrande);
}

void desenharSetaListaWifi(bool acima, bool ativa) {
  const int y = acima ? LW_ACIMA_Y : LW_ABAIXO_Y, h = acima ? LW_ACIMA_H : LW_ABAIXO_H;
  tft.fillRoundRect(LW_SETA_X, y, LW_SETA_W, h, 6, corPainel);
  tft.drawRoundRect(LW_SETA_X, y, LW_SETA_W, h, 6, ativa ? corBotaoBorda : corPainel);
  const uint16_t cor = ativa ? corTexto : corBotaoBorda;
  const int cx = LW_SETA_X + LW_SETA_W / 2, cy = y + h / 2;
  if (acima) tft.fillTriangle(cx, cy - 8, cx - 10, cy + 6, cx + 10, cy + 6, cor);
  else       tft.fillTriangle(cx, cy + 8, cx - 10, cy - 6, cx + 10, cy - 6, cor);
}

void desenharBotaoRodapeWifi(int x, int w, const char* rotulo, bool ativo, uint16_t corRotulo) {
  tft.fillRoundRect(x, LW_RODAPE_Y, w, LW_RODAPE_H, 7, corPainel);
  tft.drawRoundRect(x, LW_RODAPE_Y, w, LW_RODAPE_H, 7, ativo ? corBotaoBorda : corPainel);
  textoCentralizadoEm(rotulo, x, LW_RODAPE_Y, w, LW_RODAPE_H, ativo ? corRotulo : corBotaoBorda, FONTE_PEQUENA);
}

// Linhas, setas e numero da pagina. Trocar de pagina redesenha so isto.
void desenharPaginaListaWifi(const RedeWifiTela* redes, uint8_t quantidade, uint8_t pagina,
                             const String& configurada, EstadoListaWifi estado) {
  tft.fillRect(0, LW_LINHA_Y0 - 2, TELA_W, LW_RODAPE_Y - LW_LINHA_Y0, corFundo);
  tft.fillRect(LW_SETA_X, 36, TELA_W - LW_SETA_X, 18, corFundo);

  if (estado == EstadoListaWifi::BUSCANDO) {
    desenharPontosCarregando(160, 100, 22, 0);
    centralizarTexto("Procurando redes...", 136, corTexto, FONTE_MEDIA);
    centralizarTexto("So redes 2,4 GHz com senha", 162, corTextoFraco, FONTE_PEQUENA);
    return;
  }
  if (estado == EstadoListaWifi::FALHOU) {
    centralizarTexto("A BUSCA FALHOU", 96, corErro, FONTE_MEDIA);
    centralizarTexto("Toque em ATUALIZAR", 124, corTextoFraco, FONTE_PEQUENA);
    return;
  }
  if (quantidade == 0) {
    centralizarTexto("NENHUMA REDE ENCONTRADA", 76, corAlerta, FONTE_MEDIA);
    centralizarTexto("So aparecem redes 2,4 GHz", 106, corTextoFraco, FONTE_PEQUENA);
    centralizarTexto("protegidas por senha.", 126, corTextoFraco, FONTE_PEQUENA);
    centralizarTexto("Rede oculta? Use OUTRA REDE", 160, corTexto, FONTE_PEQUENA);
    return;
  }

  const int paginas = paginasListaWifi(quantidade);
  const bool fonteGrande = listaWifiCabeNaFonteGrande(redes, quantidade, configurada);
  for (int i = 0; i < LW_REDES_POR_PAGINA; ++i) {
    const int indice = pagina * LW_REDES_POR_PAGINA + i;
    if (indice >= quantidade) break;
    desenharLinhaRedeWifi(i, redes[indice], redeEhConfigurada(redes[indice], configurada), fonteGrande);
  }
  if (paginas > 1) {
    desenharSetaListaWifi(true, pagina > 0);
    desenharSetaListaWifi(false, pagina + 1 < paginas);
    textoCentralizadoEm(String(pagina + 1) + "/" + String(paginas), LW_SETA_X, 36, LW_SETA_W, 18,
                        corTextoFraco, FONTE_PEQUENA);
  }
}

void desenharTelaListaWifi(const RedeWifiTela* redes, uint8_t quantidade, uint8_t pagina,
                           const String& configurada, EstadoListaWifi estado) {
  feedbackAtivo = false;
  tft.fillScreen(corFundo);
  desenharCabecalho();
  centralizarTexto("ESCOLHA A REDE", 38, corTexto, FONTE_MEDIA);
  desenharPaginaListaWifi(redes, quantidade, pagina, configurada, estado);
  const bool pronta = estado != EstadoListaWifi::BUSCANDO;
  desenharBotaoRodapeWifi(LW_VOLTAR_X, LW_VOLTAR_W, "VOLTAR", true, corTextoFraco);
  desenharBotaoRodapeWifi(LW_OUTRA_X, LW_OUTRA_W, "OUTRA REDE", pronta, corTexto);
  desenharBotaoRodapeWifi(LW_ATUALIZAR_X, LW_ATUALIZAR_W, "ATUALIZAR", pronta, corTexto);
  bloquearToqueAtualAteSoltar();
}

void animarBuscaWifi(unsigned long decorrido) {
  static unsigned long ultimoFrame = 0;
  if (millis() - ultimoFrame < 90) return;
  ultimoFrame = millis();
  desenharPontosCarregando(160, 100, 22, decorrido);
}

EventoListaWifi verificarToqueListaWifi(uint8_t quantidade, uint8_t pagina, EstadoListaWifi estado) {
  EventoListaWifi evento = {AcaoListaWifi::NENHUMA, -1};
  int x, y;
  if (!lerNovoToque(x, y)) return evento;
  if (toqueDentro(x, y, LW_VOLTAR_X, LW_RODAPE_Y, LW_VOLTAR_W, LW_RODAPE_H)) {
    evento.acao = AcaoListaWifi::VOLTAR;
    return evento;
  }
  if (estado == EstadoListaWifi::BUSCANDO) return evento;
  if (toqueDentro(x, y, LW_OUTRA_X, LW_RODAPE_Y, LW_OUTRA_W, LW_RODAPE_H)) evento.acao = AcaoListaWifi::OUTRA;
  else if (toqueDentro(x, y, LW_ATUALIZAR_X, LW_RODAPE_Y, LW_ATUALIZAR_W, LW_RODAPE_H)) evento.acao = AcaoListaWifi::ATUALIZAR;
  if (evento.acao != AcaoListaWifi::NENHUMA || estado != EstadoListaWifi::PRONTA) return evento;

  const int paginas = paginasListaWifi(quantidade);
  if (paginas > 1 && pagina > 0 && toqueDentro(x, y, LW_SETA_X, LW_ACIMA_Y, LW_SETA_W, LW_ACIMA_H)) {
    evento.acao = AcaoListaWifi::ACIMA;
  } else if (paginas > 1 && pagina + 1 < paginas &&
             toqueDentro(x, y, LW_SETA_X, LW_ABAIXO_Y, LW_SETA_W, LW_ABAIXO_H)) {
    evento.acao = AcaoListaWifi::ABAIXO;
  } else {
    for (int i = 0; i < LW_REDES_POR_PAGINA; ++i) {
      const int indice = pagina * LW_REDES_POR_PAGINA + i;
      if (indice < quantidade &&
          toqueDentro(x, y, LW_LINHA_X, LW_LINHA_Y0 + i * LW_LINHA_PASSO, LW_LINHA_W, LW_LINHA_H)) {
        evento.acao = AcaoListaWifi::REDE;
        evento.indice = indice;
        break;
      }
    }
  }
  return evento;
}

// Sucesso, pela tela ou pelo celular. O SSID vai na mono, com seus simbolos.
void desenharTelaWifiConectado(const String& ssid) {
  desenharTelaResultado(RESULTADO_SUCESSO, "WI-FI CONFIGURADO", "", "Reiniciando o atendimento");
  desenharTextoLiteral(textoLiteralExibivel(ssid), 10, 150, TELA_W - 20, corTexto, true);
}

// -------------------------------------------------------------------------
// FLUXO: buscar -> escolher -> (nome da rede oculta) -> senha -> testar
// -------------------------------------------------------------------------
const unsigned long WIFI_INATIVIDADE_MS = 3UL * 60UL * 1000UL;
const unsigned long WIFI_BUSCA_MAX_MS = 20000;
const unsigned long WIFI_TESTE_MAX_MS = 20000;

enum class EtapaWifi : uint8_t { BUSCANDO, LISTA, NOME, SENHA, TESTANDO, CONCLUIDO };
enum class ResultadoAssistenteWifi : uint8_t { CONECTOU, CANCELADO, EXPIROU };

class AssistenteWifi {
public:
  static constexpr uint8_t MAX_REDES = 12;

  explicit AssistenteWifi(AcoesWifiTela& acoes) : acoes_(acoes) {}
  ~AssistenteWifi() { limparTexto(); }

  void iniciar() { buscar(); }

  // Um passo sem bloquear; false quando terminou.
  bool passo() {
    if (etapa_ == EtapaWifi::CONCLUIDO) return false;
    atualizarRelogioCabecalho();
    switch (etapa_) {
      case EtapaWifi::BUSCANDO: tratarBusca(); break;
      case EtapaWifi::LISTA:    tratarLista(); break;
      case EtapaWifi::NOME:
      case EtapaWifi::SENHA:    tratarTeclado(); break;
      case EtapaWifi::TESTANDO: tratarTeste(); break;
      default: break;
    }
    return etapa_ != EtapaWifi::CONCLUIDO;
  }

  EtapaWifi etapa() const { return etapa_; }
  ResultadoAssistenteWifi resultado() const { return resultado_; }
  // Leitura para os testes.
  const String& textoDigitado() const { return texto_; }
  const String& redeEscolhida() const { return ssid_; }
  const String& aviso() const { return aviso_; }
  uint8_t quantidadeRedes() const { return quantidade_; }
  uint8_t pagina() const { return pagina_; }
  const EstadoTecladoWifi& teclado() const { return teclado_; }

private:
  AcoesWifiTela& acoes_;
  EtapaWifi etapa_ = EtapaWifi::BUSCANDO;
  ResultadoAssistenteWifi resultado_ = ResultadoAssistenteWifi::CANCELADO;
  RedeWifiTela redes_[MAX_REDES];
  uint8_t quantidade_ = 0;
  uint8_t pagina_ = 0;
  bool buscaFalhou_ = false;
  String ssid_;
  String texto_;     // o que esta no campo: nome da rede oculta ou senha
  String aviso_;
  bool avisoBrando_ = false;
  EstadoTecladoWifi teclado_;
  unsigned long interacao_ = 0;
  unsigned long inicioEtapa_ = 0;

  EstadoListaWifi estadoLista() const {
    return buscaFalhou_ ? EstadoListaWifi::FALHOU : EstadoListaWifi::PRONTA;
  }
  bool digitandoSenha() const { return etapa_ == EtapaWifi::SENHA; }
  int maximo() const { return digitandoSenha() ? paraai::WIFI_SENHA_MAX : paraai::WIFI_SSID_MAX; }
  bool textoValido() const {
    return digitandoSenha() ? paraai::senhaWifiValida(texto_.c_str())
                            : paraai::textoDigitadoValido(texto_.c_str(), 1, paraai::WIFI_SSID_MAX);
  }
  const char* rotuloConfirmar() const { return digitandoSenha() ? "CONECTAR" : "AVANCAR"; }
  const char* tituloPadrao() const { return digitandoSenha() ? "SENHA DA REDE" : "NOME DA REDE OCULTA"; }

  // O aviso de uma tentativa anterior some na primeira correcao.
  void limparAviso() {
    if (aviso_.isEmpty()) return;
    aviso_ = "";
    desenharTopoTecladoWifi(tituloPadrao(), corTexto, ssid_);
  }

  void limparTexto() {
    for (size_t i = 0; i < texto_.length(); ++i) texto_[i] = '\0';
    texto_ = "";
  }

  void encerrar(ResultadoAssistenteWifi resultado) {
    resultado_ = resultado;
    etapa_ = EtapaWifi::CONCLUIDO;
    limparTexto();
  }

  void buscar() {
    etapa_ = EtapaWifi::BUSCANDO;
    inicioEtapa_ = millis();
    quantidade_ = 0;
    pagina_ = 0;
    buscaFalhou_ = false;
    desenharTelaListaWifi(redes_, 0, 0, "", EstadoListaWifi::BUSCANDO);
    if (!acoes_.iniciarBusca()) {
      buscaFalhou_ = true;
      mostrarLista();
    }
  }

  void mostrarLista() {
    etapa_ = EtapaWifi::LISTA;
    interacao_ = millis();
    if (pagina_ >= paginasListaWifi(quantidade_)) pagina_ = 0;
    desenharTelaListaWifi(redes_, quantidade_, pagina_, acoes_.redeConfigurada(), estadoLista());
  }

  void tratarBusca() {
    const unsigned long decorrido = millis() - inicioEtapa_;
    animarBuscaWifi(decorrido);
    if (verificarToqueListaWifi(0, 0, EstadoListaWifi::BUSCANDO).acao == AcaoListaWifi::VOLTAR) {
      acoes_.cancelarBusca();
      encerrar(ResultadoAssistenteWifi::CANCELADO);
      return;
    }
    const int encontradas = acoes_.consultarBusca(redes_, MAX_REDES);
    if (encontradas == -1 && decorrido < WIFI_BUSCA_MAX_MS) return;
    if (encontradas < 0) {
      acoes_.cancelarBusca();
      buscaFalhou_ = true;
    } else {
      quantidade_ = encontradas > MAX_REDES ? MAX_REDES : encontradas;
    }
    mostrarLista();
  }

  void tratarLista() {
    const EventoListaWifi evento = verificarToqueListaWifi(quantidade_, pagina_, estadoLista());
    if (evento.acao == AcaoListaWifi::NENHUMA) {
      if (millis() - interacao_ >= WIFI_INATIVIDADE_MS) encerrar(ResultadoAssistenteWifi::EXPIROU);
      return;
    }
    interacao_ = millis();
    switch (evento.acao) {
      case AcaoListaWifi::REDE:
        ssid_ = redes_[evento.indice].ssid;
        abrirTeclado(EtapaWifi::SENHA);
        break;
      case AcaoListaWifi::ACIMA:
      case AcaoListaWifi::ABAIXO:
        pagina_ += evento.acao == AcaoListaWifi::ABAIXO ? 1 : -1;
        desenharPaginaListaWifi(redes_, quantidade_, pagina_, acoes_.redeConfigurada(), estadoLista());
        break;
      case AcaoListaWifi::ATUALIZAR: buscar(); break;
      case AcaoListaWifi::OUTRA:
        ssid_ = "";
        abrirTeclado(EtapaWifi::NOME);
        break;
      case AcaoListaWifi::VOLTAR: encerrar(ResultadoAssistenteWifi::CANCELADO); break;
      default: break;
    }
  }

  void abrirTeclado(EtapaWifi etapa) {
    etapa_ = etapa;
    interacao_ = millis();
    limparTexto();
    aviso_ = "";
    teclado_ = EstadoTecladoWifi();
    teclado_.senha = etapa == EtapaWifi::SENHA;
    desenharTelaTeclado();
  }

  void desenharTelaTeclado() {
    String titulo = aviso_;
    if (titulo.isEmpty()) titulo = tituloPadrao();
    const uint16_t cor = aviso_.isEmpty() ? corTexto : avisoBrando_ ? corAlerta : corErro;
    desenharTelaTecladoWifi(titulo, cor, ssid_, texto_, teclado_, textoValido(), rotuloConfirmar());
  }

  void voltarParaSenha(const char* aviso, bool brando = false) {
    etapa_ = EtapaWifi::SENHA;
    interacao_ = millis();
    aviso_ = aviso;
    avisoBrando_ = brando;
    // A senha digitada fica, para corrigir so o que estiver errado.
    teclado_.camada = CAMADA_LETRAS;
    teclado_.maiusculas = 0;
    desenharTelaTeclado();
  }

  void tratarTeclado() {
    atualizarFeedbackTeclado();
    const EventoTecladoWifi evento = verificarToqueTecladoWifi(teclado_);
    if (evento.acao == AcaoTecladoWifi::NENHUMA) {
      if (millis() - interacao_ >= WIFI_INATIVIDADE_MS) encerrar(ResultadoAssistenteWifi::EXPIROU);
      return;
    }
    interacao_ = millis();
    const bool validoAntes = textoValido();
    switch (evento.acao) {
      case AcaoTecladoWifi::CARACTERE:
        if ((int)texto_.length() >= maximo()) return;
        texto_ += evento.caractere;
        limparAviso();
        if (teclado_.maiusculas == 1 && teclado_.camada == CAMADA_LETRAS) {
          teclado_.maiusculas = 0;
          desenharTecladoWifi(teclado_, textoValido(), rotuloConfirmar());
        }
        desenharCampoTextoWifi(texto_, teclado_);
        break;
      case AcaoTecladoWifi::APAGAR:
        if (texto_.isEmpty()) return;
        texto_.remove(texto_.length() - 1);
        limparAviso();
        desenharCampoTextoWifi(texto_, teclado_);
        break;
      case AcaoTecladoWifi::MAIUSCULAS:
        teclado_.maiusculas = (teclado_.maiusculas + 1) % 3;
        desenharTecladoWifi(teclado_, validoAntes, rotuloConfirmar());
        return;
      case AcaoTecladoWifi::CAMADA:
        teclado_.camada = evento.camada;
        desenharTecladoWifi(teclado_, validoAntes, rotuloConfirmar());
        return;
      case AcaoTecladoWifi::VOLTAR:
        limparTexto();
        mostrarLista();
        return;
      case AcaoTecladoWifi::CONFIRMAR:
        if (!validoAntes) return;
        if (etapa_ == EtapaWifi::NOME) {
          ssid_ = texto_;  // copia antes de abrirTeclado limpar o campo
          abrirTeclado(EtapaWifi::SENHA);
        } else {
          testar();
        }
        return;
      default:
        return;
    }
    if (textoValido() != validoAntes) atualizarTeclaConfirmarWifi(teclado_, !validoAntes, rotuloConfirmar());
  }

  void testar() {
    etapa_ = EtapaWifi::TESTANDO;
    inicioEtapa_ = millis();
    desenharTelaTestandoWifi(ssid_);
    acoes_.iniciarTeste(ssid_, texto_);
  }

  void tratarTeste() {
    const unsigned long decorrido = millis() - inicioEtapa_;
    atualizarTestandoWifi(decorrido);
    if (verificarToqueCancelarPortalWifi()) {
      acoes_.encerrarTeste(false);
      voltarParaSenha("Teste cancelado", true);
      return;
    }
    switch (acoes_.consultarTeste(decorrido >= WIFI_TESTE_MAX_MS)) {
      case TesteWifi::EM_ANDAMENTO:
        return;
      case TesteWifi::CONECTOU:
        if (acoes_.salvarRede(ssid_, texto_)) {
          acoes_.encerrarTeste(true);
          encerrar(ResultadoAssistenteWifi::CONECTOU);
        } else {
          acoes_.encerrarTeste(false);
          voltarParaSenha("Nao foi possivel salvar");
        }
        return;
      case TesteWifi::SENHA:
        acoes_.encerrarTeste(false);
        voltarParaSenha("Senha incorreta? Confira");
        return;
      case TesteWifi::SEM_REDE:
        acoes_.encerrarTeste(false);
        voltarParaSenha("Rede nao encontrada");
        return;
      default:
        acoes_.encerrarTeste(false);
        voltarParaSenha("A rede nao respondeu");
        return;
    }
  }
};

ResultadoAssistenteWifi executarAssistenteWifi(AcoesWifiTela& acoes) {
  AssistenteWifi assistente(acoes);
  assistente.iniciar();
  while (assistente.passo()) delay(10);
  return assistente.resultado();
}

#endif  // PARAAI_ASSISTENTE_WIFI_H
