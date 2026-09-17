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
  desenharTelaResultado(RESULTADO_SUCESSO, "ENTRADA CONFIRMADA", "ABC1D23", "Vaga 200 | R$ 10000,00/h");
  desenharBotaoConcluir();
  tft.salvar(destino + "/08-entrada.svg");
  pressionar(160,218);
  assert(verificarToqueConcluir());
  assert(!verificarToqueConcluir());
  soltar();
  desenharTelaResultado(RESULTADO_SUCESSO, "SAIDA CONFIRMADA", "R$ 8,50", "60 min | ABC1D23");
  desenharBotaoConcluir(); tft.salvar(destino + "/09-saida.svg");
  desenharTelaResultado(RESULTADO_ERRO, "NAO FOI CONFIRMADO", "Confira a conexao", "Confira o registro no painel");
  desenharBotaoConcluir(); tft.salvar(destino + "/10-erro.svg");
  desenharTelaConfirmarCadastro("ABC1D23"); tft.salvar(destino + "/11-cadastro.svg");
  atualizarStatusServico(ConexaoTotem::MANUTENCAO);
  desenharTelaConfiguracoes(); tft.salvar(destino + "/12-manutencao.svg");
  desenharTelaPortalWifi("ParaAi-123456", "abcDEF123456", "192.168.4.1", "Conecte pelo celular");
  tft.salvar(destino + "/13-wifi.svg");
  assert(calibracaoTouchPlausivel(200,3700,200,3700));
  assert(calibracaoTouchPlausivel(3700,200,3700,200));
  assert(!calibracaoTouchPlausivel(200,200,200,3700));
  int x,y;
  mapearToqueBruto(1950,1950,200,3700,200,3700,x,y);
  assert(x==159 && y==119);
  mapearToqueBruto(-500,8000,200,3700,200,3700,x,y);
  assert(x==0 && y==239);
  std::puts("DisplayUI real: teclado, antirrepeticao, confirmacao, animacao e mapeamento aprovados; 13 telas exportadas.");
}
