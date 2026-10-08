// =========================================================================
// Geometria da maquete virtual. O pátio sai do número de vagas, sem planta
// cadastrada: fileiras a 90°, duas por corredor, como num estacionamento
// comum. Unidades em metros aproximados; o SVG usa as mesmas no viewBox e o
// navegador cuida da escala.
//
// Circulação de mão única: o carro entra pela esquerda, para no totem, desce
// pela faixa da esquerda até o corredor da vaga e entra de frente. Na saída,
// sai de ré, segue o corredor até a faixa da direita e deixa o pátio por ela.
// =========================================================================

export const MEDIDAS = Object.freeze({
  vagaLargura: 2.6,
  vagaProfundidade: 5.2,
  corredor: 6.4,
  margem: 1.2,
  // Antes da primeira coluna: o carro para no totem e, com mais de um
  // corredor, desce pela faixa da esquerda (precisa de pelo menos 8,4).
  entrada: 9.2,
  // Depois da última coluna: faixa que leva à saída.
  saida: 7,
  carroComprimento: 4.4,
  carroLargura: 2.2,
  raio: 2.2,
  // Centro do carro parado no totem, a partir da borda esquerda.
  paradaTotem: 4.2,
});

const PASSO = 0.2;

// Velocidades médias, em metros por segundo da maquete (não da vida real):
// rápidas o bastante para a banca não esperar, lentas para dar para seguir.
const VELOCIDADE = { frente: 6.5, re: 3.5 };
const PAUSA_TOTEM_MS = 900;
const PAUSA_MARCHA_MS = 320;

function normalizarTotal(numVagas) {
  return Math.max(1, Math.min(400, Math.round(Number(numVagas) || 1)));
}

// Quantas colunas por fileira deixam o pátio mais perto da proporção da tela,
// sem sobrar muita vaga vazia no fim. `larguraMaxima` (em metros) é o que cabe
// na tela sem os números ficarem ilegíveis: passar dela só se nada couber.
export function escolherColunas(numVagas, proporcaoAlvo = 2, larguraMaxima = Infinity) {
  const m = MEDIDAS;
  const total = normalizarTotal(numVagas);
  const alvo = Number.isFinite(proporcaoAlvo) && proporcaoAlvo > 0 ? proporcaoAlvo : 2;
  const alturaBaia = 2 * m.vagaProfundidade + m.corredor;
  const maxColunas = Math.max(1, Math.min(60, Math.ceil(total / 2)));
  let melhor = null;
  for (let colunas = 1; colunas <= maxColunas; colunas += 1) {
    const baias = Math.ceil(total / (2 * colunas));
    const largura = 2 * m.margem + m.entrada + colunas * m.vagaLargura + m.saida;
    const altura = 2 * m.margem + baias * alturaBaia;
    const vazias = 2 * colunas * baias - total;
    let nota = Math.abs(Math.log(largura / altura / alvo)) + (1.2 * vazias) / (2 * colunas * baias);
    if (largura > larguraMaxima) nota += 10 + largura - larguraMaxima;
    if (!melhor || nota < melhor.nota - 1e-9) melhor = { colunas, nota };
  }
  return melhor.colunas;
}

export function calcularPatio(numVagas, proporcaoAlvo = 2, larguraMaxima = Infinity) {
  return montarPatio(numVagas, escolherColunas(numVagas, proporcaoAlvo, larguraMaxima));
}

