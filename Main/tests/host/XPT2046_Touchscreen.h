#pragma once
#include "SPI.h"
struct TS_Point { int16_t x = 0, y = 0, z = 0; };
class XPT2046_Touchscreen {
public:
  bool pressionado = false;
  TS_Point ponto;
  explicit XPT2046_Touchscreen(int) {}
  void begin(SPIClass&) {}
  void setRotation(int) {}
  bool touched() { return pressionado; }
  TS_Point getPoint() { return ponto; }
};
