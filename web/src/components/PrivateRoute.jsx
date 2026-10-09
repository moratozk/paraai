import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function PrivateRoute({ children }) {
  const { user, contaExcluida } = useAuth();

  // Quem acabou de excluir a conta vai para o início, onde aparece o aviso.
  if (!user) {
    return <Navigate to={contaExcluida ? "/" : "/login"} replace />;
  }

  return children;
}