export function montarPatio(numVagas, colunasPedidas) {
  const m = MEDIDAS;
  const total = normalizarTotal(numVagas);
  const colunas = Math.max(1, Math.min(Math.ceil(total / 2), Math.round(colunasPedidas) || 1));
  const baias = Math.ceil(total / (2 * colunas));
  const alturaBaia = 2 * m.vagaProfundidade + m.corredor;
  const x0 = m.margem + m.entrada;
  const xFim = x0 + colunas * m.vagaLargura;
  const largura = xFim + m.saida + m.margem;
  const altura = 2 * m.margem + baias * alturaBaia;

  const corredores = Array.from({ length: baias }, (_, k) => {
    const topoBaia = m.margem + k * alturaBaia;
    return {
      indice: k,
      topo: topoBaia + m.vagaProfundidade,
      y: topoBaia + m.vagaProfundidade + m.corredor / 2,
      base: topoBaia + m.vagaProfundidade + m.corredor,
    };
  });

  const vagas = [];
  for (let numero = 1; numero <= total; numero += 1) {
    const i = numero - 1;
    const baia = Math.floor(i / (2 * colunas));
    const resto = i % (2 * colunas);
    const fileira = resto < colunas ? "cima" : "baixo";
    const coluna = resto % colunas;
    const corredor = corredores[baia];
    const x = x0 + coluna * m.vagaLargura;
    const y = fileira === "cima" ? corredor.topo - m.vagaProfundidade : corredor.base;
    vagas.push({
      numero,
      baia,
      fileira,
      coluna,
      x,
      y,
      largura: m.vagaLargura,
      profundidade: m.vagaProfundidade,
      cx: x + m.vagaLargura / 2,
      cy: y + m.vagaProfundidade / 2,
      // Estaciona de frente: o carro aponta para o fundo da vaga.
      angulo: fileira === "cima" ? -90 : 90,
    });
  }

  const ultimaBaia = baias - 1;
  const topoEntrada = corredores[0].topo;
  const baseSaida = corredores[ultimaBaia].base;

  // Canteiros: onde não há vaga nem pista. Posições sem vaga no fim da última
  // baia também viram canteiro, para o pátio não parecer faltando um pedaço.
  const canteiros = [];
  const canteiro = (x, y, largura, altura) => {
    if (largura > 1 && altura > 1) canteiros.push({ x, y, largura, altura });
  };
  for (const fileira of ["cima", "baixo"]) {
    const usadas = vagas.filter((v) => v.baia === ultimaBaia && v.fileira === fileira).length;
    if (usadas < colunas) {
      const corredor = corredores[ultimaBaia];
      const y = fileira === "cima" ? corredor.topo - m.vagaProfundidade : corredor.base;
      canteiro(
        x0 + usadas * m.vagaLargura + 0.35,
        y + 0.35,
        (colunas - usadas) * m.vagaLargura - 0.7,
        m.vagaProfundidade - 0.7
      );
    }
  }
  const alturaFaixaDeCima = topoEntrada - m.margem - 0.8;
  canteiro(m.margem + 0.4, m.margem + 0.4, x0 - m.margem - 1.2, alturaFaixaDeCima);
  canteiro(xFim + 0.4, m.margem + 0.4, largura - m.margem - xFim - 0.8, alturaFaixaDeCima);
  // Abaixo da pista de entrada; com mais de um corredor, só à esquerda da faixa
  // que desce, e embaixo dela depois do último corredor.
  const fimEsquerda = baias > 1 ? x0 - m.corredor - 0.4 : x0 - 0.8;
  canteiro(
    m.margem + 0.4,
    corredores[0].base + 0.4,
    fimEsquerda - m.margem - 0.4,
    altura - m.margem - corredores[0].base - 0.8
  );
  if (baias > 1) {
    canteiro(fimEsquerda + 0.8, baseSaida + 0.4, x0 - 0.8 - (fimEsquerda + 0.8), altura - m.margem - baseSaida - 0.8);
  }
  // Abaixo da pista de saída.
  canteiro(xFim + 0.4, baseSaida + 0.4, largura - m.margem - xFim - 0.8, altura - m.margem - baseSaida - 0.8);

  const totemX = m.paradaTotem + 0.5;
  return {
    total,
    colunas,
    baias,
    largura,
    altura,
    x0,
    xFim,
    corredores,
    canteiros,
    // Faixas verticais: só fazem diferença com mais de um corredor.
    faixaEntradaX: x0 - m.corredor / 2,
    faixaSaidaX: xFim + m.corredor / 2,
    entradaY: corredores[0].y,
    saidaY: corredores[ultimaBaia].y,
    totem: {
      // O motorista fica à esquerda: o totem está do lado de cima da pista,
      // numa ilha de concreto dentro do canteiro.
      x: totemX,
      y: topoEntrada - 1.0,
      ilha: { x: totemX - 2.1, y: topoEntrada - 3.4, largura: 4.2, altura: 3.0 },
    },
    vagas,
  };
}

