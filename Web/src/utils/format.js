// Formatação e validação compartilhadas pelas páginas.

// Placas no padrão do totem: só letras/números, maiúsculas, até 7 caracteres
export function normalizarPlaca(valor) {
  return (valor || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 7);
}

// Aceita os DOIS padrões oficiais brasileiros:
//   antigo:   ABC1234 (3 letras + 4 números)
//   Mercosul: ABC1D23 (3 letras + número + letra + 2 números)
const PLACA_ANTIGA   = /^[A-Z]{3}[0-9]{4}$/;
const PLACA_MERCOSUL = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/;

export function placaValida(placa) {
  return PLACA_ANTIGA.test(placa) || PLACA_MERCOSUL.test(placa);
}

// ---------- Telefone celular (BR) ----------

export function normalizarTelefone(valor) {
  return (valor || "").replace(/\D/g, "").slice(0, 11);
}

// (41) 99999-8888 enquanto digita
export function formatarTelefone(valor) {
  const d = normalizarTelefone(valor);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

// Celular brasileiro: DDD válido (11-99) + 9 dígitos começando em 9
export function telefoneValido(valor) {
  const d = normalizarTelefone(valor);
  if (d.length !== 11) return false;
  const ddd = Number(d.slice(0, 2));
  return ddd >= 11 && ddd <= 99 && d[2] === "9";
}

export function formatarMoeda(valor) {
  return (Number(valor) || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

// Timestamps do totem são Unix em SEGUNDOS
export function formatarDataHora(timestampSegundos) {
  const ts = Number(timestampSegundos);
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatarDuracao(minutosTotais) {
  const m = Math.max(0, Math.round(Number(minutosTotais) || 0));
  const horas = Math.floor(m / 60);
  const minutos = m % 60;
  if (horas > 0) return `${horas}h ${String(minutos).padStart(2, "0")}min`;
  return `${minutos} min`;
}

// Duração "ao vivo" (para o carro estacionado agora), a partir de segundos
export function formatarDuracaoAoVivo(segundos) {
  const s = Math.max(0, Math.floor(Number(segundos) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const seg = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}min`;
  if (m > 0) return `${m}min ${String(seg).padStart(2, "0")}s`;
  return `${seg}s`;
}
