#pragma once
// Adaptadores SOMENTE para testes no computador. Não entram no sketch Arduino.
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <string>
#include <ctime>
#define PROGMEM
#define HIGH 1
#define OUTPUT 1
#define PI 3.14159265358979323846
class __FlashStringHelper;
class String : public std::string {
public:
  using std::string::string;
  String() = default;
  String(const std::string& s) : std::string(s) {}
  String(char c) : std::string(1, c) {}
  String(int n) : std::string(std::to_string(n)) {}
  String(unsigned int n) : std::string(std::to_string(n)) {}
  String(unsigned long n) : std::string(std::to_string(n)) {}
  String(unsigned long long n) : std::string(std::to_string(n)) {}
  bool isEmpty() const { return empty(); }
  void remove(size_t index) { erase(index); }
  String substring(size_t inicio, size_t fim) const { return substr(inicio, fim-inicio); }
};
inline unsigned long hostMillis = 100;
inline unsigned long millis() { return hostMillis; }
inline void delay(unsigned long ms) { hostMillis += ms; }
inline void pinMode(int, int) {}
inline void digitalWrite(int, int) {}
inline double radians(double degrees) { return degrees * PI / 180.0; }
inline long map(long v, long a, long b, long c, long d) { return (v-a)*(d-c)/(b-a)+c; }
template<class T> T constrain(T v, T a, T b) { return std::min(std::max(v,a),b); }
inline bool getLocalTime(tm* t, uint32_t = 5000) { *t = {}; t->tm_hour = 14; t->tm_min = 30; return true; }
struct SerialHost {
  template<class T> void print(T) {}
  template<class T> void println(T) {}
};
inline SerialHost Serial;