// ---------------------------------------------------------------------------
// Trajetos. Uma "tartaruga" anda e vira com raio fixo e guarda amostras a
// cada 20 cm: posição do centro do carro e para onde a frente aponta.
// Ângulo em radianos, 0 = leste e PI/2 = sul (o y da tela cresce para baixo).
// ---------------------------------------------------------------------------
function tartaruga(x, y, angulo) {
  const pos = { x, y, a: angulo };
  let amostras = [{ ...pos, s: 0 }];
  let percorrido = 0;

  function anotar(passo) {
    percorrido += passo;
    amostras.push({ x: pos.x, y: pos.y, a: pos.a, s: percorrido });
  }

  return {
    pos,
    // Anda em linha reta; de ré, para trás sem mudar a frente do carro.
    seguir(distancia, re = false) {
      if (distancia <= 1e-6) return;
      const passos = Math.max(1, Math.ceil(distancia / PASSO));
      const sentido = re ? -1 : 1;
      const dx = Math.cos(pos.a) * sentido;
      const dy = Math.sin(pos.a) * sentido;
      const xi = pos.x;
      const yi = pos.y;
      for (let i = 1; i <= passos; i += 1) {
        const t = (distancia * i) / passos;
        pos.x = xi + dx * t;
        pos.y = yi + dy * t;
        anotar(distancia / passos);
      }
    },
    // delta > 0 gira no sentido horário da tela. Andando de frente, o centro
    // da curva fica do lado para onde se vira; de ré, do lado oposto.
    virar(raio, delta, re = false) {
      const lado = delta > 0 !== re ? 1 : -1;
      const cx = pos.x + raio * Math.cos(pos.a + (lado * Math.PI) / 2);
      const cy = pos.y + raio * Math.sin(pos.a + (lado * Math.PI) / 2);
      const phi0 = Math.atan2(pos.y - cy, pos.x - cx);
      const a0 = pos.a;
      const comprimento = Math.abs(delta) * raio;
      const passos = Math.max(2, Math.ceil(comprimento / PASSO));
      for (let i = 1; i <= passos; i += 1) {
        const f = i / passos;
        pos.x = cx + raio * Math.cos(phi0 + delta * f);
        pos.y = cy + raio * Math.sin(phi0 + delta * f);
        pos.a = a0 + delta * f;
        anotar(comprimento / passos);
      }
    },
    // Fecha o trecho atual e começa outro a partir de onde o carro está.
    fechar(suavizacao, velocidade, fase) {
      const trecho = {
        tipo: "trecho",
        amostras,
        comprimento: percorrido,
        duracao: Math.max(350, (percorrido / velocidade) * 1000),
        suavizacao,
        fase,
      };
      amostras = [{ ...pos, s: 0 }];
      percorrido = 0;
      return trecho;
    },
  };
}

function montar(passos) {
  return { passos, duracao: passos.reduce((soma, p) => soma + p.duracao, 0) };
}

// Em pátio grande o carro anda mais depressa: atravessar 200 vagas não pode
// levar meio minuto na apresentação.
function escalaVelocidade(patio) {
  return Math.max(1, (patio.largura + patio.altura) / 70);
}

function vagaDoPatio(patio, numero) {
  return patio.vagas[Number(numero) - 1] || null;
}

// Do corredor (de frente para o leste, já alinhado) até o fundo da vaga.
function entrarNaVaga(t, vaga, corredor) {
  const r = MEDIDAS.raio;
  t.seguir(vaga.cx - r - t.pos.x);
  if (vaga.fileira === "cima") {
    t.virar(r, -Math.PI / 2);
    t.seguir(corredor.y - r - vaga.cy);
  } else {
    t.virar(r, Math.PI / 2);
    t.seguir(vaga.cy - (corredor.y + r));
  }
}

