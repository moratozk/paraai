import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// Endereço que não existe: em vez de voltar calado para o início, a página diz
// o que houve e leva ao painel (quem entrou) ou ao início (quem não entrou).
export default function NaoEncontrada() {
  const { user } = useAuth();

  // O Firebase entrega o site para qualquer endereço, sempre como página
  // encontrada; isto pede aos buscadores que não guardem este.
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  return (
    <main className="container erro-tela">
      <div className="card">
        <span className="rotulo">Erro 404</span>
        <h1>Página não encontrada</h1>
        <p>O endereço pode ter sido digitado errado, ou a página mudou de lugar.</p>
        <Link to={user ? "/dashboard" : "/"} className="btn btn-primary">
          {user ? "Ir para o painel" : "Ir para o início"}
        </Link>
      </div>
    </main>
  );
}
