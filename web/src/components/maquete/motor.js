// Anima os carros da maquete mexendo direto no SVG: nada re-renderiza a cada
// quadro. Recebe as refs dos elementos desenhados pelo componente e só as lê
// fora da renderização (efeitos e requestAnimationFrame).
import { poseNoTrajeto, tempoNaEntrada, trajetoEntrada, trajetoSaida } from "./geometria";

const DESTAQUE_MS = 2400;

// Paleta discreta dos carros do pátio da Home; o âmbar fica para o destaque.
const CORES = ["#4b5466", "#7a8294", "#2f4d70", "#5d4b70", "#3e5d55", "#70603e", "#7c4a50", "#8f97a5"];

// A mesma placa tem sempre a mesma cor, na vaga e andando.
export function corDaPlaca(placa) {
  let h = 7;
  for (const c of String(placa || "")) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return CORES[h % CORES.length];
}

const dois = (n) => String(n).padStart(2, "0");

export function textoDoMovimento(tipo, terminou, placa, numero) {
  const quem = placa || "Carro";
  if (tipo === "entrada") {
    return terminou ? `${quem} estacionou na vaga ${dois(numero)}` : `${quem} entrando · vaga ${dois(numero)}`;
  }
  return terminou ? `${quem} saiu do pátio` : `${quem} saindo da vaga ${dois(numero)}`;
}

export function criarMotor({ lugares, estacionados, vagas, aviso, totem }) {
  let atores = [];
  const chegando = new Map(); // vaga -> carros ainda a caminho dela
  const timers = new Set();
  let entradaLivre = 0;
  let quadro = 0;
  let sequencia = 0;

  function depois(ms, fn) {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
  }

  // Linha acima do pátio com o último movimento; fica até o próximo.
  function avisar(texto, estado, dono = "") {
    const el = aviso.current;
    if (!el) return;
    el.lastChild.textContent = texto;
    el.dataset.estado = estado;
    el.dataset.dono = dono;
  }

  function destacar(numero) {
    const el = vagas.current.get(numero);
    if (!el) return;
    el.classList.remove("recente");
    el.getBoundingClientRect(); // reinicia a animação se a vaga ainda brilhava
    el.classList.add("recente");
    depois(DESTAQUE_MS, () => el.classList.remove("recente"));
  }

  // Esconde o carro já desenhado na vaga até o carro que anda chegar nela.
  function esperarNaVaga(numero) {
    chegando.set(numero, (chegando.get(numero) || 0) + 1);
    const el = estacionados.current.get(numero);
    if (el) el.dataset.chegando = "sim";
  }

  function mostrarNaVaga(numero) {
    const pendentes = (chegando.get(numero) || 1) - 1;
    if (pendentes > 0) {
      chegando.set(numero, pendentes);
      return;
    }
    chegando.delete(numero);
    const el = estacionados.current.get(numero);
    if (el) delete el.dataset.chegando;
  }

  function aplicar(lugar, pose) {
    lugar.raiz.setAttribute("transform", `translate(${pose.x.toFixed(3)} ${pose.y.toFixed(3)})`);
    lugar.corpo.setAttribute("transform", `rotate(${pose.angulo.toFixed(2)})`);
    if (lugar.raiz.dataset.fase !== pose.fase) lugar.raiz.dataset.fase = pose.fase;
  }

  function encerrar(ator) {
    ator.lugar.raiz.dataset.ativo = "nao";
    atores = atores.filter((a) => a !== ator);
    if (ator.tipo === "entrada") {
      mostrarNaVaga(ator.numero);
      destacar(ator.numero);
    }
    if (aviso.current?.dataset.dono === ator.id) {
      avisar(textoDoMovimento(ator.tipo, true, ator.placa, ator.numero), "feito");
    }
  }

  function laco(instante) {
    let noTotem = false;
    for (const ator of [...atores]) {
      const decorrido = instante - ator.inicio;
      const pose = poseNoTrajeto(ator.trajeto, Math.max(0, decorrido));
      aplicar(ator.lugar, pose);
      if (decorrido >= 0 && !ator.anunciado) {
        ator.anunciado = true;
        avisar(textoDoMovimento(ator.tipo, false, ator.placa, ator.numero), "andando", ator.id);
      }
      if (decorrido >= 0 && pose.fase === "totem") noTotem = true;
      if (pose.terminou) encerrar(ator);
    }
    if (totem.current) totem.current.dataset.atendendo = noTotem ? "sim" : "nao";
    quadro = atores.length ? requestAnimationFrame(laco) : 0;
  }

  // Compara pelo elemento do SVG: o objeto do lugar é recriado a cada
  // renderização, mas o elemento continua o mesmo.
  function lugarLivre() {
    const livre = lugares.current.find((l) => l && !atores.some((a) => a.lugar.raiz === l.raiz));
    if (livre || !atores.length) return livre || null;
    // Sem lugar: o carro mais antigo chega de uma vez.
    const antigo = atores[0];
    encerrar(antigo);
    return antigo.lugar;
  }

  return {
    // O pátio mudou de formato: os trajetos em andamento não servem mais.
    reiniciar() {
      cancelAnimationFrame(quadro);
      quadro = 0;
      atores = [];
      chegando.clear();
      entradaLivre = 0;
      for (const lugar of lugares.current) if (lugar) lugar.raiz.dataset.ativo = "nao";
      for (const el of estacionados.current.values()) if (el) delete el.dataset.chegando;
      if (totem.current) totem.current.dataset.atendendo = "nao";
    },

    processar(eventos, patio, { animar }) {
      const agora = performance.now();
      for (const evento of eventos) {
        if (!animar) {
          avisar(textoDoMovimento(evento.tipo, true, evento.placa, evento.numero), "feito");
          destacar(evento.numero);
          continue;
        }
        // O carro que ainda chegava na vaga que agora esvaziou termina de vez.
        if (evento.tipo === "saida") {
          for (const ator of [...atores]) {
            if (ator.numero === evento.numero && ator.tipo === "entrada") encerrar(ator);
          }
        }
        const trajeto =
          evento.tipo === "entrada"
            ? trajetoEntrada(patio, evento.numero)
            : trajetoSaida(patio, evento.numero);
        const lugar = trajeto && lugarLivre();
        if (!lugar) continue;

        let inicio = agora;
        if (evento.tipo === "entrada") {
          // Um carro por vez na pista do totem.
          inicio = Math.max(agora, entradaLivre);
          entradaLivre = inicio + tempoNaEntrada(trajeto);
          esperarNaVaga(evento.numero);
        }
        sequencia += 1;
        const ator = {
          id: `ator-${sequencia}`,
          tipo: evento.tipo,
          numero: evento.numero,
          placa: evento.placa,
          trajeto,
          inicio,
          lugar,
          anunciado: false,
        };
        lugar.carro.style.setProperty("--carro-cor", corDaPlaca(evento.placa));
        lugar.placa.textContent = evento.placa || "";
        lugar.raiz.dataset.placa = evento.placa ? "sim" : "nao";
        lugar.raiz.dataset.ativo = "sim";
        aplicar(lugar, poseNoTrajeto(trajeto, 0));
        atores.push(ator);
      }
      if (atores.length && !quadro) quadro = requestAnimationFrame(laco);
    },

    destruir() {
      cancelAnimationFrame(quadro);
      quadro = 0;
      atores = [];
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    },
  };
}
