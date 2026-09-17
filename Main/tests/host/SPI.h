#pragma once
#define VSPI 0
#define HSPI 1
struct SPIClass {
  explicit SPIClass(int) {}
  void begin(int, int, int, int) {}
};
