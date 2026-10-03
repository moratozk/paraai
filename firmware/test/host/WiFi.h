#pragma once
#define WL_CONNECTED 3
struct WiFiHost {
  int conectado = WL_CONNECTED;
  int status() { return conectado; }
  int RSSI() { return -50; }
};
inline WiFiHost WiFi;
