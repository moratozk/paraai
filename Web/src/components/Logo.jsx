// Marca do ParaAí
// -----------------------------------------------------------------------
// A logo é o arquivo em public/logo.png, desenhado pelo dono do projeto.
// Não é redesenhada em código: qualquer ajuste é feito trocando o arquivo.

export function LogoMark({ size = 36 }) {
  return (
    <img
      src="/logo.png"
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
        src="/logo.png"
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
