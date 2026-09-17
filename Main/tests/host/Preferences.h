#pragma once
#include "Arduino.h"
struct Preferences {
  bool begin(const char*, bool) { return false; }
  uint8_t getUChar(const char*, uint8_t fallback) { return fallback; }
  int32_t getInt(const char*, int32_t fallback) { return fallback; }
  size_t putUChar(const char*, uint8_t) { return sizeof(uint8_t); }
  size_t putInt(const char*, int32_t) { return sizeof(int32_t); }
  void end() {}
};
