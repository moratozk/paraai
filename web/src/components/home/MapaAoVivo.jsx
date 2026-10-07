import { useEffect, useRef, useState } from "react";
import "./MapaAoVivo.css";

/* Simulação do mapa do app para a Home: ninguém está logado aqui, então os
   dados são inventados e a tela diz isso. Os tipos seguem a tabela padrão
   da demonstração (vagas 1-2 PCD, 9 e 11 para 60+, 10 para gestante). */
const TIPOS = { 1: "pcd", 2: "pcd", 9: "idoso", 10: "gestante", 11: "idoso" };
const ICONES = { pcd: "♿", idoso: "60+", gestante: "G" };
const ROTULOS = { livre: "livre", ocupada: "ocupada", reservada: "reservada" };
const OCUPADAS = {
  3: "QWE4R56", 4: "RTY7U89", 6: "MER1C05", 7: "FAT3C12", 12: "POL9K33",
  13: "GHJ6L21", 15: "TOT3M44", 17: "BRA2E19", 19: "SPX7B33",
};
const RESERVADAS = { 5: "LUZ5A08", 14: "NOR8D61" };

const INICIAL = Array.from({ length: 20 }, (_, i) => {
  const n = i + 1;
  const estado = OCUPADAS[n] ? "ocupada" : RESERVADAS[n] ? "reservada" : "livre";
  return {
    n,
    tipo: TIPOS[n] || "comum",
    estado,
    placa: OCUPADAS[n] || RESERVADAS[n] || "",
    versao: 0,
  };
});

const EVENTOS_INICIAIS = [
  { id: -1, hora: "agora", texto: "BRA2E19 entrou · vaga 17" },
  { id: -2, hora: "agora", texto: "Reserva pelo app · vaga 14" },
];

const LETRAS = "ABCDEFGHJKLMNPRSTUVWXYZ";
function placaAleatoria() {
  const l = () => LETRAS[Math.floor(Math.random() * LETRAS.length)];
  const d = () => Math.floor(Math.random() * 10);
  return `${l()}${l()}${l()}${d()}${l()}${d()}${d()}`;
}
const sortear = (lista) => lista[Math.floor(Math.random() * lista.length)];
const dois = (n) => String(n).padStart(2, "0");

/* Um passo da simulação: alguém entra, sai, reserva ou chega para a reserva.
   Mantém a ocupação num meio-termo, como um pátio de verdade num dia comum. */
function simular(vagas) {
  const livres = vagas.filter((v) => v.estado === "livre");
  const livresComuns = livres.filter((v) => v.tipo === "comum");
  const ocupadas = vagas.filter((v) => v.estado === "ocupada");
  const reservadas = vagas.filter((v) => v.estado === "reservada");
  const taxa = ocupadas.length / vagas.length;
  const r = Math.random();

  let alvo;
  let novo;
  let texto;
  if (reservadas.length && r < 0.2) {
    alvo = sortear(reservadas);
    novo = { estado: "ocupada" };
    texto = `${alvo.placa} chegou para a reserva · vaga ${dois(alvo.n)}`;
  } else if (ocupadas.length > 5 && (taxa > 0.65 || r < 0.5)) {
    alvo = sortear(ocupadas);
    novo = { estado: "livre", placa: "" };
    texto = `${alvo.placa} saiu · vaga ${dois(alvo.n)}`;
  } else if (livresComuns.length && r < 0.68 && reservadas.length < 3) {
    alvo = sortear(livresComuns);
    novo = { estado: "reservada", placa: placaAleatoria() };
    texto = `Reserva pelo app · vaga ${dois(alvo.n)}`;
  } else if (livres.length) {
    alvo = sortear(livresComuns.length && Math.random() < 0.8 ? livresComuns : livres);
    novo = { estado: "ocupada", placa: placaAleatoria() };
    const especial = alvo.tipo !== "comum" ? ` (${ICONES[alvo.tipo] === "♿" ? "PCD" : ICONES[alvo.tipo]})` : "";
    texto = `${novo.placa} entrou · vaga ${dois(alvo.n)}${especial}`;
  } else {
    return null;
  }

  return {
    vagas: vagas.map((v) => (v.n === alvo.n ? { ...v, ...novo, versao: v.versao + 1 } : v)),
    texto,
  };
}

