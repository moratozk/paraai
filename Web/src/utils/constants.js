// =========================================================================
// Constantes compartilhadas com o firmware do totem (Main/Main.ino).
// Se alterar aqui, altere lá também (e vice-versa).
// =========================================================================

// Quantidade de vagas físicas monitoradas pelo ESP32 (NUM_VAGAS no firmware)
export const TOTAL_VAGAS = 4;

// Tarifa em R$ por hora, proporcional aos minutos (VALOR_POR_HORA no firmware).
// Usada aqui apenas para ESTIMAR o custo em tempo real no painel; o valor
// oficial é sempre o calculado pelo totem na saída.
export const VALOR_POR_HORA = 5.0;

// O totem grava um heartbeat a cada 60s; acima deste limite sem notícias,
// o painel considera o dispositivo offline.
export const TOTEM_OFFLINE_APOS_SEGUNDOS = 150;
