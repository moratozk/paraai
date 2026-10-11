// Marca do ParaAí
// -----------------------------------------------------------------------
// A logo é o arquivo em public/logo.png, desenhado pelo dono do projeto.
// Não é redesenhada em código: qualquer ajuste é feito trocando o arquivo.
// Na tela ela nunca passa de 54 px, então o site usa logo-192.webp, a mesma
// logo.png reduzida (4 KB em vez de 210 KB). Ao trocar a logo, gerar de novo.

export function LogoMark({ size = 36 }) {
  return (
    <img
      src="/logo-192.webp"
      width={size}
      height={size}
      alt=""
      className="logo-marca"
      draggable="false"
    />
  );
}

export default function Logo({ size = 36, wordmark = true }) {
  return (
    <span className="logo-lockup">
      <img
        src="/logo-192.webp"
        width={size}
        height={size}
        alt={wordmark ? "" : "ParaAí"}
        className="logo-marca"
        draggable="false"
      />
      {wordmark && (
        <span className="logo-word">
          PARA<span className="logo-word-accent">AÍ</span>
        </span>
      )}
    </span>
  );
}
