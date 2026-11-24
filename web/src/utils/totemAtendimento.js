// Atendimento do totem fora da placa: as mesmas leituras e gravações do
// firmware (firmware/totem/Atendimento.cpp), com as contas do site. Usado
// pelo totem reserva (pages/TotemReserva.jsx), que entra no lugar da placa
// se ela falhar, e pelo totem simulado dos testes e da demonstração sem
// internet (e2e/patio.js).
//
// O Firestore chega por parâmetro (fs: o módulo "firebase/firestore"), porque
// o site e os testes têm cada um o seu pacote do Firebase, e um banco aberto
// por um não aceita as funções do outro.
import { calcularCobranca, tarifaValida, TOLERANCIA_SALDO } from "./cobranca.js";
import { placaValida } from "./format.js";
import { obterTipoVaga } from "./mapaVagas.js";
import { corVeiculoValida, nomeVeiculoValido } from "./veiculo.js";

const MAX_VAGAS = 200;
const DIREITOS = ["pcd", "idoso", "gestante"];

const resposta = (tipo, titulo, detalhe = "", ajuda = "", carro = "") => ({ tipo, titulo, detalhe, ajuda, carro });
const emReais = (valor) => valor.toFixed(2).replace(".", ",");
const agoraEmSegundos = () => Math.floor(Date.now() / 1000);

// Vaga da entrada, na ordem de escolherVaga (firmware/totem/LogicaTotem.h): a
// reservada pelo dono da placa; senão, para quem declarou direito, a primeira
// livre do tipo dele; senão, a primeira comum livre e sem reserva valendo.
function escolherVaga(vagas, capacidade, reservada, agora, direito) {
  if (reservada >= 1 && reservada <= capacidade && !vagas[reservada].usada) return reservada;
  const livre = (n, tipo) => !vagas[n].usada && vagas[n].tipo === tipo && vagas[n].reservadaAte <= agora;
  if (direito !== "comum") for (let n = 1; n <= capacidade; n++) if (livre(n, direito)) return n;
  for (let n = 1; n <= capacidade; n++) if (livre(n, "comum")) return n;
  return 0;
}

const contarLivres = (vagas, capacidade, agora) =>
  vagas.slice(1, capacidade + 1).filter((vaga) => !vaga.usada && vaga.reservadaAte <= agora).length;

