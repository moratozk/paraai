import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { ToastProvider } from "./context/ToastContext";
import Navbar from "./components/Navbar";
import PrivateRoute from "./components/PrivateRoute";
import PublicRoute from "./components/PublicRoute";
import AvisoConfiguracao from "./components/AvisoConfiguracao";
import ErroDeTela from "./components/ErroDeTela";
import { useTituloDaPagina } from "./hooks/useTituloDaPagina";

// Cada tela vira um pacote separado. Assim a home não baixa de uma vez os
// painéis, gráficos, formulários e modal de recarga que talvez nem sejam usados.
const Home = lazy(() => import("./pages/Home"));
const Login = lazy(() => import("./pages/Login"));
const Cadastro = lazy(() => import("./pages/Cadastro"));
const RecuperarSenha = lazy(() => import("./pages/RecuperarSenha"));
const RedefinirSenha = lazy(() => import("./pages/RedefinirSenha"));
const AcaoConta = lazy(() => import("./pages/AcaoConta"));
const Privacidade = lazy(() => import("./pages/Privacidade"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const MarketplaceEstacionamentos = lazy(() => import("./pages/MarketplaceEstacionamentos"));
const Historico = lazy(() => import("./pages/Historico"));
const Perfil = lazy(() => import("./pages/Perfil"));
const Configuracoes = lazy(() => import("./pages/Configuracoes"));
const MonitoramentoVagasAdmin = lazy(() => import("./pages/MonitoramentoVagasAdmin"));
const MaqueteVirtual = lazy(() => import("./pages/MaqueteVirtual"));
const NaoEncontrada = lazy(() => import("./pages/NaoEncontrada"));

// Nome da página na aba do navegador. O do painel e o dos acessos mudam com o
// papel da conta, como no menu (ver Navbar).
function Titulo({ nome, children }) {
  const { userData } = useAuth();
  useTituloDaPagina(typeof nome === "function" ? nome(userData?.role) : nome);
  return children;
}

const carregando = (
  <div className="estado-central" role="status" aria-live="polite">
    <span className="spinner" aria-hidden="true" />
    <span>Carregando…</span>
  </div>
);

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <div className="app-shell">
              <AvisoConfiguracao />
              <Navbar />

              <ErroDeTela carregando={carregando}>
              <Suspense fallback={carregando}>
                <Routes>
                <Route path="/" element={<PublicRoute><Home /></PublicRoute>} />
                <Route path="/login" element={<PublicRoute><Titulo nome="Entrar"><Login /></Titulo></PublicRoute>} />
                <Route path="/cadastro" element={<PublicRoute><Titulo nome="Criar conta"><Cadastro /></Titulo></PublicRoute>} />
                <Route path="/recuperar-senha" element={<PublicRoute><Titulo nome="Recuperar senha"><RecuperarSenha /></Titulo></PublicRoute>} />
                <Route path="/redefinir-senha" element={<PublicRoute><Titulo nome="Criar nova senha"><RedefinirSenha /></Titulo></PublicRoute>} />
                {/* Links dos e-mails do Firebase; vale logado ou não (ver AcaoConta). */}
                <Route path="/acao" element={<Titulo nome="Sua conta"><AcaoConta /></Titulo>} />
                {/* Política de privacidade: o cadastro aponta para cá antes de a conta existir. */}
                <Route path="/privacidade" element={<Titulo nome="Privacidade"><Privacidade /></Titulo>} />

                <Route
                  path="/dashboard"
                  element={
                    <PrivateRoute>
                      <Titulo nome={(papel) => (papel === "admin" ? "Administração" : "Painel")}>
                        <Dashboard />
                      </Titulo>
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/historico"
                  element={
                    <PrivateRoute>
                      <Titulo nome={(papel) => (papel === "operador" ? "Movimentações" : "Meus acessos")}>
                        <Historico />
                      </Titulo>
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/estacionamentos"
                  element={
                    <PrivateRoute>
                      <Titulo nome="Estacionamentos">
                        <MarketplaceEstacionamentos />
                      </Titulo>
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/perfil"
                  element={
                    <PrivateRoute>
                      <Titulo nome="Perfil">
                        <Perfil />
                      </Titulo>
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/configuracoes"
                  element={
                    <PrivateRoute>
                      <Titulo nome="Configurações">
                        <Configuracoes />
                      </Titulo>
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/estacionamentos/:estId/vagas"
                  element={
                    <PrivateRoute>
                      <Titulo nome="Vagas ao vivo">
                        <MonitoramentoVagasAdmin />
                      </Titulo>
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/estacionamentos/:estId/maquete"
                  element={
                    <PrivateRoute>
                      <Titulo nome="Maquete virtual">
                        <MaqueteVirtual />
                      </Titulo>
                    </PrivateRoute>
                  }
                />
                  {/* Endereço que não existe: avisa, em vez de voltar calado ao início. */}
                  <Route
                    path="*"
                    element={
                      <Titulo nome="Página não encontrada">
                        <NaoEncontrada />
                      </Titulo>
                    }
                  />
                </Routes>
              </Suspense>
              </ErroDeTela>
            </div>
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
