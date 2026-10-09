// Entradas e saídas deduzidas de duas leituras seguidas das vagas. A maquete
// não inventa movimento: só anima o que o totem gravou no Firebase.

// cor: a que o dono informou, copiada pelo totem para a vaga na entrada.
export function ocupacaoPorVaga(vagas) {
  return new Map(
    vagas.map((vaga) => [
      vaga.numero,
      { ocupada: Boolean(vaga.ocupada), placa: vaga.placa || "", cor: vaga.cor || "" },
    ])
  );
}

function trocouDeCarro(antes, depois) {
  return Boolean(antes.placa && depois.placa && antes.placa !== depois.placa);
}

// Saídas primeiro: se a mesma vaga esvaziou e foi ocupada entre duas
// leituras, o carro antigo sai antes de o novo entrar.
export function compararOcupacao(antes, depois) {
  const saidas = [];
  const entradas = [];
  for (const [numero, atual] of depois) {
    const anterior = antes.get(numero) || { ocupada: false, placa: "", cor: "" };
    const trocou = anterior.ocupada && atual.ocupada && trocouDeCarro(anterior, atual);
    if (anterior.ocupada && (!atual.ocupada || trocou)) {
      saidas.push({ tipo: "saida", numero, placa: anterior.placa, cor: anterior.cor });
    }
    if (atual.ocupada && (!anterior.ocupada || trocou)) {
      entradas.push({ tipo: "entrada", numero, placa: atual.placa, cor: atual.cor });
    }
  }
  return [...saidas, ...entradas];
}
