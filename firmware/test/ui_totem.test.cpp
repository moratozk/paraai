#include <cassert>
#include <cstdio>
#include <filesystem>
#include <vector>
#include "../totem/DisplayUI.ino"
#include "../totem/AssistenteWiFi.h"

// Rádio simulado para o fluxo de Wi-Fi na tela: nenhum ESP32 envolvido.
struct RadioSimulado : AcoesWifiTela {
  std::vector<RedeWifiTela> redes;
  int consultasAteTerminar = 3, consultas = 0;
  bool buscaFalha = false, buscaCancelada = false;
  int buscas = 0;
  String ssidTestado, senhaTestada;
  TesteWifi resposta = TesteWifi::CONECTOU;  // EM_ANDAMENTO: só responde no prazo
  int consultasTeste = 0, encerramentos = 0;
  bool manteveNova = false, salvarFunciona = true;
  String salvoSsid, salvaSenha, configurada;
  bool iniciarBusca() override { ++buscas; consultas = 0; buscaCancelada = false; return true; }
  int consultarBusca(RedeWifiTela* destino, uint8_t capacidade) override {
    if (++consultas < consultasAteTerminar) return -1;
    if (buscaFalha) return -2;
    int n = 0;
    for (const auto& r : redes) if (n < capacidade) destino[n++] = r;
    return n;
  }
  void cancelarBusca() override { buscaCancelada = true; }
  void iniciarTeste(const String& ssid, const String& senha) override {
    ssidTestado = ssid; senhaTestada = senha; consultasTeste = 0;
  }
  TesteWifi consultarTeste(bool prazoEsgotado) override {
    if (resposta == TesteWifi::EM_ANDAMENTO) return prazoEsgotado ? TesteWifi::FALHOU : TesteWifi::EM_ANDAMENTO;
    return ++consultasTeste < 3 ? TesteWifi::EM_ANDAMENTO : resposta;
  }
  void encerrarTeste(bool manter) override { ++encerramentos; manteveNova = manter; }
  bool salvarRede(const String& ssid, const String& senha) override {
    if (!salvarFunciona) return false;
    salvoSsid = ssid; salvaSenha = senha; configurada = ssid;
    return true;
  }
  String redeConfigurada() override { return configurada; }
};

