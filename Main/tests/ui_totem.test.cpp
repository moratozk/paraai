#include <cassert>
#include <cstdio>
#include <filesystem>
#include "../DisplayUI.ino"

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
  // Toda mensagem do atendimento (Atendimento.cpp e Main.ino, com os maiores
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
       "Vaga 200 - R$ 10000,00/h", "Aguarde alguns minutos", "Reiniciando o atendimento", "999 s - Aguarde a confirmacao"})
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
  std::puts("DisplayUI real: teclado, antirrepeticao, confirmacao, animacao e mapeamento aprovados; PIN de manutencao e mensagens conferidos; 18 telas exportadas.");
}
