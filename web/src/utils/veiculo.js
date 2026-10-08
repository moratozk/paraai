// Marca, modelo e cor que o motorista informa no Perfil. O totem mostra
// "GOL PRATA" na confirmação da entrada e copia modelo e cor para a vaga, que
// é o que o painel do estacionamento enxerga.
//
// A lista é nossa, e não a da Tabela FIPE: a FIPE cadastra cada versão
// ("Gol (novo) 1.0 Mi Total Flex 8V 4p"), comprida demais para a tela do
// totem, e consultá-la poria um serviço externo no cadastro. Modelo fora da
// lista pode ser digitado. Os nomes seguem o documento do carro (sem acento,
// até 20 caracteres) e cabem na fonte do totem. A mesma regra está em
// firebase/firestore.rules (nomeDeVeiculoValido) e firmware/totem/LogicaTotem.h.

export const MARCAS_VEICULO = [
  { nome: "Audi", modelos: ["A3", "A4", "A5", "Q3", "Q5", "Q7"] },
  { nome: "BMW", modelos: ["118i", "320i", "X1", "X2", "X3", "X5"] },
  {
    nome: "BYD",
    modelos: ["Dolphin", "Dolphin Mini", "King", "Seal", "Shark", "Song Plus", "Song Pro", "Yuan Plus"],
  },
  {
    nome: "Caoa Chery",
    modelos: ["Arrizo 5", "Arrizo 6", "Celer", "QQ", "Tiggo 2", "Tiggo 3X", "Tiggo 5X", "Tiggo 7", "Tiggo 8"],
  },
  {
    nome: "Chevrolet",
    modelos: [
      "Agile", "Astra", "Celta", "Classic", "Cobalt", "Corsa", "Cruze", "Equinox", "Meriva",
      "Montana", "Onix", "Onix Plus", "Prisma", "S10", "Spin", "Tracker", "Trailblazer",
      "Vectra", "Zafira",
    ],
  },
  { nome: "Citroen", modelos: ["Aircross", "Basalt", "C3", "C3 Aircross", "C4 Cactus", "C4 Lounge", "Jumpy"] },
  {
    nome: "Fiat",
    modelos: [
      "500", "Argo", "Cronos", "Doblo", "Ducato", "Fastback", "Fiorino", "Grand Siena", "Idea",
      "Linea", "Mobi", "Palio", "Pulse", "Punto", "Siena", "Strada", "Titano", "Toro", "Uno",
      "Weekend",
    ],
  },
  {
    nome: "Ford",
    modelos: [
      "Bronco Sport", "Courier", "EcoSport", "Edge", "Fiesta", "Focus", "Fusion", "Ka",
      "Ka Sedan", "Maverick", "Ranger", "Territory",
    ],
  },
  { nome: "GWM", modelos: ["Haval H6", "Ora 03", "Poer", "Tank 300"] },
  { nome: "Honda", modelos: ["Accord", "City", "Civic", "CR-V", "Fit", "HR-V", "WR-V", "ZR-V"] },
  {
    nome: "Hyundai",
    modelos: ["Azera", "Creta", "HB20", "HB20S", "HR", "i30", "ix35", "Kona", "Santa Fe", "Tucson"],
  },
  { nome: "JAC", modelos: ["E-JS1", "J3", "T40", "T50", "T60"] },
  { nome: "Jeep", modelos: ["Commander", "Compass", "Grand Cherokee", "Renegade", "Wrangler"] },
  { nome: "Kia", modelos: ["Bongo", "Cerato", "Niro", "Picanto", "Sorento", "Soul", "Sportage", "Stonic"] },
  {
    nome: "Land Rover",
    modelos: ["Defender", "Discovery Sport", "Freelander", "Range Rover Evoque", "Range Rover Velar"],
  },
  { nome: "Mercedes-Benz", modelos: ["Classe A", "Classe C", "GLA", "GLB", "GLC", "Sprinter"] },
  {
    nome: "Mitsubishi",
    modelos: ["ASX", "Eclipse Cross", "L200 Triton", "Lancer", "Outlander", "Pajero", "Pajero Sport"],
  },
  { nome: "Nissan", modelos: ["Frontier", "Kicks", "Leaf", "Livina", "March", "Sentra", "Tiida", "Versa"] },
  { nome: "Peugeot", modelos: ["206", "207", "208", "2008", "3008", "308", "408", "Expert", "Partner"] },
  { nome: "Porsche", modelos: ["911", "Cayenne", "Macan", "Panamera", "Taycan"] },
  { nome: "Ram", modelos: ["1500", "2500", "3500", "Rampage"] },
  {
    nome: "Renault",
    modelos: [
      "Captur", "Clio", "Duster", "Fluence", "Kangoo", "Kardian", "Kwid", "Logan", "Master",
      "Megane", "Oroch", "Sandero", "Stepway", "Symbol",
    ],
  },
  { nome: "Suzuki", modelos: ["Jimny", "S-Cross", "Swift", "Vitara"] },
  {
    nome: "Toyota",
    modelos: ["Camry", "Corolla", "Corolla Cross", "Etios", "Fielder", "Hilux", "Prius", "RAV4", "SW4", "Yaris"],
  },
  {
    nome: "Volkswagen",
    modelos: [
      "Amarok", "CrossFox", "Fox", "Fusca", "Gol", "Golf", "Jetta", "Kombi", "Nivus", "Parati",
      "Polo", "Saveiro", "SpaceFox", "T-Cross", "Taos", "Tera", "Tiguan", "Up!", "Virtus",
      "Voyage",
    ],
  },
  { nome: "Volvo", modelos: ["C40", "EX30", "XC40", "XC60", "XC90"] },
];

