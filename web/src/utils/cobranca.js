// =========================================================================
// Conta da estadia, a mesma do totem (calcularCobranca em
// firmware/totem/LogicaTotem.h) e a que as regras do Firestore conferem na
// saída (historicoCorrespondeAEstadia): o tempo exato entre a entrada e a
// saída vezes a tarifa congelada na entrada, arredondado ao centavo. Os casos
// esperados estão em contratos/cobranca.csv e são testados nas três partes.
// =========================================================================

// Meio centavo absorve o resíduo de ponto flutuante de recargas e débitos.
// O mesmo limite está no totem (TOLERANCIA_SALDO) e nas regras (> -0.005).
export const TOLERANCIA_SALDO = 0.005;

// Horários antes de 2024 são de relógio sem hora certa (o totem recusa).
export const PRIMEIRO_TIMESTAMP_VALIDO = 1704067200;

export function tarifaValida(tarifa) {
  return Number.isFinite(tarifa) && tarifa >= 0 && tarifa <= 10000;
}

// Valor de uma estadia de `segundos` na `tarifa` por hora. A ordem das contas
// é a do totem e das regras: com ponto flutuante, outra ordem pode mudar o
// centavo de um caso de meio centavo.
export function valorDaEstadia(segundos, tarifa) {
  return Math.round((segundos / 3600) * tarifa * 100) / 100;
}

// Saída de uma estadia: valor, saldo depois do débito e a parte que o saldo
// não cobriu (dívida anterior não entra). null quando os dados não fecham,
// como o totem, que nesse caso não registra a saída.
export function calcularCobranca({ entrada, saida, tarifa, saldo }) {
  if (
    !Number.isInteger(entrada) ||
    !Number.isInteger(saida) ||
    entrada < PRIMEIRO_TIMESTAMP_VALIDO ||
    saida < entrada ||
    !tarifaValida(tarifa) ||
    !Number.isFinite(saldo)
  ) {
    return null;
  }
  const segundos = saida - entrada;
  const valor = valorDaEstadia(segundos, tarifa);
  const saldoFinal = saldo - valor;
  const pendente =
    saldoFinal >= 0 ? 0 : saldoFinal + valor <= 0 ? valor : -saldoFinal;
  return {
    segundos,
    duracaoMinutos: Math.floor(segundos / 60),
    valor,
    saldoFinal,
    pendente,
  };
}
