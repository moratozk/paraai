import "./Holofote.css";

/* Cartão com um brilho âmbar que segue o ponteiro. Só para mouse: no toque
   não existe "passar por cima", e o brilho ficaria preso onde o dedo tocou. */
export default function Holofote({ as: Tag = "div", className = "", children, ...resto }) {
  function aoMover(e) {
    if (e.pointerType !== "mouse") return;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  }

  return (
    <Tag className={`holofote ${className}`} onPointerMove={aoMover} {...resto}>
      {children}
    </Tag>
  );
}
