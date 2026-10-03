import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// Evita que uma sessão restaurada pelo Firebase volte para as telas de
// apresentação, login ou cadastro. O AuthProvider só monta as rotas após
// concluir a restauração da sessão, portanto não há redirecionamento prematuro.
export default function PublicRoute({ children }) {
  const { user } = useAuth();

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
