import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Logo from "../components/Logo";
import Placa from "../components/Placa";
import {
  atendimentoDoTotemReserva,
  desinstalarTotemReserva,
  instalarTotemReserva,
  observarTotemReserva,
} from "../services/totemReserva";
import { codigoInstalacaoValido } from "../utils/codigoInstalacao";
import { normalizarPlaca, placaValida } from "../utils/format";
import "./TotemReserva.css";

// Totem reserva: a tela do totem no navegador, para a placa que falhar. Faz
// as mesmas leituras e gravações do firmware (utils/totemAtendimento.js) com
// uma conta de totem instalada pelo código do Perfil, então o mapa ao vivo, o
// painel e o celular do motorista mudam como mudariam com a placa.

const SINAL_MS = 60_000;
const ESPERA_MS = 15_000;
const VOLTA_RESULTADO_MS = 10_000;
const VOLTA_PLACA_MS = 90_000;

const comPrazo = (promessa) =>
  Promise.race([
    promessa,
    new Promise((_, falhar) => setTimeout(() => falhar(new Error("sem-resposta")), ESPERA_MS)),
  ]);

function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const mudar = () => setOnline(navigator.onLine);
    window.addEventListener("online", mudar);
    window.addEventListener("offline", mudar);
    return () => {
      window.removeEventListener("online", mudar);
      window.removeEventListener("offline", mudar);
    };
  }, []);
  return online;
}

// Tela acesa enquanto o totem reserva estiver aberto, onde o navegador deixa.
function useTelaAcesa() {
  useEffect(() => {
    let trava = null;
    const pedir = () => {
      if (document.visibilityState !== "visible" || !navigator.wakeLock) return;
      navigator.wakeLock.request("screen").then((t) => { trava = t; }).catch(() => {});
    };
    pedir();
    document.addEventListener("visibilitychange", pedir);
    return () => {
      document.removeEventListener("visibilitychange", pedir);
      trava?.release().catch(() => {});
    };
  }, []);
}