// Cores da tabela do RENAVAM, no masculino, como se fala do carro ("Gol
// prata", "Onix branco"); "vinho" é a grená do documento. A amostra é a cor
// da pintura, igual nos dois temas. Mesma lista em firestore.rules e no totem.
export const CORES_VEICULO = [
  { valor: "branco", rotulo: "Branco", amostra: "#f2f3f5" },
  { valor: "preto", rotulo: "Preto", amostra: "#17191d" },
  { valor: "prata", rotulo: "Prata", amostra: "#b8bec7" },
  { valor: "cinza", rotulo: "Cinza", amostra: "#6c727c" },
  { valor: "vermelho", rotulo: "Vermelho", amostra: "#b3232d" },
  { valor: "azul", rotulo: "Azul", amostra: "#1f4f9e" },
  { valor: "verde", rotulo: "Verde", amostra: "#2e6b46" },
  { valor: "marrom", rotulo: "Marrom", amostra: "#6b4a33" },
  { valor: "bege", rotulo: "Bege", amostra: "#d5c4a1" },
  { valor: "amarelo", rotulo: "Amarelo", amostra: "#e6bf2c" },
  { valor: "dourado", rotulo: "Dourado", amostra: "#b48e3e" },
  { valor: "laranja", rotulo: "Laranja", amostra: "#dd6f2a" },
  { valor: "vinho", rotulo: "Vinho", amostra: "#6b1f30" },
  { valor: "rosa", rotulo: "Rosa", amostra: "#e09ab4" },
  { valor: "roxo", rotulo: "Roxo", amostra: "#5d3b8b" },
];

// Opção "Outra marca" do formulário: grava sem marca e só com o modelo.
export const OUTRA_MARCA = "outra";

export const TAMANHO_NOME_VEICULO = 20;
const NOME_VEICULO = /^[A-Za-z0-9][A-Za-z0-9 .!-]{0,19}$/;

// Enquanto digita: tira acentos e símbolos, junta espaços repetidos e corta
// em 20 caracteres. O espaço do fim fica, senão "Onix " nunca vira "Onix Plus".
export function normalizarNomeVeiculo(texto) {
  return (texto || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 .!-]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[^A-Za-z0-9]+/, "")
    .slice(0, TAMANHO_NOME_VEICULO);
}

export function nomeVeiculoValido(texto) {
  return NOME_VEICULO.test(texto || "");
}

export function corVeiculoValida(valor) {
  return CORES_VEICULO.some((cor) => cor.valor === valor);
}

export function dadosDaCor(valor) {
  return CORES_VEICULO.find((cor) => cor.valor === valor) || null;
}

export function modelosDaMarca(marca) {
  return MARCAS_VEICULO.find((item) => item.nome === marca)?.modelos || [];
}

// Documento -> formulário. Modelo sem marca aparece como "Outra marca".
export function descricaoParaFormulario(dados) {
  return {
    marca: dados?.marca || (dados?.modelo ? OUTRA_MARCA : ""),
    modelo: dados?.modelo || "",
    cor: dados?.cor || "",
  };
}

// Formulário -> campos gravados. Vazio fica de fora (o serviço apaga).
// Devolve null quando algum campo preenchido está fora do formato.
export function prepararDescricao({ marca = "", modelo = "", cor = "" } = {}) {
  const limpos = {
    marca: marca === OUTRA_MARCA ? "" : normalizarNomeVeiculo(marca).trim(),
    modelo: normalizarNomeVeiculo(modelo).trim(),
    cor: cor || "",
  };
  if (limpos.marca && !nomeVeiculoValido(limpos.marca)) return null;
  if (limpos.modelo && !nomeVeiculoValido(limpos.modelo)) return null;
  if (limpos.cor && !corVeiculoValida(limpos.cor)) return null;
  return limpos;
}

export function descricaoPreenchida(valor) {
  const limpos = prepararDescricao(valor);
  return Boolean(limpos && (limpos.marca || limpos.modelo || limpos.cor));
}

// "Gol prata", como o totem fala do carro (lá em maiúsculas).
export function descreverVeiculo(dados) {
  const modelo = nomeVeiculoValido(dados?.modelo) ? dados.modelo : "";
  const cor = dadosDaCor(dados?.cor);
  if (modelo && cor) return `${modelo} ${cor.valor}`;
  return modelo || cor?.rotulo || "";
}

// "Volkswagen Gol", para o Perfil e o painel do motorista.
export function marcaEModelo(dados) {
  return [dados?.marca, dados?.modelo].filter(nomeVeiculoValido).join(" ");
}
