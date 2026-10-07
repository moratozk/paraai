import { useEffect } from "react";

const FOCAVEIS = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

// Mantém o foco do teclado dentro de um diálogo modal e, ao fechar, devolve
// o foco ao elemento que o abriu. Sem isso, o Tab sai do modal e passeia
// pela página escondida atrás do véu. O elemento do diálogo precisa de
// tabIndex={-1} para receber o foco quando não houver nada focável nele.
// Não use autoFocus dentro do diálogo: ele move o foco antes deste efeito e
// o hook perde o elemento para onde devolvê-lo.
export function useFocoNoModal(ref) {
  useEffect(() => {
    const modal = ref.current;
    if (!modal) return undefined;
    const anterior = document.activeElement;

    const visiveis = () =>
      [...modal.querySelectorAll(FOCAVEIS)].filter((el) => el.getClientRects().length > 0);

    // O primeiro controle do diálogo recebe o foco ao abrir.
    if (!modal.contains(document.activeElement)) {
      (visiveis()[0] || modal).focus();
    }

    function prender(event) {
      if (event.key !== "Tab") return;
      const focaveis = visiveis();
      if (focaveis.length === 0) {
        event.preventDefault();
        modal.focus();
        return;
      }
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      const dentro = modal.contains(document.activeElement);
      if (event.shiftKey && (!dentro || document.activeElement === primeiro || document.activeElement === modal)) {
        event.preventDefault();
        ultimo.focus();
      } else if (!event.shiftKey && (!dentro || document.activeElement === ultimo)) {
        event.preventDefault();
        primeiro.focus();
      }
    }

    document.addEventListener("keydown", prender);
    return () => {
      document.removeEventListener("keydown", prender);
      if (anterior instanceof HTMLElement && anterior.isConnected) anterior.focus();
    };
  }, [ref]);
}
