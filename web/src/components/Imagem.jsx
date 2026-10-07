import { useState } from "react";

/**
 * Imagem com proteção contra falha de rede.
 *
 * As fotos vêm de CDN externa; se a rede cair, em vez de mostrar o ícone
 * quebrado do navegador mantemos o bloco com a textura de concreto e o
 * gradiente âmbar, então o layout nunca "buraca".
 */
export default function Imagem({
  src,
  alt = "",
  className = "",
  largura = 1600,
  qualidade = 80,
  posicao = "center",
  eager = false,
  ...resto
}) {
  const [falhou, setFalhou] = useState(false);

  const url = src.startsWith("http")
    ? src
    : `https://images.unsplash.com/${src}?w=${largura}&q=${qualidade}&auto=format&fit=crop`;

  if (falhou) {
    return <div className={`img-fallback ${className}`} aria-hidden="true" {...resto} />;
  }

  return (
    <img
      src={url}
      alt={alt}
      className={className}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      onError={() => setFalhou(true)}
      style={{ objectPosition: posicao }}
      {...resto}
    />
  );
}