export function criarAtendimentoTotem(fs, db, estacionamentoId) {
  const { collection, deleteField, doc, getDoc, getDocs, setDoc, updateDoc, writeBatch } = fs;

  // Campos da vaga do totem. Os que ficam de fora (modelo e cor na saída, a
  // leitura física que não existe) são apagados, como a máscara do firmware.
  const dadosDaVaga = (placa, modelo = "", cor = "") => ({
    placa,
    ocupada: placa !== "",
    origemOcupacao: "registro",
    leituraValida: deleteField(),
    modelo: modelo || deleteField(),
    cor: cor || deleteField(),
  });

  const numeroDaVaga = (id) => {
    const n = Number(id);
    return Number.isInteger(n) && n >= 1 && n <= MAX_VAGAS && id === String(n) ? n : 0;
  };

  // Capacidade e tarifa do painel, reservas e tipos da projeção pública e
  // placas da vaga do totem. null quando o pátio está fora do formato.
  async function lerPatio() {
    const patio = (await getDoc(doc(db, "estacionamentos", estacionamentoId))).data();
    const capacidade = patio?.numVagas;
    if (!Number.isInteger(capacidade) || capacidade < 1 || capacidade > MAX_VAGAS ||
        !tarifaValida(patio.tarifaHora)) return null;
    const vagas = Array.from({ length: MAX_VAGAS + 1 }, (_, n) =>
      ({ usada: false, tipo: obterTipoVaga(undefined, n).tipo, reservadaAte: 0 }));
    for (const publica of (await getDocs(collection(db, "catalogoEstacionamentos", estacionamentoId, "vagas"))).docs) {
      const n = numeroDaVaga(publica.id);
      if (!n) continue;
      const { reservadaAte, tipo } = publica.data();
      vagas[n].reservadaAte = Number.isInteger(reservadaAte) && reservadaAte > 0 ? reservadaAte : 0;
      vagas[n].tipo = obterTipoVaga(tipo, n).tipo;
    }
    for (const operacional of (await getDocs(collection(db, "estacionamentos", estacionamentoId, "vagas"))).docs) {
      const n = numeroDaVaga(operacional.id);
      const { placa } = operacional.data();
      // Placa que não é texto: na dúvida a vaga não é oferecida.
      if (n) vagas[n].usada = placa !== undefined && (typeof placa !== "string" || placa !== "");
    }
    return { capacidade, tarifa: patio.tarifaHora, vagas };
  }

  // Reserva do app feita pelo dono da placa, ativa, deste pátio e válida por
  // mais 30 s. Qualquer outra situação é ignorada.
  async function vagaReservada(dono, agora) {
    if (!dono) return 0;
    const reserva = (await getDoc(doc(db, "reservas", dono))).data();
    const valida = reserva?.status === "ativa" && reserva.estacionamentoId === estacionamentoId &&
      Number.isInteger(reserva.vaga) && reserva.vaga >= 1 && reserva.vaga <= MAX_VAGAS &&
      Number.isInteger(reserva.expiraEm) && reserva.expiraEm > agora + 30;
    return valida ? reserva.vaga : 0;
  }

  // Lê o veículo. Na entrada, placa inédita é cadastrada sem dono, como o
  // CONFIRMAR da tela do totem.
  async function lerVeiculo(placa, cadastrar) {
    const ref = doc(db, "veiculos", placa);
    const snap = await getDoc(ref);
    if (snap.exists() || !cadastrar) return { ref, veiculo: snap.exists() ? snap.data() : null, placaNova: false };
    await setDoc(ref, {
      ativo: true, vagaAtual: 0, horaEntrada: 0, saldo: 0, estacionamentoId: "",
      tarifaHoraEntrada: 0, cadastradoNoTotem: true,
    });
    return { ref, veiculo: (await getDoc(ref)).data(), placaNova: true };
  }

  // segundosAtras: só para o teste ter uma estadia com tempo sem esperar. As
  // regras aceitam até 5 minutos de diferença no relógio do totem.
  async function entrada(placa, { segundosAtras = 0 } = {}) {
    if (!placaValida(placa)) return resposta("alerta", "CONFIRA A PLACA", placa);
    const { ref, veiculo, placaNova } = await lerVeiculo(placa, true);
    if (!Number.isInteger(veiculo.vagaAtual) || veiculo.vagaAtual < 0 || veiculo.vagaAtual > MAX_VAGAS ||
        !Number.isFinite(veiculo.saldo)) return resposta("erro", "CADASTRO INVALIDO", placa, "Procure o responsavel");
    if (veiculo.ativo !== true) return resposta("alerta", "CADASTRO INATIVO", placa, "Procure o responsavel");
    if (veiculo.vagaAtual !== 0 || veiculo.estacionamentoId)
      return resposta("alerta", "JA ESTA ESTACIONADO", placa, "Use SAIDA ao terminar");
    if (!(veiculo.saldo > -TOLERANCIA_SALDO))
      return resposta("alerta", "SALDO PENDENTE", placa, "Regularize no app para entrar");
    const agora = agoraEmSegundos();
    const reservada = await vagaReservada(veiculo.ownerUid, agora);
    const direito = DIREITOS.includes(veiculo.vagaEspecial) ? veiculo.vagaEspecial : "comum";
    // Modelo e cor fora do formato: nenhum dos dois, e a tela fica com a placa.
    let { modelo = "", cor = "" } = veiculo;
    if ((modelo && !nomeVeiculoValido(modelo)) || (cor && !corVeiculoValida(cor))) modelo = cor = "";
    const carro = modelo ? `${modelo}${cor ? ` ${cor}` : ""}`.toUpperCase() : "";
    const patio = await lerPatio();
    if (!patio) return resposta("erro", "VERIFIQUE O PAINEL", "Nada foi registrado", "Procure o responsavel");
    const vaga = escolherVaga(patio.vagas, patio.capacidade, reservada, agora, direito);
    if (!vaga) return resposta("alerta", "SEM VAGAS LIVRES", "Estacionamento lotado", "Tente mais tarde");
    const usouReserva = vaga === reservada;
    const lote = writeBatch(db);
    lote.update(ref, {
      vagaAtual: vaga, horaEntrada: agora - segundosAtras, estacionamentoId, tarifaHoraEntrada: patio.tarifa,
    });
    lote.set(doc(db, "estacionamentos", estacionamentoId, "vagas", String(vaga)),
      dadosDaVaga(placa, modelo, cor), { merge: true });
    lote.set(doc(db, "catalogoEstacionamentos", estacionamentoId, "vagas", String(vaga)),
      { ocupada: true, reservadaAte: 0 }, { merge: true });
    if (usouReserva) lote.update(doc(db, "reservas", veiculo.ownerUid), { status: "utilizada" });
    await lote.commit();
    return {
      ...resposta("sucesso", "ENTRADA CONFIRMADA", placa,
        `${usouReserva ? "Vaga reservada" : "Vaga"} ${vaga} - R$ ${emReais(patio.tarifa)}/h`, carro),
      vaga, reservada: usouReserva, placaNova,
    };
  }

  // Saída: a conta de cobranca.js (a mesma do firmware), o débito, a vaga
  // livre e o recibo, juntos. Sem catraca, a saída sempre é registrada; o que
  // o saldo não cobre fica pendente.
  async function saida(placa) {
    if (!placaValida(placa)) return resposta("alerta", "CONFIRA A PLACA", placa);
    const { ref, veiculo } = await lerVeiculo(placa, false);
    if (!veiculo) return resposta("alerta", "PLACA SEM CADASTRO", placa, "Confira os caracteres");
    if (veiculo.ativo !== true) return resposta("alerta", "CADASTRO INATIVO", placa, "Procure o responsavel");
    if (!veiculo.vagaAtual) return resposta("alerta", "SEM ENTRADA ABERTA", placa, "Nenhuma saida a registrar");
    if (veiculo.estacionamentoId !== estacionamentoId)
      return resposta("alerta", "USE O OUTRO TOTEM", placa, "A entrada foi em outro local");
    const agora = agoraEmSegundos();
    const conta = calcularCobranca({
      entrada: veiculo.horaEntrada, saida: agora, tarifa: veiculo.tarifaHoraEntrada, saldo: veiculo.saldo,
    });
    if (!conta) return resposta("erro", "ESTADIA INCONSISTENTE", "Confira horario e tarifa", "Procure o responsavel");
    const refVaga = doc(db, "estacionamentos", estacionamentoId, "vagas", String(veiculo.vagaAtual));
    const vaga = await getDoc(refVaga);
    if (!vaga.exists() || vaga.data().placa !== placa)
      return resposta("erro", "VAGA INCONSISTENTE", "Saida nao registrada", "Procure o responsavel");
    const recibo = {
      placa, vaga: veiculo.vagaAtual, entrada: veiculo.horaEntrada, saida: agora,
      duracaoMinutos: conta.duracaoMinutos, valorCobrado: conta.valor, valorPendente: conta.pendente,
      tarifaHora: veiculo.tarifaHoraEntrada, estacionamentoId,
    };
    const lote = writeBatch(db);
    lote.update(ref, {
      vagaAtual: 0, horaEntrada: 0, estacionamentoId: "", tarifaHoraEntrada: 0, saldo: conta.saldoFinal,
    });
    lote.set(refVaga, dadosDaVaga(""), { merge: true });
    lote.set(doc(db, "historico", `${placa}_${veiculo.horaEntrada}`), recibo);
    lote.set(doc(db, "catalogoEstacionamentos", estacionamentoId, "vagas", String(veiculo.vagaAtual)),
      { ocupada: false }, { merge: true });
    await lote.commit();
    const minutos = `${conta.duracaoMinutos} min`;
    const final = conta.pendente >= TOLERANCIA_SALDO
      ? resposta("alerta", "SAIDA COM PENDENCIA", `R$ ${emReais(conta.valor)} em ${minutos}`, `Regularize no app - ${placa}`)
      : resposta("sucesso", "SAIDA CONFIRMADA", `R$ ${emReais(conta.valor)}`, `${minutos} - ${placa}`);
    return { ...final, recibo, saldoFinal: conta.saldoFinal };
  }

  // Sinal de vida (heartbeat do firmware, a cada 60 s): é por ele que os
  // painéis mostram o totem online e a vitrine conta as vagas livres.
  async function sinal() {
    const patio = await lerPatio();
    if (!patio) return false;
    const agora = agoraEmSegundos();
    const disponibilidade = {
      ultimaAtualizacao: agora,
      vagasLivres: contarLivres(patio.vagas, patio.capacidade, agora),
      vagasEmOperacao: patio.capacidade,
    };
    await updateDoc(doc(db, "estacionamentos", estacionamentoId), {
      ...disponibilidade, tarifaAplicadaTotem: patio.tarifa, modoTotem: "atendimento",
      vagasSuportadasTotem: deleteField(),
    });
    await updateDoc(doc(db, "catalogoEstacionamentos", estacionamentoId), disponibilidade);
    return true;
  }

  // Mapa do pátio, para a tela da demonstração sem internet.
  async function vagas() {
    const patio = await lerPatio();
    if (!patio) return [];
    const placas = new Map((await getDocs(collection(db, "estacionamentos", estacionamentoId, "vagas"))).docs
      .map((vaga) => [numeroDaVaga(vaga.id), vaga.data().placa || ""]));
    const agora = agoraEmSegundos();
    return patio.vagas.slice(1, patio.capacidade + 1).map((vaga, indice) => ({
      numero: indice + 1,
      tipo: vaga.tipo,
      placa: placas.get(indice + 1) || "",
      reservadaAte: vaga.reservadaAte > agora ? vaga.reservadaAte : 0,
    }));
  }

  return { entrada, saida, sinal, vagas };
}

// Instalação por código, como vincularConta no firmware: o aparelho já entrou
// com a conta nova dele (uid e email) e, num lote só, grava o próprio cadastro
// com o pátio e o nome do código e apaga o código. As regras recusam a
// leitura de um código vencido, já usado ou que não existe.
export async function vincularTotemPorCodigo(fs, db, { uid, email, codigo }) {
  const { doc, getDoc, writeBatch } = fs;
  const pedido = (await getDoc(doc(db, "codigosInstalacao", codigo))).data();
  if (!pedido) throw new Error("codigo-recusado");
  const lote = writeBatch(db);
  lote.set(doc(db, "totems", uid), {
    estacionamentoId: pedido.estacionamentoId, nome: pedido.nome, email, ativo: true,
    codigoInstalacao: codigo, vinculadoEm: agoraEmSegundos(),
  });
  lote.delete(doc(db, "codigosInstalacao", codigo));
  await lote.commit();
  return { estacionamentoId: pedido.estacionamentoId, nome: pedido.nome, nomeEstacionamento: pedido.nomeEstacionamento };
}
