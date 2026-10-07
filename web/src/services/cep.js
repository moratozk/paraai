// =========================================================================
// Consulta de CEP via ViaCEP (api pública, gratuita, sem chave).
// Usada no cadastro do estacionamento: o dono digita só o CEP e o número,
// o resto do endereço vem preenchido.
// =========================================================================

const TIMEOUT_MS = 8000;

export function normalizarCep(valor) {
  return (valor || "").replace(/\D/g, "").slice(0, 8);
}

export function formatarCep(valor) {
  const d = normalizarCep(valor);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

export function cepCompleto(valor) {
  return normalizarCep(valor).length === 8;
}

// Retorna { logradouro, bairro, cidade, uf } ou lança Error com mensagem
// pronta para exibir ao usuário.
export async function buscarCep(valor) {
  const cep = normalizarCep(valor);
  if (cep.length !== 8) {
    throw new Error("CEP deve ter 8 dígitos.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let resposta;
  try {
    resposta = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error("A consulta demorou demais. Tente de novo.", { cause: err });
    }
    throw new Error("Não foi possível consultar o CEP. Verifique sua conexão.", {
      cause: err,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!resposta.ok) {
    throw new Error("Serviço de CEP indisponível no momento.");
  }

  const dados = await resposta.json();
  if (dados.erro) {
    throw new Error("CEP não encontrado. Confira o número digitado.");
  }

  return {
    logradouro: dados.logradouro || "",
    bairro: dados.bairro || "",
    cidade: dados.localidade || "",
    uf: dados.uf || "",
  };
}

// Monta o endereço completo em uma linha, para exibir no painel
export function montarEnderecoLinha({ logradouro, numero, bairro, cidade, uf }) {
  const rua = [logradouro, numero].filter(Boolean).join(", ");
  const local = [bairro, cidade].filter(Boolean).join(" - ");
  return [rua, local, uf].filter(Boolean).join(" · ");
}
