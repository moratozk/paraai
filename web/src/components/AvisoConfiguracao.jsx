import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import "./AvisoConfiguracao.css";

// Banner de diagnóstico: aparece quando o Firestore recusa leitura/escrita.
// Sem ele, o "permission-denied" fica só no console do navegador e os
// sintomas (perfil que não salva, conta de estacionamento que vira
// motorista) parecem bugs aleatórios do site.
export default function AvisoConfiguracao() {
  const { erroPermissao } = useAuth();
  const [dispensado, setDispensado] = useState(false);

  if (!erroPermissao || dispensado) return null;

  return (
    <div className="aviso-config" role="alert">
      <div className="container aviso-config-inner">
        <span className="aviso-config-icone" aria-hidden="true">
          !
        </span>
        <div className="aviso-config-texto">
          <strong>Banco de dados sem permissão de acesso.</strong> As regras de
          segurança do Firestore ainda não foram publicadas, então nada é salvo
          — o cadastro de estacionamento não consegue gravar o papel da conta e
          ela aparece como motorista. No Console do Firebase, vá em{" "}
          <em>Firestore Database → Regras</em>, cole o conteúdo do arquivo{" "}
          <code>firestore.rules</code> do projeto e clique em Publicar.
        </div>
        <button
          className="aviso-config-fechar"
          onClick={() => setDispensado(true)}
          aria-label="Dispensar aviso"
        >
          ×
        </button>
      </div>
    </div>
  );
}
