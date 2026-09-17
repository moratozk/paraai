#pragma once
#include <Adafruit_GFX.h>
#include "SPI.h"
#include <array>
#include <fstream>
#include <cstdio>
// Usa as primitivas E as fontes reais da biblioteca Adafruit_GFX do projeto.
// Apenas o transporte SPI é substituído por um framebuffer em memória.
class Adafruit_ILI9341 : public Adafruit_GFX {
public:
  std::array<uint16_t, 320 * 240> pixels{};
  Adafruit_ILI9341(SPIClass*, int, int, int) : Adafruit_GFX(320,240) {}
  void begin(unsigned long) {}
  void setRotation(uint8_t) override {}
  static uint16_t color565(uint8_t r, uint8_t g, uint8_t b) { return ((r&248)<<8)|((g&252)<<3)|(b>>3); }
  void drawPixel(int16_t x, int16_t y, uint16_t c) override {
    if (x >= 0 && x < 320 && y >= 0 && y < 240) pixels[y*320+x] = c;
  }
  void salvar(const std::string& caminho) {
    std::ofstream out(caminho);
    if (!out) throw std::runtime_error("Falha ao salvar preview");
    out << "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"320\" height=\"240\" viewBox=\"0 0 320 240\" shape-rendering=\"crispEdges\">";
    for (int y=0; y<240; ++y) for (int x=0; x<320;) {
      const uint16_t c = pixels[y*320+x];
      int fim=x+1;
      while (fim<320 && pixels[y*320+fim]==c) ++fim;
      char cor[8];
      std::snprintf(cor,sizeof(cor),"#%02x%02x%02x", ((c>>11)&31)*255/31, ((c>>5)&63)*255/63, (c&31)*255/31);
      out << "<rect x=\""<<x<<"\" y=\""<<y<<"\" width=\""<<fim-x<<"\" height=\"1\" fill=\""<<cor<<"\"/>";
      x=fim;
    }
    out << "</svg>";
  }
};