function Instalar({ aoInstalar, instalandoRef }) {
  const [codigo, setCodigo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  async function enviar(evento) {
    evento.preventDefault();
    setEnviando(true);
    setErro("");
    // Enquanto instala, a conta nova ainda não tem cadastro de totem: o
    // observador não deve voltar a tela para cá no meio do caminho.
    instalandoRef.current = true;
    try {
      aoInstalar(await comPrazo(instalarTotemReserva(codigo)));
    } catch (falha) {
      const texto = String(falha?.code || falha?.message || "");
      setErro(
        texto.includes("permission") || texto.includes("codigo-recusado")
          ? "Código recusado: ele vale 15 minutos e serve para um totem só. Gere outro no Perfil."
          : "Sem conexão com o ParaAí. Confira a internet e tente de novo."
      );
    } finally {
      instalandoRef.current = false;
      setEnviando(false);
    }
  }

  return (
    <form className="totem-reserva-cartao" onSubmit={enviar}>
      <h1 className="totem-reserva-titulo">Totem reserva</h1>
      <p>
        Use este aparelho no lugar do totem quando ele não funcionar. Entre no site com a conta do
        estacionamento, abra <strong>Perfil › Segurança do totem</strong>, toque em
        <strong> Instalar um totem</strong> e digite o código aqui.
      </p>
      <label className="totem-reserva-rotulo" htmlFor="totem-reserva-codigo">Código de instalação</label>
      <input
        id="totem-reserva-codigo"
        className="totem-reserva-campo"
        value={codigo}
        onChange={(e) => setCodigo(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck="false"
        placeholder="K7M2Q9XZ"
        aria-describedby="totem-reserva-erro"
      />
      <p id="totem-reserva-erro" className="totem-reserva-erro" role="alert">{erro}</p>
      <button className="btn btn-primary totem-reserva-botao" disabled={!codigoInstalacaoValido(codigo) || enviando}>
        {enviando ? "Instalando…" : "Instalar"}
      </button>
    </form>
  );
}

function Atendimento({ totem, online, aoDesinstalar }) {
  const [tela, setTela] = useState({ nome: "inicio" });
  const [placa, setPlaca] = useState("");
  const [sinalOk, setSinalOk] = useState(true);
  const [confirmarSaida, setConfirmarSaida] = useState(false);
  const atendimento = useMemo(() => atendimentoDoTotemReserva(totem.estacionamentoId), [totem.estacionamentoId]);

  const voltar = useCallback(() => {
    setPlaca("");
    setTela({ nome: "inicio" });
  }, []);

  // Sinal de vida, como o firmware: os painéis mostram o totem online.
  useEffect(() => {
    const enviar = () =>
      comPrazo(atendimento.sinal()).then(() => setSinalOk(true), () => setSinalOk(false));
    enviar();
    const intervalo = setInterval(enviar, SINAL_MS);
    return () => clearInterval(intervalo);
  }, [atendimento]);

  // Sem toque por um tempo, a tela volta ao início, como no totem.
  useEffect(() => {
    if (tela.nome === "resultado") {
      const prazo = setTimeout(voltar, VOLTA_RESULTADO_MS);
      return () => clearTimeout(prazo);
    }
    if (tela.nome === "placa") {
      const prazo = setTimeout(voltar, VOLTA_PLACA_MS);
      return () => clearTimeout(prazo);
    }
    return undefined;
  }, [tela, placa, voltar]);

  async function confirmar(evento) {
    evento.preventDefault();
    if (!placaValida(placa)) return;
    const operacao = tela.operacao;
    setTela({ nome: "registrando", operacao });
    let resultado;
    try {
      resultado = await comPrazo(atendimento[operacao](placa));
    } catch (falha) {
      resultado = falha?.message === "sem-resposta"
        ? { tipo: "erro", titulo: "SEM RESPOSTA", detalhe: "Confira o mapa antes de repetir", ajuda: "A internet pode ter caído" }
        : { tipo: "erro", titulo: "NAO REGISTRADO", detalhe: "Nada foi gravado", ajuda: "Tente de novo ou procure o responsavel" };
    }
    setTela({ nome: "resultado", operacao, resultado });
  }

  const conectado = online && sinalOk;

  return (
    <>
      <header className="totem-reserva-topo">
        <Logo size={32} />
        <span className="totem-reserva-local">{totem.nomeEstacionamento || totem.nome}</span>
        <span className={`totem-reserva-status ${conectado ? "ok" : "falha"}`} role="status">
          {conectado ? "ONLINE" : online ? "CONECTANDO" : "SEM INTERNET"}
        </span>
      </header>

      <main className="totem-reserva-centro">
        {tela.nome === "inicio" && (
          <div className="totem-reserva-acoes">
            <button className="totem-reserva-acao entrada" onClick={() => setTela({ nome: "placa", operacao: "entrada" })}>
              ENTRADA
            </button>
            <button className="totem-reserva-acao saida" onClick={() => setTela({ nome: "placa", operacao: "saida" })}>
              SAÍDA
            </button>
          </div>
        )}

        {tela.nome === "placa" && (
          <form className="totem-reserva-cartao" onSubmit={confirmar}>
            <h1 className="totem-reserva-titulo">{tela.operacao === "entrada" ? "Entrada" : "Saída"}</h1>
            <label className="totem-reserva-rotulo" htmlFor="totem-reserva-placa">Digite a placa</label>
            <input
              id="totem-reserva-placa"
              className="totem-reserva-campo"
              value={placa}
              onChange={(e) => setPlaca(normalizarPlaca(e.target.value))}
              autoFocus
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck="false"
              placeholder="ABC1D23"
            />
            <div className="totem-reserva-previa" aria-hidden="true">
              {placaValida(placa) ? <Placa placa={placa} tamanho="grande" /> : null}
            </div>
            <div className="totem-reserva-linha">
              <button type="button" className="btn btn-outline totem-reserva-botao" onClick={voltar}>Voltar</button>
              <button className="btn btn-primary totem-reserva-botao" disabled={!placaValida(placa)}>Confirmar</button>
            </div>
          </form>
        )}

        {tela.nome === "registrando" && (
          <div className="totem-reserva-cartao" role="status" aria-live="polite">
            <span className="spinner" aria-hidden="true" />
            <p className="totem-reserva-titulo">Registrando…</p>
          </div>
        )}

        {tela.nome === "resultado" && (
          <div className={`totem-reserva-cartao resultado ${tela.resultado.tipo}`} role="alert">
            <p className="totem-reserva-titulo">{tela.resultado.titulo}</p>
            {tela.resultado.carro ? <p className="totem-reserva-carro">{tela.resultado.carro}</p> : null}
            {tela.resultado.detalhe ? <p className="totem-reserva-detalhe">{tela.resultado.detalhe}</p> : null}
            {tela.resultado.ajuda ? <p>{tela.resultado.ajuda}</p> : null}
            <button className="btn btn-primary totem-reserva-botao" onClick={voltar}>OK</button>
          </div>
        )}
      </main>

      <footer className="totem-reserva-rodape">
        <span>Totem reserva · {totem.nome}</span>
        {confirmarSaida ? (
          <span className="totem-reserva-linha">
            <button className="btn btn-outline btn-sm" onClick={() => setConfirmarSaida(false)}>Manter</button>
            <button className="btn btn-danger btn-sm" onClick={aoDesinstalar}>Tirar deste aparelho</button>
          </span>
        ) : (
          <button className="btn btn-ghost btn-sm" onClick={() => setConfirmarSaida(true)}>Desinstalar</button>
        )}
      </footer>
    </>
  );
}

export default function TotemReserva() {
  const [totem, setTotem] = useState(undefined);
  const instalandoRef = useRef(false);
  const online = useOnline();
  useTelaAcesa();

  useEffect(() => observarTotemReserva((valor) => {
    if (!instalandoRef.current) setTotem(valor);
  }), []);

  let conteudo;
  if (totem === undefined) {
    conteudo = (
      <main className="totem-reserva-centro" role="status">
        <span className="spinner" aria-hidden="true" />
      </main>
    );
  } else if (totem?.erro) {
    conteudo = (
      <main className="totem-reserva-centro">
        <div className="totem-reserva-cartao" role="alert">
          <p className="totem-reserva-titulo">Sem conexão</p>
          <p>Não deu para conferir este totem. Confira a internet e recarregue a página.</p>
          <button className="btn btn-primary totem-reserva-botao" onClick={() => window.location.reload()}>Recarregar</button>
        </div>
      </main>
    );
  } else if (!totem) {
    conteudo = (
      <main className="totem-reserva-centro">
        <Instalar aoInstalar={setTotem} instalandoRef={instalandoRef} />
      </main>
    );
  } else {
    conteudo = (
      <Atendimento
        key={totem.uid}
        totem={totem}
        online={online}
        aoDesinstalar={() => desinstalarTotemReserva().then(() => setTotem(null))}
      />
    );
  }

  return <div className="totem-reserva">{conteudo}</div>;
}