export default function MapaAoVivo() {
  const [vagas, setVagas] = useState(INICIAL);
  const [eventos, setEventos] = useState(EVENTOS_INICIAIS);
  const [pausado, setPausado] = useState(false);
  const raiz = useRef(null);
  const atual = useRef(INICIAL);
  const emTela = useRef(false);
  const contador = useRef(0);

  // Só simula com o mapa na tela e a aba aberta: fora disso não gasta nada.
  useEffect(() => {
    const el = raiz.current;
    if (!el || typeof IntersectionObserver === "undefined") return undefined;
    const obs = new IntersectionObserver(
      ([e]) => {
        emTela.current = e.isIntersecting;
      },
      { threshold: 0.2 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (pausado) return undefined;
    const id = setInterval(() => {
      if (!emTela.current || document.hidden) return;
      const passo = simular(atual.current);
      if (!passo) return;
      atual.current = passo.vagas;
      contador.current += 1;
      const hora = new Date().toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      setVagas(passo.vagas);
      setEventos((lista) => [{ id: contador.current, hora, texto: passo.texto }, ...lista].slice(0, 4));
    }, 2600);
    return () => clearInterval(id);
  }, [pausado]);

  const contagem = { livre: 0, ocupada: 0, reservada: 0 };
  vagas.forEach((v) => {
    contagem[v.estado] += 1;
  });

  const renderizar = (v) => (
    <li
      key={v.n}
      className={`aovivo-vaga ${v.estado} ${v.tipo}`}
      aria-label={`Vaga ${v.n}, ${ROTULOS[v.estado]}${v.tipo !== "comum" ? `, ${v.tipo === "pcd" ? "PCD" : v.tipo === "idoso" ? "60+" : "gestante"}` : ""}`}
    >
      <span className="aovivo-vaga-n">{dois(v.n)}</span>
      {v.tipo !== "comum" && (
        <i className="aovivo-tipo" aria-hidden="true">
          {ICONES[v.tipo]}
        </i>
      )}
      {v.versao > 0 && <span key={v.versao} className="aovivo-pulso" aria-hidden="true" />}
    </li>
  );

  return (
    <div ref={raiz} className="aovivo">
      <div className="aovivo-topo">
        <div>
          <strong>Pátio de demonstração</strong>
          <span>
            <i className="aovivo-ao-vivo" aria-hidden="true" />
            {pausado ? "Simulação pausada" : "Simulação ao vivo"}
          </span>
        </div>
        <button
          type="button"
          className="aovivo-pausa"
          aria-pressed={pausado}
          onClick={() => setPausado((p) => !p)}
        >
          {pausado ? (
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10-6.5z" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5h3v14H8zM13 5h3v14h-3z" /></svg>
          )}
          {pausado ? "Continuar" : "Pausar"}
        </button>
      </div>

      <dl className="aovivo-contagem">
        <div className="livre"><dt>Livres</dt><dd>{contagem.livre}</dd></div>
        <div className="ocupada"><dt>Ocupadas</dt><dd>{contagem.ocupada}</dd></div>
        <div className="reservada"><dt>Reservadas</dt><dd>{contagem.reservada}</dd></div>
      </dl>

      <div className="aovivo-patio">
        <ol className="aovivo-fileira" aria-label="Fileira de cima">
          {vagas.slice(0, 10).map(renderizar)}
        </ol>
        <div className="aovivo-corredor" aria-hidden="true">
          <span>ENTRADA</span>
          <b>→ circulação →</b>
          <span>SAÍDA</span>
        </div>
        <ol className="aovivo-fileira" aria-label="Fileira de baixo">
          {vagas.slice(10).map(renderizar)}
        </ol>
      </div>

      <ul className="aovivo-eventos" aria-label="Últimos movimentos (simulados)">
        {eventos.map((e) => (
          <li key={e.id}>
            <span className="aovivo-hora">{e.hora}</span>
            <span>{e.texto}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
