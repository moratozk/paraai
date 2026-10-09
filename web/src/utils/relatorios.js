// Recortes e totais das estadias encerradas (coleção historico), usados pelo
// painel do operador e pelo painel da rede do administrador.
import {
  formatarDataHora,
  valorPendente,
  valorRecebido,
} from "./format";

const DIAS_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export const PERIODOS = [
  { id: "hoje", rotulo: "Hoje", dias: 0 },
  { id: "7d", rotulo: "7 dias", dias: 7 },
  { id: "30d", rotulo: "30 dias", dias: 30 },
  { id: "tudo", rotulo: "Tudo", dias: null },
];

export function inicioDoDia(offsetDias = 0) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - offsetDias);
  return Math.floor(d.getTime() / 1000);
}

// Primeiro segundo do período: "hoje" começa à meia-noite e "7 dias" inclui
// hoje e os seis dias anteriores.
export function inicioDoPeriodo(periodo) {
  if (periodo.dias === null) return 0;
  return inicioDoDia(periodo.dias === 0 ? 0 : periodo.dias - 1);
}

// Totais de um conjunto de estadias. Recebido exclui o que o saldo do
// motorista não cobriu (pendência).
export function resumirEstadias(estadias) {
  const recebido = estadias.reduce((s, h) => s + valorRecebido(h), 0);
  const pendente = estadias.reduce((s, h) => s + valorPendente(h), 0);
  const cobrado = estadias.reduce((s, h) => s + (Number(h.valorCobrado) || 0), 0);
  const minutos = estadias.reduce((s, h) => s + (Number(h.duracaoMinutos) || 0), 0);
  return {
    estadias: estadias.length,
    recebido,
    pendente,
    ticketMedio: estadias.length ? cobrado / estadias.length : 0,
    permanenciaMedia: estadias.length ? minutos / estadias.length : 0,
  };
}

// Série diária de receita/acessos para o gráfico. Em duas semanas o dia da
// semana se repetiria (duas "qui"), então o rótulo passa a ser o dia do mês,
// que também cabe na coluna estreita do celular.
export function calcularSerieDiaria(historico, numDias) {
  const dias = [];
  for (let i = numDias - 1; i >= 0; i--) {
    const inicio = inicioDoDia(i);
    const data = new Date(inicio * 1000);
    dias.push({
      inicio,
      fim: inicio + 86400,
      rotulo:
        numDias > 7
          ? String(data.getDate()).padStart(2, "0")
          : DIAS_SEMANA[data.getDay()],
      dataCurta: data.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
      }),
      hoje: i === 0,
      valor: 0,
      acessos: 0,
    });
  }
  historico.forEach((h) => {
    const saida = Number(h.saida) || 0;
    const dia = dias.find((d) => saida >= d.inicio && saida < d.fim);
    if (dia) {
      dia.valor += valorRecebido(h);
      dia.acessos += 1;
    }
  });
  return dias;
}

export function calcularClientes(historico) {
  const porPlaca = {};
  historico.forEach((h) => {
    if (!h.placa) return;
    if (!porPlaca[h.placa]) {
      porPlaca[h.placa] = { placa: h.placa, acessos: 0, total: 0, ultimo: 0 };
    }
    const c = porPlaca[h.placa];
    c.acessos += 1;
    c.total += Number(h.valorCobrado) || 0;
    c.ultimo = Math.max(c.ultimo, Number(h.saida) || 0);
  });
  return Object.values(porPlaca).sort((a, b) => b.total - a.total);
}

// Hora do dia com mais entradas (0-23)
export function calcularHorarioPico(historico) {
  if (!historico.length) return null;
  const porHora = new Array(24).fill(0);
  historico.forEach((h) => {
    const entrada = Number(h.entrada) || 0;
    if (entrada > 0) porHora[new Date(entrada * 1000).getHours()] += 1;
  });
  const max = Math.max(...porHora);
  if (max === 0) return null;
  return { hora: porHora.indexOf(max), quantidade: max };
}

function paraArquivo(texto) {
  return (
    String(texto || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "estacionamento"
  );
}

// Planilha com separador ";" e vírgula decimal, como o Excel em português
// espera. Com nomesPorEstacionamento, ganha a coluna do estacionamento.
export function baixarCSV(historico, nomeArquivo, { nomesPorEstacionamento = null } = {}) {
  const cabecalho = [
    ...(nomesPorEstacionamento ? ["estacionamento"] : []),
    "placa",
    "vaga",
    "entrada",
    "saida",
    "duracao_minutos",
    "valor_cobrado",
    "valor_pendente",
  ];
  const linhas = historico.map((h) =>
    [
      ...(nomesPorEstacionamento
        ? [nomesPorEstacionamento[h.estacionamentoId] || h.estacionamentoId || ""]
        : []),
      h.placa || "",
      h.vaga || "",
      formatarDataHora(h.entrada),
      formatarDataHora(h.saida),
      h.duracaoMinutos || 0,
      (Number(h.valorCobrado) || 0).toFixed(2).replace(".", ","),
      valorPendente(h).toFixed(2).replace(".", ","),
    ]
      .map((celula) => {
        const texto = String(celula);
        return /[;"\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
      })
      .join(";")
  );
  const csv = [cabecalho.join(";"), ...linhas].join("\n");
  // BOM para o Excel abrir acentos corretamente
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `paraai-movimentacoes-${paraArquivo(nomeArquivo)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