void soltar() {
  ts.pressionado = false;
  atualizarEstadoToque();
  delay(50);
  atualizarEstadoToque();
}
void pressionar(int x, int y) {
  ts.pressionado = true;
  ts.ponto.x = map(x, 0, 319, touchXMin, touchXMax) + 1;
  ts.ponto.y = map(y, 0, 239, touchYMin, touchYMax) + 1;
  atualizarEstadoToque();
  delay(30);
}
int main(int argc, char** argv) {
  const std::string destino = argc > 1 ? argv[1] : ".runtime/preview";
  std::filesystem::create_directories(destino);
  initCores();
  conexaoVisual = ConexaoTotem::PRONTO;
  desenharTelaInicial();
  tft.salvar(destino + "/01-inicio.svg");
  pressionar(160, 115);
  assert(verificarToqueTelaInicial() == OP_ENTRADA);
  assert(verificarToqueTelaInicial() == OP_NENHUMA); // Dedo mantido.
  definirOperacaoVisual(OP_ENTRADA);
  desenharTelaTeclado("", FORMATO_NAO_ESCOLHIDO);
  assert(verificarToqueTeclado("", FORMATO_NAO_ESCOLHIDO).acao == TECLADO_NENHUMA);
  soltar();
  pressionar(24,92);
  auto evento = verificarToqueTeclado("", FORMATO_NAO_ESCOLHIDO);
  assert(evento.acao == TECLADO_CARACTERE && evento.caractere == 'A');
  assert(verificarToqueTeclado("A", FORMATO_NAO_ESCOLHIDO).acao == TECLADO_NENHUMA);
  atualizarDigitacao("A", FORMATO_NAO_ESCOLHIDO, MODO_TECLADO_LETRAS);
  tft.salvar(destino + "/02-tecla.svg");
  soltar(); delay(120); atualizarFeedbackTeclado();
  tft.salvar(destino + "/03-letras.svg");
  assert(obterModoTeclado("ABC", FORMATO_NAO_ESCOLHIDO) == MODO_TECLADO_NUMEROS);
  desenharTelaTeclado("ABC", FORMATO_NAO_ESCOLHIDO);
  tft.salvar(destino + "/04-numeros.svg");
  desenharTelaTeclado("ABC1", FORMATO_NAO_ESCOLHIDO);
  tft.salvar(destino + "/05-formato.svg");
  assert(obterModoTeclado("ABC1", FORMATO_MERCOSUL) == MODO_TECLADO_LETRAS);
  assert(obterModoTeclado("ABC1", FORMATO_ANTIGA) == MODO_TECLADO_NUMEROS);
  assert(placaProntaParaConfirmar("ABC1D23", FORMATO_MERCOSUL));
  assert(placaProntaParaConfirmar("ABC1234", FORMATO_ANTIGA));
  assert(!placaProntaParaConfirmar("ABC1D23", FORMATO_ANTIGA));
  assert(!placaProntaParaConfirmar("ABC1234", FORMATO_MERCOSUL));
  // Todos os alvos desenhados devem entregar o caractere correto.
  for (int linha=0; linha<3; ++linha) {
    const int quantidade=LETRAS_POR_LINHA[linha];
    const int offset=(TELA_W-(quantidade*LETRA_W+(quantidade-1)*LETRA_GAP))/2;
    for (int coluna=0; coluna<quantidade; ++coluna) {
      soltar(); pressionar(offset+coluna*(LETRA_W+LETRA_GAP)+LETRA_W/2, LETRA_ROW_Y[linha]+LETRA_H/2);
      evento=verificarToqueTeclado("", FORMATO_NAO_ESCOLHIDO);
      assert(evento.acao==TECLADO_CARACTERE && evento.caractere==LINHAS_LETRAS[linha][coluna]);
    }
  }
  for (int linha=0; linha<2; ++linha) for (int coluna=0; coluna<5; ++coluna) {
    const int offset=(TELA_W-(5*NUMERO_W+4*NUMERO_GAP))/2;
    soltar(); pressionar(offset+coluna*(NUMERO_W+NUMERO_GAP)+NUMERO_W/2, NUMERO_ROW_Y[linha]+NUMERO_H/2);
    evento=verificarToqueTeclado("ABC", FORMATO_NAO_ESCOLHIDO);
    assert(evento.acao==TECLADO_CARACTERE && evento.caractere==LINHAS_NUMEROS[linha][coluna]);
  }
  soltar();
  desenharTelaTeclado("ABC1D23", FORMATO_MERCOSUL);
  tft.salvar(destino + "/06-confirmar.svg");
  pressionar(235,150);
  assert(verificarToqueTeclado("ABC1D23", FORMATO_MERCOSUL).acao == TECLADO_CONFIRMAR);
  soltar();
  desenharTelaProcessando("Registrando entrada...");
  delay(120); atualizarProcessamento("Registrando entrada...", 120);
  const auto frame = tft.pixels;
  delay(120); atualizarProcessamento("Registrando entrada...", 240);
  assert(tft.pixels != frame); // Animação atualiza sem rede ou redraw da tela inteira.
  tft.salvar(destino + "/07-processando.svg");
  desenharTelaResultado(RESULTADO_SUCESSO, "ENTRADA CONFIRMADA", "ABC1D23", "Vaga 200 - R$ 10000,00/h");
  desenharBotaoConcluir();
  tft.salvar(destino + "/08-entrada.svg");
  pressionar(160,218);
  assert(verificarToqueConcluir());
  assert(!verificarToqueConcluir());
  soltar();
  desenharTelaResultado(RESULTADO_SUCESSO, "SAIDA CONFIRMADA", "R$ 8,50", "60 min - ABC1D23");
  desenharBotaoConcluir(); tft.salvar(destino + "/09-saida.svg");
  desenharTelaResultado(RESULTADO_ERRO, "NAO FOI CONFIRMADO", "Confira a conexao", "Confira o registro no painel");
  desenharBotaoConcluir(); tft.salvar(destino + "/10-erro.svg");
  desenharTelaConfirmarCadastro("ABC1D23"); tft.salvar(destino + "/11-cadastro.svg");
  atualizarStatusServico(ConexaoTotem::MANUTENCAO);
  desenharTelaConfiguracoes(); tft.salvar(destino + "/12-manutencao.svg");
  soltar();
  desenharTelaPin(); tft.salvar(destino + "/13-pin.svg");
  const auto tocarPin = [](int i) { pressionar(pinTeclaX(i) + PIN_TECLA_W / 2, pinTeclaY(i) + PIN_TECLA_H / 2); };
  tocarPin(4);
  assert(verificarToquePin() == '5');
  assert(verificarToquePin() == 0); // Dedo mantido não repete o dígito.
  soltar(); tocarPin(10);
  assert(verificarToquePin() == '0');
  soltar(); tocarPin(9);
  assert(verificarToquePin() == PIN_APAGAR);
  soltar(); tocarPin(11);
  assert(verificarToquePin() == PIN_CONFIRMAR);
  soltar(); delay(120); atualizarFeedbackTeclado();
  atualizarDigitosPin(6); tft.salvar(destino + "/14-pin-digitado.svg");
  desenharTelaPin("PIN INCORRETO"); tft.salvar(destino + "/15-pin-incorreto.svg");
  desenharTelaPortalWifi("ParaAi-123456", "abcDEF123456", "192.168.4.1", "Conecte pelo celular");
  tft.salvar(destino + "/16-wifi.svg");
  // Toda mensagem do atendimento (Atendimento.cpp e totem.ino, com os maiores
  // valores possíveis) precisa caber na tela e usar só glifos da fonte: fora de
  // 0x20..0x7A a Adafruit_GFX simplesmente pula o caractere.
  const auto cabe = [](const char* texto, const GFXfont* fonte) {
    for (const char* c = texto; *c; ++c)
      if (static_cast<uint8_t>(*c) < fonte->first || static_cast<uint8_t>(*c) > fonte->last) return false;
    return larguraTexto(texto, fonte, 1) <= TELA_W - 16;
  };
  for (const char* titulo : {"CADASTRO INATIVO", "CADASTRO INVALIDO", "CONEXAO INDISPONIVEL", "VERIFIQUE O PAINEL",
       "CONFIRA A PLACA", "ENTRADA CONFIRMADA", "USE O OUTRO TOTEM", "JA ESTA ESTACIONADO", "SEM VAGAS LIVRES",
       "ESTADIA INCONSISTENTE", "NAO FOI CONFIRMADO", "OPERACAO RECUSADA", "PLACA SEM CADASTRO", "SAIDA COM PENDENCIA",
       "SAIDA CONFIRMADA", "SALDO PENDENTE", "SEM CONEXAO", "SEM ENTRADA ABERTA", "TENTE NOVAMENTE",
       "VAGA INCONSISTENTE", "SERVICO INDISPONIVEL", "ACESSO BLOQUEADO", "WI-FI CONFIGURADO"})
    assert(cabe(titulo, FONTE_GRANDE));
  for (const char* detalhe : {"Aguarde a reconexao", "Nada foi registrado", "Estacionamento lotado",
       "Confira horario e tarifa", "Confira a conexao", "Saida nao registrada", "Pedido nao enviado",
       "R$ 10000,00 em 1440 min", "R$ 10000,00", "ABC1D23", "Muitas tentativas de PIN"})
    assert(cabe(detalhe, FONTE_GRANDE));
  for (const char* ajuda : {"Nenhuma operacao foi enviada", "Procure o responsavel", "Tente mais tarde",
       "Confira o registro no painel", "Tente novamente", "Os dados mudaram agora", "Use SAIDA ao terminar",
       "Confira os caracteres", "A entrada foi em outro local", "Nenhuma saida a registrar",
       "Regularize no app para entrar", "Regularize no app - ABC1D23", "1440 min - ABC1D23",
       "Vaga 200 - R$ 10000,00/h", "Vaga reservada 200 - R$ 10000,00/h", "Aguarde alguns minutos", "Reiniciando o atendimento", "999 s - Aguarde a confirmacao"})
    assert(cabe(ajuda, FONTE_MEDIA));
  assert(!cabe("60 min | ABC1D23", FONTE_MEDIA)); // A barra não existe na fonte.
  desenharTelaResultado(RESULTADO_ALERTA, "SAIDA COM PENDENCIA", "R$ 10000,00 em 1440 min", "Regularize no app - ABC1D23");
  desenharBotaoConcluir(); tft.salvar(destino + "/17-saida-pendente.svg");
  desenharTelaResultado(RESULTADO_ALERTA, "SALDO PENDENTE", "ABC1D23", "Regularize no app para entrar");
  desenharBotaoConcluir(); tft.salvar(destino + "/18-entrada-bloqueada.svg");
  assert(calibracaoTouchPlausivel(200,3700,200,3700));
  assert(calibracaoTouchPlausivel(3700,200,3700,200));
  assert(!calibracaoTouchPlausivel(200,200,200,3700));
  int x,y;
  mapearToqueBruto(1950,1950,200,3700,200,3700,x,y);
  assert(x==159 && y==119);
  mapearToqueBruto(-500,8000,200,3700,200,3700,x,y);
  assert(x==0 && y==239);

  // ---------------------------------------------------------------------
  // Wi-Fi na tela do totem (AssistenteWiFi.h)
  // ---------------------------------------------------------------------
  soltar();
  desenharTelaConfiguracoes();
  const auto tocarMenu = [](int px, int py) { soltar(); pressionar(px, py); return verificarToqueConfiguracoes(); };
  assert(tocarMenu(160, 90) == 1 && tocarMenu(160, 134) == 4 && tocarMenu(160, 176) == 2 && tocarMenu(160, 218) == 3);
  soltar();

  // Fontes próprias têm buracos (" e [ \ ] ^ _ `): o glifo existe, mas vazio.
  const auto cabeEm = [](const char* texto, const GFXfont* fonte, int largura) {
    for (const char* c = texto; *c; ++c) {
      const uint8_t u = static_cast<uint8_t>(*c);
      if (u < fonte->first || u > fonte->last) return false;
      if (u != ' ' && fonte->glyph[u - fonte->first].width == 0) return false;
    }
    return larguraTexto(texto, fonte, 1) <= largura;
  };
  for (const char* t : {"ESCOLHA A REDE", "Procurando redes...", "NENHUMA REDE ENCONTRADA", "A BUSCA FALHOU"})
    assert(cabeEm(t, FONTE_MEDIA, TELA_W - 20));
  for (const char* t : {"So redes 2,4 GHz com senha", "So aparecem redes 2,4 GHz", "protegidas por senha.",
       "Rede oculta? Use OUTRA REDE", "Toque em ATUALIZAR", "999 s - aguarde a conexao"})
    assert(cabeEm(t, FONTE_PEQUENA, TELA_W - 20));
  assert(cabeEm("TROCAR WIFI", FONTE_GRANDE, 270) && cabeEm("WIFI PELO CELULAR", FONTE_MEDIA, 270));
  for (const char* t : {"SENHA DA REDE", "NOME DA REDE OCULTA", "Senha incorreta? Confira", "Rede nao encontrada",
       "A rede nao respondeu", "Nao foi possivel salvar", "Teste cancelado", "Igual ao do roteador"})
    assert(cabeEm(t, FONTE_PEQUENA, TW_TITULO_W));
  assert(cabeEm("minimo 8 caracteres", FONTE_PEQUENA, TW_CAMPO_W - 26));
  assert(cabeEm("nome exato da rede", FONTE_PEQUENA, TW_CAMPO_W - 26));
  assert(cabeEm("VOLTAR", FONTE_PEQUENA, TW_VOLTAR_W - 8) && cabeEm("ATUAL", FONTE_PEQUENA, 60));
  assert(cabeEm("VOLTAR", FONTE_PEQUENA, LW_VOLTAR_W - 8) && cabeEm("OUTRA REDE", FONTE_PEQUENA, LW_OUTRA_W - 8));
  assert(cabeEm("ATUALIZAR", FONTE_PEQUENA, LW_ATUALIZAR_W - 8));
  {
    TeclaWifi t;
    assert(posicaoTeclaWifi(CAMADA_LETRAS, 3, 0, t) && cabeEm("?123", FONTE_PEQUENA, t.w - 4) && cabeEm("ABC", FONTE_PEQUENA, t.w - 4));
    assert(posicaoTeclaWifi(CAMADA_LETRAS, 3, 1, t) && cabeEm("ESPACO", FONTE_PEQUENA, t.w - 4));
    assert(posicaoTeclaWifi(CAMADA_LETRAS, 3, 2, t) && cabeEm("CONECTAR", FONTE_MEDIA, t.w - 6) && cabeEm("AVANCAR", FONTE_MEDIA, t.w - 6));
    assert(posicaoTeclaWifi(CAMADA_SIMBOLOS, 2, 0, t) && cabeEm("#+=", FONTE_PEQUENA, t.w - 4) && cabeEm("123", FONTE_PEQUENA, t.w - 4));
  }

  {
    // Lista com uma fonte só: a maior apenas se todos os nomes couberem nela.
    RedeWifiTela curtas[] = {{"Casa_2G", -50}, {"Oficina", -70}};
    RedeWifiTela mistas[] = {{"Casa_2G", -50}, {"VIVOFIBRA-2G-A1B2", -61}};
    RedeWifiTela quinze[] = {{"Casa_2G_Andar_1", -50}};  // 15 caracteres: cabe, salvo ao lado de ATUAL
    assert(listaWifiCabeNaFonteGrande(curtas, 2, "") && !listaWifiCabeNaFonteGrande(mistas, 2, ""));
    assert(listaWifiCabeNaFonteGrande(quinze, 1, "Oficina") && !listaWifiCabeNaFonteGrande(quinze, 1, "Casa_2G_Andar_1"));
  }

  // Cada tecla, do centro às bordas, entrega o que mostra; as três camadas
  // cobrem os 95 caracteres ASCII imprimíveis.
  bool alcancavel[128] = {};
  for (int camada = 0; camada < 3; ++camada) {
    for (int maiusculas = 0; maiusculas < 2; ++maiusculas) {
      EstadoTecladoWifi estado;
      estado.camada = static_cast<CamadaTecladoWifi>(camada);
      estado.maiusculas = maiusculas;
      desenharTelaTecladoWifi("SENHA DA REDE", corTexto, "Casa_2G", "", estado, false, "CONECTAR");
      for (int linha = 0; linha < 4; ++linha) {
        TeclaWifi t;
        for (int coluna = 0; posicaoTeclaWifi(estado.camada, linha, coluna, t); ++coluna) {
          assert(t.x >= 0 && t.x + t.w <= TELA_W && t.y + t.h <= TELA_H && t.w >= 27 && t.h >= 30);
          EventoTecladoWifi centro{};
          for (int ponto = 0; ponto < 3; ++ponto) {
            const int px = ponto == 0 ? t.x + t.w / 2 : ponto == 1 ? t.x + 1 : t.x + t.w - 1;
            const int py = ponto == 0 ? t.y + t.h / 2 : ponto == 1 ? t.y + 1 : t.y + t.h - 1;
            soltar(); pressionar(px, py);
            const EventoTecladoWifi e = verificarToqueTecladoWifi(estado);
            if (ponto == 0) centro = e;
            assert(e.acao == centro.acao && e.caractere == centro.caractere && e.camada == centro.camada);
            soltar(); delay(120); atualizarFeedbackTeclado();
          }
          if (static_cast<unsigned char>(t.codigo) >= 0x20) {
            assert(centro.acao == AcaoTecladoWifi::CARACTERE && centro.caractere == caractereTeclaWifi(t.codigo, estado));
            alcancavel[static_cast<unsigned char>(centro.caractere)] = true;
          } else if (t.codigo == TW_APAGAR) assert(centro.acao == AcaoTecladoWifi::APAGAR);
          else if (t.codigo == TW_CONFIRMAR) assert(centro.acao == AcaoTecladoWifi::CONFIRMAR);
          else if (t.codigo == TW_MAIUSCULAS) assert(centro.acao == AcaoTecladoWifi::MAIUSCULAS);
          else assert(centro.acao == AcaoTecladoWifi::CAMADA && centro.camada != estado.camada);
        }
      }
    }
  }
  for (int c = 0x20; c <= 0x7E; ++c) assert(alcancavel[c]);
  {
    EstadoTecladoWifi estado;
    soltar(); pressionar(TW_VOLTAR_X + 10, TW_VOLTAR_Y + 10);
    assert(verificarToqueTecladoWifi(estado).acao == AcaoTecladoWifi::VOLTAR);
    soltar(); pressionar(TW_CAMPO_X + TW_CAMPO_W - 20, TW_CAMPO_Y + 14);  // o campo não é botão
    assert(verificarToqueTecladoWifi(estado).acao == AcaoTecladoWifi::NENHUMA);
    soltar();
  }

  // Fluxo completo com o rádio simulado: o mesmo código que roda no totem.
  const auto tocarEm = [](AssistenteWifi& a, int px, int py) {
    soltar(); a.passo(); pressionar(px, py); a.passo(); soltar(); a.passo();
  };
  const auto tocarTecla = [&](AssistenteWifi& a, char codigo) {
    for (int linha = 0; linha < 4; ++linha) {
      TeclaWifi t;
      for (int coluna = 0; posicaoTeclaWifi(a.teclado().camada, linha, coluna, t); ++coluna)
        if (t.codigo == codigo) { tocarEm(a, t.x + t.w / 2, t.y + t.h / 2); return true; }
    }
    return false;
  };
  // Digita como uma pessoa: troca de camada e usa a tecla de maiúsculas.
  const auto digitar = [&](AssistenteWifi& a, const char* texto) {
    for (const char* p = texto; *p; ++p) {
      const bool maiuscula = *p >= 'A' && *p <= 'Z';
      const char base = maiuscula ? *p - 'A' + 'a' : *p;
      int alvo = -1;
      for (int camada = 0; camada < 3 && alvo < 0; ++camada)
        for (int linha = 0; linha < 4 && alvo < 0; ++linha)
          if (std::strchr(TECLADO_WIFI[camada][linha], base)) alvo = camada;
      assert(alvo >= 0);
      while (a.teclado().camada != alvo) {
        const bool deLetras = a.teclado().camada == CAMADA_LETRAS;
        const char comando = alvo == CAMADA_LETRAS ? TW_LETRAS
          : deLetras ? TW_SIMBOLOS : alvo == CAMADA_SIMBOLOS ? TW_MENOS_SIMBOLOS : TW_MAIS_SIMBOLOS;
        assert(tocarTecla(a, comando));
      }
      if (maiuscula && a.teclado().maiusculas == 0) assert(tocarTecla(a, TW_MAIUSCULAS));
      assert(tocarTecla(a, base));
    }
  };

  {
    RadioSimulado radio;
    radio.configurada = "Casa_2G";
    radio.redes = {{"Casa_2G", -48}, {"VIVOFIBRA-2G-A1B2", -61}, {"Fam\xc3\xadlia Concei\xc3\xa7\xc3\xa3o", -67},
                   {"NET_VIRTUA_[apto 42]~casa", -72}, {"iPhone de Lucas", -79}, {"Oficina", -88}};
    AssistenteWifi a(radio);
    a.iniciar();
    assert(a.etapa() == EtapaWifi::BUSCANDO && radio.buscas == 1);
    tft.salvar(destino + "/20-buscando.svg");
    while (a.etapa() == EtapaWifi::BUSCANDO) assert(a.passo());
    assert(a.etapa() == EtapaWifi::LISTA && a.quantidadeRedes() == 6 && a.pagina() == 0);
    tft.salvar(destino + "/19-redes.svg");
    tocarEm(a, LW_SETA_X + 20, LW_ABAIXO_Y + 30);
    assert(a.pagina() == 1);
    tft.salvar(destino + "/21-pagina.svg");
    tocarEm(a, LW_SETA_X + 20, LW_ABAIXO_Y + 30);              // já é a última
    tocarEm(a, 100, LW_LINHA_Y0 + 2 * LW_LINHA_PASSO + 16);    // linha vazia
    assert(a.pagina() == 1 && a.etapa() == EtapaWifi::LISTA);
    tocarEm(a, LW_SETA_X + 20, LW_ACIMA_Y + 30);
    assert(a.pagina() == 0);
    tocarEm(a, 100, LW_LINHA_Y0 + LW_LINHA_PASSO + 16);
    assert(a.etapa() == EtapaWifi::SENHA && a.redeEscolhida() == "VIVOFIBRA-2G-A1B2");
    assert(a.teclado().senha && a.textoDigitado().isEmpty());
    tft.salvar(destino + "/22-teclado.svg");

    digitar(a, "abc");
    assert(tocarTecla(a, TW_CONFIRMAR) && a.etapa() == EtapaWifi::SENHA);  // menos de 8: não testa
    for (int i = 0; i < 4; ++i) assert(tocarTecla(a, TW_APAGAR));          // apagar no vazio não quebra
    assert(a.textoDigitado().isEmpty());
    digitar(a, "Senha_d0 Wi-Fi!");
    assert(a.textoDigitado() == "Senha_d0 Wi-Fi!" && a.teclado().maiusculas == 0);
    tft.salvar(destino + "/23-senha.svg");
    assert(a.teclado().camada == CAMADA_SIMBOLOS);                          // o "!" ficou nos símbolos
    assert(!tocarTecla(a, TW_SIMBOLOS) && tocarTecla(a, TW_LETRAS) && tocarTecla(a, TW_SIMBOLOS));
    tft.salvar(destino + "/24-simbolos.svg");
    assert(tocarTecla(a, TW_MAIS_SIMBOLOS));
    tft.salvar(destino + "/25-maissimbolos.svg");
    assert(tocarTecla(a, TW_LETRAS) && tocarTecla(a, TW_MAIUSCULAS) && tocarTecla(a, TW_MAIUSCULAS));
    assert(a.teclado().maiusculas == 2);                                    // fixas
    assert(tocarTecla(a, 'x') && tocarTecla(a, 'y') && a.textoDigitado() == "Senha_d0 Wi-Fi!XY");
    assert(tocarTecla(a, TW_MAIUSCULAS) && a.teclado().maiusculas == 0);
    assert(tocarTecla(a, TW_APAGAR) && tocarTecla(a, TW_APAGAR));

    radio.resposta = TesteWifi::SENHA;
    assert(tocarTecla(a, TW_CONFIRMAR) && a.etapa() == EtapaWifi::TESTANDO);
    assert(radio.ssidTestado == "VIVOFIBRA-2G-A1B2" && radio.senhaTestada == "Senha_d0 Wi-Fi!");
    tft.salvar(destino + "/26-testando.svg");
    while (a.etapa() == EtapaWifi::TESTANDO) assert(a.passo());
    assert(a.etapa() == EtapaWifi::SENHA && a.aviso() == "Senha incorreta? Confira");
    assert(radio.encerramentos == 1 && !radio.manteveNova && a.textoDigitado() == "Senha_d0 Wi-Fi!");
    tft.salvar(destino + "/27-senhaerrada.svg");
    assert(tocarTecla(a, TW_APAGAR) && a.aviso().isEmpty());                // corrigir apaga o aviso
    digitar(a, "?");
    radio.resposta = TesteWifi::CONECTOU;
    assert(tocarTecla(a, TW_CONFIRMAR));
    while (a.passo()) {}
    assert(a.resultado() == ResultadoAssistenteWifi::CONECTOU && radio.manteveNova);
    assert(radio.salvoSsid == "VIVOFIBRA-2G-A1B2" && radio.salvaSenha == "Senha_d0 Wi-Fi?");
    assert(a.textoDigitado().isEmpty());                                    // a senha não fica no fluxo
    desenharTelaWifiConectado(radio.salvoSsid);
    tft.salvar(destino + "/28-conectado.svg");
  }
  {
    RadioSimulado radio;  // nenhuma rede ao redor e nenhuma configurada
    AssistenteWifi a(radio);
    a.iniciar();
    while (a.etapa() == EtapaWifi::BUSCANDO) assert(a.passo());
    assert(a.etapa() == EtapaWifi::LISTA && a.quantidadeRedes() == 0);
    tft.salvar(destino + "/29-semredes.svg");
    tocarEm(a, 100, LW_LINHA_Y0 + 16);
    assert(a.etapa() == EtapaWifi::LISTA);
    tocarEm(a, LW_OUTRA_X + 50, LW_RODAPE_Y + 18);
    assert(a.etapa() == EtapaWifi::NOME && a.redeEscolhida().isEmpty() && !a.teclado().senha);
    digitar(a, "Rede_Oculta");
    tft.salvar(destino + "/30-oculta.svg");
    assert(tocarTecla(a, TW_CONFIRMAR));
    assert(a.etapa() == EtapaWifi::SENHA && a.redeEscolhida() == "Rede_Oculta" && a.textoDigitado().isEmpty());
    digitar(a, "12345678");
    radio.resposta = TesteWifi::EM_ANDAMENTO;
    assert(tocarTecla(a, TW_CONFIRMAR) && a.etapa() == EtapaWifi::TESTANDO);
    tocarEm(a, 160, 216);                                                   // CANCELAR
    assert(a.etapa() == EtapaWifi::SENHA && a.aviso() == "Teste cancelado" && radio.encerramentos == 1);
    assert(tocarTecla(a, TW_CONFIRMAR) && a.etapa() == EtapaWifi::TESTANDO);
    delay(WIFI_TESTE_MAX_MS); a.passo();                                    // rádio mudo: vale o prazo
    assert(a.etapa() == EtapaWifi::SENHA && a.aviso() == "A rede nao respondeu");
    radio.resposta = TesteWifi::CONECTOU;
    radio.salvarFunciona = false;
    assert(tocarTecla(a, TW_CONFIRMAR));
    while (a.etapa() == EtapaWifi::TESTANDO) assert(a.passo());
    assert(a.aviso() == "Nao foi possivel salvar" && !radio.manteveNova && radio.configurada.isEmpty());
    radio.resposta = TesteWifi::SEM_REDE;
    assert(tocarTecla(a, TW_CONFIRMAR));
    while (a.etapa() == EtapaWifi::TESTANDO) assert(a.passo());
    assert(a.aviso() == "Rede nao encontrada");
    tocarEm(a, TW_VOLTAR_X + 20, TW_VOLTAR_Y + 15);
    assert(a.etapa() == EtapaWifi::LISTA && a.textoDigitado().isEmpty());
    tocarEm(a, LW_VOLTAR_X + 40, LW_RODAPE_Y + 18);
    assert(a.etapa() == EtapaWifi::CONCLUIDO && a.resultado() == ResultadoAssistenteWifi::CANCELADO);
  }
  {
    RadioSimulado radio;
    radio.buscaFalha = true;
    AssistenteWifi a(radio);
    a.iniciar();
    while (a.etapa() == EtapaWifi::BUSCANDO) assert(a.passo());
    assert(a.etapa() == EtapaWifi::LISTA && radio.buscaCancelada);
    tft.salvar(destino + "/31-buscafalhou.svg");
    tocarEm(a, 100, LW_LINHA_Y0 + 16);                                      // nada para escolher
    assert(a.etapa() == EtapaWifi::LISTA);
    radio.buscaFalha = false;
    tocarEm(a, LW_ATUALIZAR_X + 40, LW_RODAPE_Y + 18);
    assert(a.etapa() == EtapaWifi::BUSCANDO && radio.buscas == 2);
    tocarEm(a, LW_VOLTAR_X + 40, LW_RODAPE_Y + 18);                         // desistir no meio da busca
    assert(a.resultado() == ResultadoAssistenteWifi::CANCELADO && a.etapa() == EtapaWifi::CONCLUIDO);
    assert(radio.buscaCancelada);
  }
  {
    // Ninguém mexe: a lista e o teclado expiram e a senha some.
    RadioSimulado radio;
    radio.redes = {{"Casa_2G", -50}};
    AssistenteWifi a(radio);
    a.iniciar();
    while (a.etapa() == EtapaWifi::BUSCANDO) assert(a.passo());
    delay(WIFI_INATIVIDADE_MS - 1000);
    assert(a.passo() && a.etapa() == EtapaWifi::LISTA);
    tocarEm(a, 100, LW_LINHA_Y0 + 16);
    digitar(a, "segredo1");
    delay(WIFI_INATIVIDADE_MS);
    assert(!a.passo() && a.resultado() == ResultadoAssistenteWifi::EXPIROU && a.textoDigitado().isEmpty());
    RadioSimulado mudo;
    assert(executarAssistenteWifi(mudo) == ResultadoAssistenteWifi::EXPIROU);
  }
  std::puts("DisplayUI real: teclado, antirrepeticao, confirmacao, animacao e mapeamento aprovados; PIN de manutencao e mensagens conferidos; Wi-Fi na tela (lista, teclado completo, senha errada, rede oculta, cancelar, prazos) aprovado; 31 telas exportadas.");
}
