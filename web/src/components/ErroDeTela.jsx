import { Component } from "react";
import { useLocation } from "react-router-dom";
import { estaRecarregando } from "../pwa";

// Se uma tela quebra, ou o arquivo dela não chega (sem sinal, ou logo depois
// de uma publicação), fica um aviso com saída no lugar da página em branco.
// O menu continua no topo para ir a outra tela, e o botão recarrega a página.
class Protecao extends Component {
  state = { erro: null };

  static getDerivedStateFromError(erro) {
    return { erro };
  }

  componentDidUpdate(anteriores) {
    if (this.state.erro && anteriores.local !== this.props.local) this.setState({ erro: null });
  }

  render() {
    if (!this.state.erro) return this.props.children;
    // Versão nova no ar: a página já está recarregando (ver pwa.js).
    if (estaRecarregando()) return this.props.carregando;
    return (
      <main className="container erro-tela">
        <div className="card" role="alert">
          <h1>Esta tela não abriu</h1>
          <p>
            Pode ser a conexão ou uma versão nova do ParaAí que acabou de sair. Recarregar a
            página costuma resolver.
          </p>
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
            Recarregar a página
          </button>
        </div>
      </main>
    );
  }
}

export default function ErroDeTela({ carregando, children }) {
  const { pathname } = useLocation();
  return (
    <Protecao local={pathname} carregando={carregando}>
      {children}
    </Protecao>
  );
}
