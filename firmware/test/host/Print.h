#pragma once
#include "Arduino.h"
class Print {
public:
  virtual ~Print() = default;
  virtual size_t write(uint8_t) = 0;
  size_t print(const String& s) { for (unsigned char c : s) write(c); return s.size(); }
  size_t print(const char* s) { return print(String(s)); }
};
