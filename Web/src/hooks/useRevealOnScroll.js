import { useEffect } from "react";

// Revela elementos [data-reveal] conforme entram na viewport.
// Quem prefere menos movimento recebe tudo já visível, sem observer.
export function useRevealOnScroll() {
  useEffect(() => {
    const alvos = document.querySelectorAll("[data-reveal]");
    if (!alvos.length) return undefined;

    const semMovimento = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (semMovimento || typeof IntersectionObserver === "undefined") {
      alvos.forEach((el) => el.classList.add("revelado"));
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entradas) => {
        entradas.forEach((entrada) => {
          if (entrada.isIntersecting) {
            entrada.target.classList.add("revelado");
            observer.unobserve(entrada.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );

    alvos.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
}