export function trajetoEntrada(patio, numero) {
  const vaga = vagaDoPatio(patio, numero);
  if (!vaga) return null;
  const m = MEDIDAS;
  const r = m.raio;
  const corredor = patio.corredores[vaga.baia];
  const v = VELOCIDADE.frente * escalaVelocidade(patio);
  const t = tartaruga(-m.carroComprimento, patio.entradaY, 0);
  t.seguir(m.paradaTotem - t.pos.x);
  const ateTotem = t.fechar("chegar", VELOCIDADE.frente * 1.3, "chegando");
  if (vaga.baia > 0) {
    t.seguir(patio.faixaEntradaX - r - t.pos.x);
    t.virar(r, Math.PI / 2);
    t.seguir(corredor.y - r - t.pos.y);
    t.virar(r, -Math.PI / 2);
  }
  entrarNaVaga(t, vaga, corredor);
  const ateVaga = t.fechar("completa", v, "entrando");
  return montar([
    ateTotem,
    { tipo: "pausa", duracao: PAUSA_TOTEM_MS, fase: "totem" },
    ateVaga,
  ]);
}

export function trajetoSaida(patio, numero) {
  const vaga = vagaDoPatio(patio, numero);
  if (!vaga) return null;
  const m = MEDIDAS;
  const r = m.raio;
  const corredor = patio.corredores[vaga.baia];
  const t = tartaruga(vaga.cx, vaga.cy, (vaga.angulo * Math.PI) / 180);
  if (vaga.fileira === "cima") {
    t.seguir(corredor.y - r - vaga.cy, true);
    t.virar(r, Math.PI / 2, true);
  } else {
    t.seguir(vaga.cy - (corredor.y + r), true);
    t.virar(r, -Math.PI / 2, true);
  }
  const deRe = t.fechar("completa", VELOCIDADE.re, "manobrando");
  if (vaga.baia < patio.baias - 1) {
    t.seguir(patio.faixaSaidaX - r - t.pos.x);
    t.virar(r, Math.PI / 2);
    t.seguir(patio.saidaY - r - t.pos.y);
    t.virar(r, -Math.PI / 2);
  }
  t.seguir(patio.largura + m.carroComprimento - t.pos.x);
  const embora = t.fechar("sair", VELOCIDADE.frente * 1.3 * escalaVelocidade(patio), "saindo");
  return montar([
    deRe,
    { tipo: "pausa", duracao: PAUSA_MARCHA_MS, fase: "manobrando" },
    embora,
  ]);
}

function suavizar(tipo, f) {
  if (tipo === "chegar") return 1 - (1 - f) * (1 - f);
  if (tipo === "sair") return f * f;
  return 0.5 - 0.5 * Math.cos(Math.PI * f);
}

function poseNaDistancia(trecho, s) {
  const lista = trecho.amostras;
  if (s <= 0) return lista[0];
  if (s >= trecho.comprimento) return lista[lista.length - 1];
  let baixo = 0;
  let alto = lista.length - 1;
  while (alto - baixo > 1) {
    const meio = (baixo + alto) >> 1;
    if (lista[meio].s <= s) baixo = meio;
    else alto = meio;
  }
  const a = lista[baixo];
  const b = lista[alto];
  const f = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0;
  return {
    x: a.x + (b.x - a.x) * f,
    y: a.y + (b.y - a.y) * f,
    a: a.a + (b.a - a.a) * f,
  };
}

function emGraus(pose) {
  return { x: pose.x, y: pose.y, angulo: (pose.a * 180) / Math.PI };
}

// Onde o carro está depois de `decorrido` ms do início do trajeto.
export function poseNoTrajeto(trajeto, decorrido) {
  let resta = Math.max(0, decorrido);
  let ultima = null;
  for (const passo of trajeto.passos) {
    if (passo.tipo === "pausa") {
      if (resta < passo.duracao && ultima) {
        return { ...emGraus(ultima), fase: passo.fase, terminou: false };
      }
      resta -= passo.duracao;
      continue;
    }
    if (resta < passo.duracao) {
      const f = suavizar(passo.suavizacao, resta / passo.duracao);
      return {
        ...emGraus(poseNaDistancia(passo, f * passo.comprimento)),
        fase: passo.fase,
        terminou: false,
      };
    }
    resta -= passo.duracao;
    ultima = passo.amostras[passo.amostras.length - 1];
  }
  return { ...emGraus(ultima), fase: "fim", terminou: true };
}

// Quanto tempo o carro ocupa a pista de entrada: o próximo só sai depois.
export function tempoNaEntrada(trajeto) {
  const [ateTotem, pausa] = trajeto.passos;
  return ateTotem.duracao + pausa.duracao + 1200;
}
