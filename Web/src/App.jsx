import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { ToastProvider } from "./context/ToastContext";
import Navbar from "./components/Navbar";
import PrivateRoute from "./components/PrivateRoute";
import AvisoConfiguracao from "./components/AvisoConfiguracao";

import Home from "./pages/Home";
import Login from "./pages/Login";
import Cadastro from "./pages/Cadastro";
import RecuperarSenha from "./pages/RecuperarSenha";
import RedefinirSenha from "./pages/RedefinirSenha";
import Dashboard from "./pages/Dashboard";
import Historico from "./pages/Historico";
import Perfil from "./pages/Perfil";
import Configuracoes from "./pages/Configuracoes";

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <div className="app-shell">
              <AvisoConfiguracao />
              <Navbar />

              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/login" element={<Login />} />
                <Route path="/cadastro" element={<Cadastro />} />
                <Route path="/recuperar-senha" element={<RecuperarSenha />} />
                <Route path="/redefinir-senha" element={<RedefinirSenha />} />

                <Route
                  path="/dashboard"
                  element={
                    <PrivateRoute>
                      <Dashboard />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/historico"
                  element={
                    <PrivateRoute>
                      <Historico />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/perfil"
                  element={
                    <PrivateRoute>
                      <Perfil />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/configuracoes"
                  element={
                    <PrivateRoute>
                      <Configuracoes />
                    </PrivateRoute>
                  }
                />
              </Routes>
            </div>
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
