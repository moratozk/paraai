// =========================================================================
// Constantes do site. As que também existem no totem
// (firmware/totem/LogicaTotem.h) ou nas regras (firebase/firestore.rules)
// dizem onde; os testes de web/test/contratos.test.js conferem as três.
// =========================================================================

// Vagas de um estacionamento que ainda não informou numVagas.
export const TOTAL_VAGAS = 4;

// Tarifa de segurança usada apenas enquanto os dados do estacionamento ainda
// não chegaram. O valor oficial vem de estacionamentos/{id}.tarifaHora e o
// totem lê esse mesmo campo antes de calcular a saída.
export const VALOR_POR_HORA = 5.0;

// O totem grava um heartbeat a cada 60s; acima deste limite sem notícias,
// o painel considera o dispositivo offline.
export const TOTEM_OFFLINE_APOS_SEGUNDOS = 150;

// Limites da recarga simulada, os mesmos de valorDeRecargaValido nas regras.
export const RECARGA_MINIMA = 0.01;
export const RECARGA_MAXIMA = 1000;
