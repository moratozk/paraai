// Marca do ParaAí
// -----------------------------------------------------------------------
// O "P" universal de estacionamento cuja haste é uma faixa de pista
// tracejada: parar aí + estrada. Glifo centrado geometricamente no badge
// (bbox x 11→37, centro 24) com traços iguais — simétrico e minimalista.
// A mesma marca é desenhada no display do totem (DisplayUI.ino).

export function LogoMark({ size = 36 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label="ParaAí"
    >
      <rect width="48" height="48" rx="12" fill="#FFC400" />
      <rect x="11" y="9" width="7" height="8" rx="1.5" fill="#15171C" />
      <rect x="11" y="20.5" width="7" height="8" rx="1.5" fill="#15171C" />
      <rect x="11" y="32" width="7" height="8" rx="1.5" fill="#15171C" />
      <path
        d="M18 12.5 h7.5 a8 8 0 0 1 0 16 H18"
        fill="none"
        stroke="#15171C"
        strokeWidth="7"
      />
    </svg>
  );
}

export default function Logo({ size = 36, wordmark = true }) {
  return (
    <span className="logo-lockup">
      <LogoMark size={size} />
      {wordmark && (
        <span className="logo-word">
          PARA<span className="logo-word-accent">AÍ</span>
        </span>
      )}
    </span>
  );
}
