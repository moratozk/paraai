// Movimento físico no estilo da Apple ("Designing Fluid Interfaces", WWDC 2018).
//
// A mola é descrita por dois números fáceis de ajustar, como no SwiftUI:
//   resposta      — em segundos, quão rápido ela chega perto do alvo
//   amortecimento — 1 chega sem passar do alvo; abaixo de 1 quica um pouco
// Mola não tem duração fixa: parte do valor e da velocidade de agora. Por isso
// pode ser interrompida e redirecionada a qualquer momento, sem salto.

const PASSO = 1 / 240; // passos curtos deixam a conta estável em qualquer taxa de quadros

export function animarMola({
  de,
  para,
  velocidade = 0,
  resposta = 0.4,
  amortecimento = 1,
  aoAtualizar,
  aoTerminar,
}) {
  const rigidez = ((2 * Math.PI) / resposta) ** 2;
  const atrito = (4 * Math.PI * amortecimento) / resposta;
  let x = de;
  let v = velocidade;
  // Conta o tempo desde já: o primeiro quadro já anda (resposta sem atraso).
  let anterior = performance.now();
  let quadro = requestAnimationFrame(passo);

  function passo(agora) {
    let dt = Math.min(Math.max(0, agora - anterior) / 1000, 0.05);
    anterior = agora;
    while (dt > 0) {
      const h = Math.min(dt, PASSO);
      v += (-rigidez * (x - para) - atrito * v) * h;
      x += v * h;
      dt -= h;
    }
    const assentou = Math.abs(v) < 4 && Math.abs(x - para) < 0.3;
    if (assentou) {
      x = para;
      v = 0;
    }
    aoAtualizar(x, v);
    if (assentou) {
      aoTerminar?.();
      return;
    }
    quadro = requestAnimationFrame(passo);
  }

  return {
    parar() {
      cancelAnimationFrame(quadro);
    },
  };
}

/** Onde o gesto pararia se a pessoa soltasse agora (velocidade em px/s). */
export function projetar(velocidade, desaceleracao = 0.99) {
  return ((velocidade / 1000) * desaceleracao) / (1 - desaceleracao);
}

/** Resistência progressiva além do limite: quanto mais longe, menos segue. */
export function elastico(excesso, dimensao, constante = 0.55) {
  return (excesso * dimensao * constante) / (dimensao + constante * Math.abs(excesso));
}

/** Prende o valor entre min e max, mas com borda elástica em vez de parede. */
export function limitarElastico(valor, min, max, dimensao) {
  if (valor < min) return min + elastico(valor - min, dimensao);
  if (valor > max) return max + elastico(valor - max, dimensao);
  return valor;
}

/** A pessoa pediu para reduzir animações no sistema? */
export function semMovimento() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
