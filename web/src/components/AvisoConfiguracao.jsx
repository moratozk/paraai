import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import "./AvisoConfiguracao.css";

// Banner de diagnóstico: aparece quando o Firestore recusa leitura/escrita.
// Sem ele, o "permission-denied" fica só no console do navegador e os
// sintomas (perfil que não salva, conta de estacionamento que vira
// motorista) parecem bugs aleatórios do site. O texto é para quem usa o site;
// a causa mais comum é o firestore.rules publicado estar atrás do site
// (publique as regras antes do site, ver ESTADO.md), e o erro completo fica
// no console.
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
          <strong>Não conseguimos carregar os dados da sua conta.</strong> Até
          isso se resolver, o que você mudar pode não ser salvo. Atualize a
          página em alguns minutos; se o aviso continuar, fale com a equipe do
          ParaAí.
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
