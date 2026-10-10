import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, where, setDoc, updateDoc, deleteDoc, writeBatch, Timestamp, increment, deleteField, serverTimestamp, setLogLevel } from 'firebase/firestore';
import { createMockUserToken } from '@firebase/util';

// Nunca aceitar projeto/host de produção, nem carregar Credenciais.h/.env.
const projectId = 'demo-paraai';
setLogLevel('silent'); // Rejeições esperadas são conferidas por assertFails.
const host = process.env.FIRESTORE_EMULATOR_HOST;
assert.match(host ?? '', /^(127\.0\.0\.1|localhost):8180$/,
  'Execute npm test: esta suíte só pode usar o emulador local na porta 8180.');
const base = `http://${host}/v1/projects/${projectId}/databases/(default)/documents`;
let env;
// As regras só aceitam o horário do momento da gravação: os dados de teste
// partem do relógio real. A estadia aberta começou há exatamente uma hora.
const agora = Math.floor(Date.now() / 1000);
const entrada = agora - 3600;
const estacionamento = { ownerUid: 'operador-a', nome: 'Patio A', numVagas: 4, tarifaHora: 8.5 };
const vitrine = { nome: 'Patio A', numVagas: 4, tarifaHora: 8.5,
  cep: '00000000', logradouro: 'Rua A', numero: '1', bairro: 'Centro', cidade: 'Teste', uf: 'SP' };
const livre = { ativo: true, vagaAtual: 0, horaEntrada: 0, saldo: 100,
  estacionamentoId: '', tarifaHoraEntrada: 0, ownerUid: 'motorista-a', ownerNome: 'Ana', atualizadoEm: Timestamp.now() };
const aberta = { ...livre, vagaAtual: 1, horaEntrada: entrada, estacionamentoId: 'EST-A', tarifaHoraEntrada: 8.5 };
const saida = { vagaAtual: 0, horaEntrada: 0, estacionamentoId: '', tarifaHoraEntrada: 0, saldo: 91.5 };
const recibo = { placa: 'ABC1D23', vaga: 1, entrada, saida: entrada + 3600,
  duracaoMinutos: 60, valorCobrado: 8.5, valorPendente: 0, tarifaHora: 8.5, estacionamentoId: 'EST-A' };
const disponibilidade = { ultimaAtualizacao: entrada, vagasLivres: 3, vagasEmOperacao: 4 };
const vagaLogica = placa => ({ placa, ocupada: placa !== '', origemOcupacao: 'registro' });
const db = uid => env.authenticatedContext(uid).firestore();
const ref = (uid, path) => doc(db(uid), path);

// Casos compartilhados com o site e o totem (contratos/ na raiz do
// repositório): CSV simples, com cabeçalho e comentários em "#".
async function lerCsv(nome) {
  const linhas = (await readFile(new URL(`../../contratos/${nome}`, import.meta.url), 'utf8'))
    .split(/\r?\n/).map(linha => linha.trim()).filter(linha => linha && !linha.startsWith('#'));
  const [cabecalho, ...dados] = linhas;
  const campos = cabecalho.split(',');
  return dados.map(linha => ({ linha, ...Object.fromEntries(linha.split(',').map((v, i) => [campos[i], v])) }));
}
const casosDeCobranca = await lerCsv('cobranca.csv');
const tiposDasVagas = await lerCsv('vagas-especiais.csv');

before(async () => {
  env = await initializeTestEnvironment({ projectId, firestore: {
    host: host.split(':')[0], port: 8180,
    rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8')
  } });
});
after(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    const batch = writeBatch(context.firestore());
    for (const [path, data] of Object.entries({
      'estacionamentos/EST-A': estacionamento,
      'estacionamentos/EST-B': { ...estacionamento, ownerUid: 'operador-b' },
      'catalogoEstacionamentos/EST-A': vitrine,
      'catalogoEstacionamentos/EST-B': vitrine,
      'totems/totem-a': { estacionamentoId: 'EST-A', ativo: true },
      'totems/totem-b': { estacionamentoId: 'EST-B', ativo: true },
      'totems/totem-revogado': { estacionamentoId: 'EST-A', ativo: false },
      'users/operador-a': { role: 'operador' },
      'users/motorista-a': { role: 'motorista', placa: 'ABC1D23' },
      'users/motorista-b': { role: 'motorista', placa: 'XYZ1234' },
      'users/admin': { role: 'admin' },
      'veiculos/ABC1D23': aberta,
      'veiculos/XYZ1234': { ...livre, ownerUid: 'motorista-b' },
      'estacionamentos/EST-A/vagas/1': { ocupada: true, placa: 'ABC1D23' },
      'estacionamentos/EST-A/vagas/2': { ocupada: false, placa: '' },
      // Mapa público (sem placa): ocupação espelhada pelo totem e tipo da vaga.
      'catalogoEstacionamentos/EST-A/vagas/1': { ocupada: true, tipo: 'comum' },
      'catalogoEstacionamentos/EST-A/vagas/2': { ocupada: false, tipo: 'comum' },
      'catalogoEstacionamentos/EST-A/vagas/3': { ocupada: false, tipo: 'pcd' }
    })) batch.set(doc(context.firestore(), path), data);
    await batch.commit();
  });
});

test('sem autenticação: não lê ou escreve dados', async () => {
  const d = env.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(d, 'catalogoEstacionamentos/EST-A')));
  await assertFails(updateDoc(doc(d, 'estacionamentos/EST-A/vagas/1'), { ocupada: false }));
});
test('isolamento: motorista só lê o próprio veículo', async () => {
  await assertSucceeds(getDoc(ref('motorista-a', 'veiculos/ABC1D23')));
  await assertFails(getDoc(ref('motorista-b', 'veiculos/ABC1D23')));
  await assertFails(getDoc(ref('motorista-a', 'estacionamentos/EST-A')));
  await assertSucceeds(getDoc(ref('motorista-a', 'catalogoEstacionamentos/EST-A')));
});
test('isolamento: operador e totem não acessam outro pátio', async () => {
  await assertSucceeds(getDoc(ref('operador-a', 'estacionamentos/EST-A')));
  await assertFails(getDoc(ref('operador-b', 'estacionamentos/EST-A')));
  await assertFails(getDoc(ref('totem-b', 'estacionamentos/EST-A/vagas/1')));
  await assertFails(updateDoc(ref('totem-b', 'veiculos/ABC1D23'), saida));
});
test('totem revogado não consulta veículo nem altera vaga', async () => {
  await assertFails(getDoc(ref('totem-revogado', 'veiculos/ABC1D23')));
  await assertFails(updateDoc(ref('totem-revogado', 'estacionamentos/EST-A/vagas/1'), { ocupada: false }));
});
test('heartbeat operacional e público permitido somente ao próprio totem', async () => {
  await assertSucceeds(updateDoc(ref('totem-a', 'estacionamentos/EST-A'), {
    ...disponibilidade, modoTotem: 'atendimento', tarifaAplicadaTotem: 8.5
  }));
  await assertSucceeds(updateDoc(ref('totem-a', 'catalogoEstacionamentos/EST-A'), disponibilidade));
  await assertFails(updateDoc(ref('totem-b', 'catalogoEstacionamentos/EST-A'), disponibilidade));
  await assertFails(updateDoc(ref('motorista-a', 'catalogoEstacionamentos/EST-A'), disponibilidade));
});
test('catálogo: totem não muda preço, dono, endereço ou cria documento', async () => {
  for (const extra of [{ tarifaHora: 0 }, { nome: 'Alterado' }, { cidade: 'Outra' }, { ownerUid: 'totem-a' }]) {
    await assertFails(updateDoc(ref('totem-a', 'catalogoEstacionamentos/EST-A'), { ...disponibilidade, ...extra }));
  }
  await assertFails(setDoc(ref('totem-a', 'catalogoEstacionamentos/NOVO'), vitrine));
  await assertSucceeds(updateDoc(ref('operador-a', 'catalogoEstacionamentos/EST-A'), { tarifaHora: 10 }));
});
test('heartbeat rejeita contagem impossível, fracionária e timestamp inválido', async () => {
  for (const invalido of [{ vagasLivres: -1 }, { vagasLivres: 5 }, { vagasLivres: 1.5 },
    { vagasEmOperacao: 0 }, { vagasEmOperacao: 5 }, { ultimaAtualizacao: 'hoje' }]) {
    await assertFails(updateDoc(ref('totem-a', 'catalogoEstacionamentos/EST-A'), { ...disponibilidade, ...invalido }));
  }
});
test('totem não simula sensores nem altera ocupação sem uma estadia', async () => {
  await assertFails(updateDoc(ref('totem-a', 'estacionamentos/EST-A/vagas/1'), { ocupada: true, leituraValida: false }));
  await assertFails(updateDoc(ref('totem-a', 'estacionamentos/EST-A/vagas/1'), vagaLogica('')));
  await assertFails(updateDoc(ref('totem-a', 'estacionamentos/EST-A/vagas/2'), vagaLogica('XYZ1234')));
  await assertFails(updateDoc(ref('totem-a', 'estacionamentos/EST-A/vagas/1'), { ocupada: null }));
  await assertFails(updateDoc(ref('totem-a', 'estacionamentos/EST-A/vagas/1'), { leituraValida: 'sim' }));
  await assertFails(updateDoc(ref('totem-a', 'estacionamentos/EST-A/vagas/1'), { senha: 'proibido' }));
  await assertFails(setDoc(ref('totem-a', 'estacionamentos/EST-A/vagas/5'), { ocupada: false }));
});
test('entrada atômica associa veículo e vaga sem mudar saldo/dono', async () => {
  const d = db('totem-a'), batch = writeBatch(d);
  batch.update(doc(d, 'veiculos/XYZ1234'), { vagaAtual: 2, horaEntrada: agora, estacionamentoId: 'EST-A', tarifaHoraEntrada: 8.5 });
  batch.update(doc(d, 'estacionamentos/EST-A/vagas/2'), vagaLogica('XYZ1234'));
  await assertSucceeds(batch.commit());
  const v = (await getDoc(doc(d, 'veiculos/XYZ1234'))).data();
  assert.equal(v.saldo, 100);
  assert.equal(v.ownerUid, 'motorista-b');
  assert.deepEqual((await getDoc(doc(d, 'estacionamentos/EST-A/vagas/2'))).data(), vagaLogica('XYZ1234'));
});
test('entrada rejeita vaga fora da faixa e estadia já aberta', async () => {
  await assertFails(updateDoc(ref('totem-a', 'veiculos/XYZ1234'), { vagaAtual: 5, horaEntrada: agora, estacionamentoId: 'EST-A', tarifaHoraEntrada: 8.5 }));
  await assertFails(updateDoc(ref('totem-a', 'veiculos/ABC1D23'), { vagaAtual: 2, horaEntrada: entrada + 5 }));
});
test('entrada rejeita veículo inativo', async () => {
  await env.withSecurityRulesDisabled(c => updateDoc(doc(c.firestore(), 'veiculos/XYZ1234'), { ativo: false }));
  await assertFails(updateDoc(ref('totem-a', 'veiculos/XYZ1234'), { vagaAtual: 2, horaEntrada: agora, estacionamentoId: 'EST-A', tarifaHoraEntrada: 8.5 }));
});
test('cadastro acadêmico no totem continua compatível com reivindicação pelo motorista', async () => {
  const dados = { ...livre, saldo: 0, cadastradoNoTotem: true };
  delete dados.ownerUid; delete dados.ownerNome; delete dados.atualizadoEm;
  // A carteira nasce vazia também no totem.
  await assertFails(setDoc(ref('totem-a', 'veiculos/NEW1234'), { ...dados, saldo: 100 }));
  await assertSucceeds(setDoc(ref('totem-a', 'veiculos/NEW1234'), dados));
  await assertSucceeds(updateDoc(ref('motorista-a', 'veiculos/NEW1234'), { ownerUid: 'motorista-a', ownerNome: 'Ana', atualizadoEm: Timestamp.now() }));
  await assertFails(updateDoc(ref('motorista-b', 'veiculos/NEW1234'), { ownerUid: 'motorista-b', ownerNome: 'B', atualizadoEm: Timestamp.now() }));
});
test('painel cadastra veículo sem o nome do dono e a recarga apaga o nome legado', async () => {
  const novo = { ativo: true, vagaAtual: 0, horaEntrada: 0, saldo: 0, estacionamentoId: '',
    tarifaHoraEntrada: 0, ownerUid: 'motorista-a', atualizadoEm: Timestamp.now() };
  // Saldo inicial só por recarga: o painel não cria carteira já com crédito.
  for (const saldo of [10, 0.01, -5, '0']) {
    await assertFails(setDoc(ref('motorista-a', 'veiculos/NEW1234'), { ...novo, saldo }));
  }
  await assertSucceeds(setDoc(ref('motorista-a', 'veiculos/NEW1234'), novo));
  await assertSucceeds(loteRecarga('motorista-a', { valor: 10 }).commit());
  assert.ok(!('ownerNome' in (await getDoc(ref('motorista-a', 'veiculos/ABC1D23'))).data()));
});

// ---------------------------------------------------------------------------
// Recarga simulada: o saldo só sobe junto com o registro do extrato
// (veiculos/{placa}/recargas/{id}), criado no mesmo lote e com o mesmo valor.
// ---------------------------------------------------------------------------
let recargasCriadas = 0;
function loteRecarga(uid, { placa = 'ABC1D23', valor = 50, forma = 'pix', id = `recarga-${++recargasCriadas}`,
  credito = valor, ultimaRecarga = id, registro = {}, comRegistro = true, comCredito = true } = {}) {
  const d = db(uid);
  const batch = writeBatch(d);
  if (comRegistro) {
    batch.set(doc(d, `veiculos/${placa}/recargas/${id}`),
      { valor, forma, uid, criadaEm: serverTimestamp(), ...registro });
  }
  if (comCredito) {
    batch.update(doc(d, `veiculos/${placa}`), { saldo: increment(credito), ultimaRecarga,
      ownerNome: deleteField(), atualizadoEm: serverTimestamp() });
  }
  return batch;
}
async function saldoDe(placa) {
  let saldo;
  await env.withSecurityRulesDisabled(async c => {
    saldo = (await getDoc(doc(c.firestore(), `veiculos/${placa}`))).data().saldo;
  });
  return saldo;
}

test('recarga simulada: crédito e registro do extrato no mesmo lote', async () => {
  await assertSucceeds(loteRecarga('motorista-a', { valor: 50, id: 'r1' }).commit());
  await assertSucceeds(loteRecarga('motorista-a', { valor: 0.01, forma: 'cartao', id: 'r2' }).commit());
  await assertSucceeds(loteRecarga('motorista-a', { valor: 1000, id: 'r3' }).commit());
  assert.ok(Math.abs(await saldoDe('ABC1D23') - 1150.01) < 1e-9);
  const registro = (await getDoc(ref('motorista-a', 'veiculos/ABC1D23/recargas/r2'))).data();
  assert.equal(registro.valor, 0.01);
  assert.equal(registro.forma, 'cartao');
  assert.ok(registro.criadaEm instanceof Timestamp);
  assert.equal((await getDoc(ref('motorista-a', 'veiculos/ABC1D23'))).data().ultimaRecarga, 'r3');
});
test('recarga simulada: dono não grava saldo direto, nem crédito sem registro', async () => {
  const veiculo = ref('motorista-a', 'veiculos/ABC1D23');
  for (const alteracao of [
    { saldo: increment(50) }, { saldo: 1000000 }, { saldo: 'abc' }, { saldo: -500 },
    { saldo: increment(50), ultimaRecarga: 'inexistente' }
  ]) await assertFails(updateDoc(veiculo, { ...alteracao, atualizadoEm: Timestamp.now() }));
  // Pendência não some sem recarga.
  await env.withSecurityRulesDisabled(c => updateDoc(doc(c.firestore(), 'veiculos/XYZ1234'), { saldo: -6.3 }));
  await assertFails(updateDoc(ref('motorista-b', 'veiculos/XYZ1234'), { saldo: 0, atualizadoEm: Timestamp.now() }));
  await assertFails(loteRecarga('motorista-a', { comRegistro: false }).commit());
  await assertFails(loteRecarga('motorista-a', { comCredito: false }).commit());
  assert.equal(await saldoDe('ABC1D23'), 100);
  assert.equal(await saldoDe('XYZ1234'), -6.3);
});
test('recarga simulada: valor, forma e registro conferidos pelas regras', async () => {
  for (const valor of [0, -1, 1000.01, 10.555, 0.001, '10', null]) {
    await assertFails(loteRecarga('motorista-a', { valor, credito: Number(valor) || 0 }).commit());
  }
  await assertFails(loteRecarga('motorista-a', { valor: 10, credito: 50 }).commit());
  await assertFails(loteRecarga('motorista-a', { valor: 50, credito: 10 }).commit());
  await assertFails(loteRecarga('motorista-a', { forma: 'boleto' }).commit());
  await assertFails(loteRecarga('motorista-a', { registro: { aprovada: true } }).commit());
  await assertFails(loteRecarga('motorista-a', { registro: { uid: 'motorista-b' } }).commit());
  await assertFails(loteRecarga('motorista-a', { registro: { criadaEm: Timestamp.fromMillis(Date.now() - 86400000) } }).commit());
  // O registro precisa ser o que o veículo aponta como última recarga.
  await assertFails(loteRecarga('motorista-a', { ultimaRecarga: 'outra' }).commit());
  // Um registro não cobre dois créditos no mesmo lote.
  const d = db('motorista-a');
  const dupla = writeBatch(d);
  dupla.set(doc(d, 'veiculos/ABC1D23/recargas/dupla'),
    { valor: 50, forma: 'pix', uid: 'motorista-a', criadaEm: serverTimestamp() });
  dupla.update(doc(d, 'veiculos/ABC1D23'), { saldo: increment(50), ultimaRecarga: 'dupla', atualizadoEm: serverTimestamp() });
  dupla.update(doc(d, 'veiculos/ABC1D23'), { saldo: increment(50), atualizadoEm: serverTimestamp() });
  await assertFails(dupla.commit());
  assert.equal(await saldoDe('ABC1D23'), 100);
});
test('recarga simulada: cada registro credita uma vez e ninguém o altera', async () => {
  await assertSucceeds(loteRecarga('motorista-a', { valor: 20, id: 'unica' }).commit());
  // Repetir o crédito apontando para um registro que já existe.
  await assertFails(loteRecarga('motorista-a', { valor: 20, id: 'unica', comRegistro: false }).commit());
  await assertFails(loteRecarga('motorista-a', { valor: 20, id: 'unica' }).commit());
  const registro = ref('motorista-a', 'veiculos/ABC1D23/recargas/unica');
  await assertFails(updateDoc(registro, { valor: 1000 }));
  await assertFails(deleteDoc(registro));
  assert.equal(await saldoDe('ABC1D23'), 120);
});
test('recarga simulada: só o dono recarrega e só quem recarregou lê o extrato', async () => {
  await assertFails(loteRecarga('motorista-b', { placa: 'ABC1D23' }).commit());
  await assertFails(loteRecarga('motorista-b', { placa: 'ABC1D23', registro: { uid: 'motorista-a' } }).commit());
  await assertSucceeds(loteRecarga('motorista-a', { valor: 30, id: 'da-ana' }).commit());
  await assertSucceeds(loteRecarga('motorista-b', { placa: 'XYZ1234', valor: 15, id: 'do-bruno' }).commit());
  const extrato = uid => getDocs(query(collection(db(uid), 'veiculos/ABC1D23/recargas'), where('uid', '==', uid)));
  assert.deepEqual((await assertSucceeds(extrato('motorista-a'))).docs.map(item => item.id), ['da-ana']);
  await assertFails(getDocs(collection(db('motorista-a'), 'veiculos/ABC1D23/recargas')));
  await assertFails(getDoc(ref('motorista-b', 'veiculos/ABC1D23/recargas/da-ana')));
  await assertFails(getDoc(ref('totem-a', 'veiculos/ABC1D23/recargas/da-ana')));
  await assertFails(getDoc(ref('operador-a', 'veiculos/ABC1D23/recargas/da-ana')));
  // Placa do totem ainda sem dono não recebe recarga.
  await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), 'veiculos/NEW1234'),
    { ativo: true, vagaAtual: 0, horaEntrada: 0, saldo: 0, estacionamentoId: '', cadastradoNoTotem: true }));
  await assertFails(loteRecarga('motorista-a', { placa: 'NEW1234' }).commit());
});
test('recarga simulada: totem continua registrando entrada e saída depois dela', async () => {
  await assertSucceeds(loteRecarga('motorista-a', { valor: 50 }).commit());
  await assertSucceeds(loteSaida(db('totem-a'), recibo, { ...saida, saldo: 141.5 }).commit());
  await assertSucceeds(loteRecarga('motorista-b', { placa: 'XYZ1234', valor: 10 }).commit());
  await assertSucceeds(loteEntrada(db('totem-a')).commit());
  assert.equal(await saldoDe('ABC1D23'), 141.5);
  assert.equal(await saldoDe('XYZ1234'), 110);
});

function loteSaida(d, dadosRecibo = recibo, dadosVeiculo = saida) {
  const batch = writeBatch(d);
  batch.update(doc(d, 'veiculos/ABC1D23'), dadosVeiculo);
  batch.update(doc(d, 'estacionamentos/EST-A/vagas/1'), { ...vagaLogica(''), leituraValida: deleteField() });
  batch.set(doc(d, `historico/ABC1D23_${entrada}`), dadosRecibo);
  return batch;
}

function loteEntrada(d, vaga = 2, dadosVaga = vagaLogica('XYZ1234'), tarifa = 8.5, horaEntrada = agora) {
  const batch = writeBatch(d);
  batch.update(doc(d, 'veiculos/XYZ1234'), {
    vagaAtual: vaga, horaEntrada, estacionamentoId: 'EST-A', tarifaHoraEntrada: tarifa
  });
  batch.set(doc(d, `estacionamentos/EST-A/vagas/${vaga}`), dadosVaga);
  return batch;
}

test('entrada exige vaga no mesmo lote e não aceita ocupação falsa ou placa trocada', async () => {
  await assertFails(updateDoc(ref('totem-a', 'veiculos/XYZ1234'), {
    vagaAtual: 2, horaEntrada: agora, estacionamentoId: 'EST-A', tarifaHoraEntrada: 8.5
  }));
  for (const dados of [vagaLogica('ABC1D23'), { ...vagaLogica('XYZ1234'), ocupada: false },
    { ...vagaLogica('XYZ1234'), origemOcupacao: 'sensor' }, { ...vagaLogica('XYZ1234'), leituraValida: true }]) {
    await assertFails(loteEntrada(db('totem-a'), 2, dados).commit());
  }
  assert.equal((await getDoc(ref('totem-a', 'veiculos/XYZ1234'))).data().vagaAtual, 0);
});

test('entrada não sobrescreve vaga ocupada nem aceita tarifa diferente do pátio', async () => {
  await assertFails(loteEntrada(db('totem-a'), 1).commit());
  await assertFails(loteEntrada(db('totem-a'), 2, vagaLogica('XYZ1234'), 0).commit());
  await assertFails(loteEntrada(db('totem-a'), 2, vagaLogica('XYZ1234'), 10001).commit());
});

test('entrada e saída só aceitam o horário do momento da gravação', async () => {
  // Retroativa ou futura, a estadia inflaria a cobrança de outra conta.
  for (const horaEntrada of [1, agora - 3600, agora + 3600]) {
    await assertFails(loteEntrada(db('totem-a'), 2, vagaLogica('XYZ1234'), 8.5, horaEntrada).commit());
  }
  await assertSucceeds(loteEntrada(db('totem-a')).commit());
  // Saída uma hora no futuro: duração, valor e saldo coerentes entre si.
  await assertFails(loteSaida(db('totem-a'),
    { ...recibo, saida: agora + 3600, duracaoMinutos: 120, valorCobrado: 17 }, { ...saida, saldo: 83 }).commit());
  assert.equal((await getDoc(ref('motorista-a', 'veiculos/ABC1D23'))).data().saldo, 100);
});

test('dono não apaga vaga ocupada, só vaga livre do próprio pátio', async () => {
  await assertFails(deleteDoc(ref('operador-a', 'estacionamentos/EST-A/vagas/1')));
  await assertFails(deleteDoc(ref('operador-b', 'estacionamentos/EST-A/vagas/2')));
  await assertSucceeds(deleteDoc(ref('operador-a', 'estacionamentos/EST-A/vagas/2')));
});

test('capacidade lógica permite a vaga 200, sem depender de quatro sensores', async () => {
  await env.withSecurityRulesDisabled(c => updateDoc(doc(c.firestore(), 'estacionamentos/EST-A'), { numVagas: 200 }));
  await assertFails(loteEntrada(db('totem-a'), 201).commit());
  await assertSucceeds(loteEntrada(db('totem-a'), 200).commit());
  assert.deepEqual((await getDoc(ref('totem-a', 'estacionamentos/EST-A/vagas/200'))).data(), vagaLogica('XYZ1234'));
});

test('reduzir capacidade não impede saída de uma estadia anterior', async () => {
  await env.withSecurityRulesDisabled(async c => {
    const batch = writeBatch(c.firestore());
    batch.update(doc(c.firestore(), 'veiculos/ABC1D23'), { vagaAtual: 5 });
    batch.set(doc(c.firestore(), 'estacionamentos/EST-A/vagas/5'), vagaLogica('ABC1D23'));
    await batch.commit();
  });
  const d = db('totem-a'), batch = writeBatch(d);
  batch.update(doc(d, 'veiculos/ABC1D23'), saida);
  batch.update(doc(d, 'estacionamentos/EST-A/vagas/5'), vagaLogica(''));
  batch.set(doc(d, `historico/ABC1D23_${entrada}`), { ...recibo, vaga: 5 });
  await assertSucceeds(batch.commit());
});

test('saída converte vaga legada sem manter uma falsa leitura de sensor', async () => {
  await env.withSecurityRulesDisabled(c => updateDoc(doc(c.firestore(), 'estacionamentos/EST-A/vagas/1'), { leituraValida: false }));
  await assertSucceeds(loteSaida(db('totem-a')).commit());
  assert.deepEqual((await getDoc(ref('totem-a', 'estacionamentos/EST-A/vagas/1'))).data(), vagaLogica(''));
});

test('heartbeat remove limite físico legado e aceita capacidade lógica', async () => {
  await env.withSecurityRulesDisabled(c => updateDoc(doc(c.firestore(), 'estacionamentos/EST-A'), { numVagas: 200, vagasSuportadasTotem: 4 }));
  const dados = { ...disponibilidade, vagasEmOperacao: 200, vagasLivres: 199, modoTotem: 'atendimento', tarifaAplicadaTotem: 8.5 };
  await assertFails(updateDoc(ref('totem-a', 'estacionamentos/EST-A'), dados));
  await assertSucceeds(updateDoc(ref('totem-a', 'estacionamentos/EST-A'), { ...dados, vagasSuportadasTotem: deleteField() }));
});
test('saída: débito, vaga e recibo confirmados juntos com tarifa congelada', async () => {
  await assertSucceeds(updateDoc(ref('operador-a', 'estacionamentos/EST-A'), { tarifaHora: 20 }));
  const d = db('totem-a');
  await assertSucceeds(loteSaida(d).commit());
  assert.equal((await getDoc(doc(d, 'veiculos/ABC1D23'))).data().saldo, 91.5);
  assert.equal((await getDoc(ref('motorista-a', `historico/ABC1D23_${entrada}`))).data().tarifaHora, 8.5);
  assert.deepEqual((await getDoc(doc(d, 'estacionamentos/EST-A/vagas/1'))).data(), vagaLogica(''));
});
test('recibo inválido cancela débito e liberação da vaga', async () => {
  const d = db('totem-a');
  await assertFails(loteSaida(d, { ...recibo, valorCobrado: -1 }).commit());
  assert.deepEqual((await getDoc(doc(d, 'veiculos/ABC1D23'))).data(), aberta);
  assert.equal((await getDoc(doc(d, 'estacionamentos/EST-A/vagas/1'))).data().placa, 'ABC1D23');
});
test('servidor rejeita débito sem recibo e recibo sem saída', async () => {
  await assertFails(updateDoc(ref('totem-a', 'veiculos/ABC1D23'), saida));
  await assertFails(setDoc(ref('totem-a', `historico/ABC1D23_${entrada}`), recibo));
});
test('servidor rejeita tarifa, valor, duração e ID adulterados', async () => {
  for (const alteracao of [{ tarifaHora: 9 }, { valorCobrado: 9 }, { duracaoMinutos: 65 }, { entrada: entrada - 1 },
    { valorPendente: 1 }, { valorPendente: -1 }]) {
    await assertFails(loteSaida(db('totem-a'), { ...recibo, ...alteracao }).commit());
  }
  assert.equal((await getDoc(ref('motorista-a', 'veiculos/ABC1D23'))).data().saldo, 100);
});
test('saída sem saldo suficiente registra a pendência exata desta estadia', async () => {
  await env.withSecurityRulesDisabled(c => updateDoc(doc(c.firestore(), 'veiculos/ABC1D23'), { saldo: 5 }));
  const lote = valorPendente => loteSaida(db('totem-a'), { ...recibo, valorPendente }, { ...saida, saldo: -3.5 });
  for (const errado of [0, 1, 8.5]) await assertFails(lote(errado).commit());
  await assertSucceeds(lote(3.5).commit());
  assert.equal((await getDoc(ref('motorista-a', 'veiculos/ABC1D23'))).data().saldo, -3.5);
  assert.equal((await getDoc(ref('operador-a', `historico/ABC1D23_${entrada}`))).data().valorPendente, 3.5);
});
test('dívida anterior não entra na pendência da estadia atual', async () => {
  await env.withSecurityRulesDisabled(c => updateDoc(doc(c.firestore(), 'veiculos/ABC1D23'), { saldo: -2 }));
  const lote = valorPendente => loteSaida(db('totem-a'), { ...recibo, valorPendente }, { ...saida, saldo: -10.5 });
  await assertFails(lote(10.5).commit());
  await assertSucceeds(lote(8.5).commit());
});
test('pendência bloqueia nova entrada até a recarga do motorista', async () => {
  await env.withSecurityRulesDisabled(c => updateDoc(doc(c.firestore(), 'veiculos/XYZ1234'), { saldo: -3.504 }));
  await assertFails(loteEntrada(db('totem-a')).commit());
  await assertSucceeds(loteRecarga('motorista-b', { placa: 'XYZ1234', valor: 3.5 }).commit());
  // Resíduo abaixo de meio centavo não é pendência.
  await assertSucceeds(loteEntrada(db('totem-a')).commit());
});

test('recibo imutável: repetição da saída não debita outra vez', async () => {
  const d = db('totem-a');
  await assertSucceeds(loteSaida(d).commit());
  await assertFails(loteSaida(d).commit());
  assert.equal((await getDoc(doc(d, 'veiculos/ABC1D23'))).data().saldo, 91.5);
  await assertFails(getDoc(ref('motorista-b', `historico/ABC1D23_${entrada}`)));
});

// A mesma conta do site e do totem (contratos/cobranca.csv): para cada caso,
// as regras aceitam o valor e a pendência esperados e recusam um centavo a
// mais ou a menos, com o débito do saldo coerente com o valor tentado.
function pendenteDaEstadia(saldo, valor) {
  const saldoFinal = saldo - valor;
  return saldoFinal >= 0 ? 0 : saldoFinal + valor <= 0 ? valor : -saldoFinal;
}
for (const caso of casosDeCobranca) {
  test(`contrato da saída ${caso.linha}: só o centavo do site e do totem`, async () => {
    const segundos = Number(caso.segundos), tarifa = Number(caso.tarifa), saldo = Number(caso.saldo);
    const valor = Number(caso.valor), pendente = Number(caso.pendente);
    const horaSaida = Math.floor(Date.now() / 1000), horaEntrada = horaSaida - segundos;
    await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), 'veiculos/ABC1D23'),
      { ...aberta, horaEntrada, tarifaHoraEntrada: tarifa, saldo }));
    const sair = (valorCobrado, valorPendente = pendenteDaEstadia(saldo, valorCobrado)) => {
      const d = db('totem-a'), batch = writeBatch(d);
      batch.update(doc(d, 'veiculos/ABC1D23'), { ...saida, saldo: saldo - valorCobrado });
      batch.update(doc(d, 'estacionamentos/EST-A/vagas/1'), vagaLogica(''));
      batch.set(doc(d, `historico/ABC1D23_${horaEntrada}`), { ...recibo, entrada: horaEntrada, saida: horaSaida,
        duracaoMinutos: Math.floor(segundos / 60), valorCobrado, valorPendente, tarifaHora: tarifa });
      return batch.commit();
    };
    await assertFails(sair(valor + 0.01));
    if (valor >= 0.01) await assertFails(sair(valor - 0.01));
    await assertFails(sair(valor, pendente + 0.01));
    await assertSucceeds(sair(valor, pendente));
    const depois = (await getDoc(ref('motorista-a', 'veiculos/ABC1D23'))).data();
    assert.ok(Math.abs(depois.saldo - Number(caso.saldo_final)) < 1e-9, `saldo ${depois.saldo}`);
  });
}

async function rest(path, body, uid = 'totem-a', method = body ? 'POST' : 'GET') {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { Authorization: `Bearer ${createMockUserToken({ sub: uid }, projectId)}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  return { status: response.status, data: await response.json() };
}
function campos(dados) {
  return Object.fromEntries(Object.entries(dados).map(([k, v]) => [k,
    typeof v === 'string' ? { stringValue: v } : typeof v === 'boolean' ? { booleanValue: v }
      : Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }]));
}
function escrita(path, dados, currentDocument) {
  return { update: { name: `projects/${projectId}/databases/(default)/documents/${path}`, fields: campos(dados) },
    updateMask: { fieldPaths: Object.keys(dados) }, currentDocument };
}
test('REST do ESP: cadastro no totem com saldo zero em double, como o firmware grava', async () => {
  const criar = (placa, saldo) => rest(`/veiculos?documentId=${placa}`, { fields: {
    ativo: { booleanValue: true }, vagaAtual: { integerValue: '0' }, horaEntrada: { integerValue: '0' },
    saldo: { doubleValue: saldo }, estacionamentoId: { stringValue: '' },
    tarifaHoraEntrada: { doubleValue: 0 }, cadastradoNoTotem: { booleanValue: true } } });
  assert.equal((await criar('NEW1234', 0)).status, 200);
  assert.equal((await criar('NEW5678', 5)).status, 403);
});
test('REST do ESP: versão antiga não sobrescreve recarga concorrente', async () => {
  const original = await rest('/veiculos/ABC1D23');
  assert.equal(original.status, 200);
  await loteRecarga('motorista-a', { valor: 50 }).commit();
  const resultado = await rest(':commit', { writes: [
    escrita('veiculos/ABC1D23', saida, { updateTime: original.data.updateTime }),
    escrita('estacionamentos/EST-A/vagas/1', vagaLogica(''), { exists: true }),
    escrita(`historico/ABC1D23_${entrada}`, recibo, { exists: false })
  ] });
  // A validação do saldo pode rejeitar antes da precondição de versão.
  assert.ok(['PERMISSION_DENIED', 'FAILED_PRECONDITION'].includes(resultado.data.error?.status), JSON.stringify(resultado));
  // Mesmo com o novo saldo correto, uma leitura antiga continua proibida.
  const revisaoAntiga = await rest(':commit', { writes: [
    escrita('veiculos/ABC1D23', { ...saida, saldo: 141.5 }, { updateTime: original.data.updateTime }),
    escrita('estacionamentos/EST-A/vagas/1', vagaLogica(''), { exists: true }),
    escrita(`historico/ABC1D23_${entrada}`, recibo, { exists: false })
  ] });
  assert.equal(revisaoAntiga.data.error?.status, 'FAILED_PRECONDITION', JSON.stringify(revisaoAntiga));
  assert.equal((await getDoc(ref('motorista-a', 'veiculos/ABC1D23'))).data().saldo, 150);
  assert.equal((await getDoc(ref('totem-a', 'estacionamentos/EST-A/vagas/1'))).data().placa, 'ABC1D23');
  assert.equal((await rest(`/historico/ABC1D23_${entrada}`, undefined, 'motorista-a')).status, 403);
});
// ---------------------------------------------------------------------------
// Reserva pelo app: gratuita, 30 min; o totem usa a vaga reservada na entrada.
// ---------------------------------------------------------------------------
function loteReserva(d, uid, { placa = 'XYZ1234', vaga = 2, criadaEm = agora, marcarVaga = true } = {}) {
  const batch = writeBatch(d);
  const expiraEm = criadaEm + 1800;
  batch.set(doc(d, `reservas/${uid}`), {
    ownerUid: uid, placa, estacionamentoId: 'EST-A', vaga, criadaEm, expiraEm, status: 'ativa'
  });
  if (marcarVaga) batch.update(doc(d, `catalogoEstacionamentos/EST-A/vagas/${vaga}`), { reservadaAte: expiraEm });
  return { batch, expiraEm };
}

test('motorista reserva vaga livre por 30 minutos sem cobrança', async () => {
  const d = db('motorista-b');
  const { batch, expiraEm } = loteReserva(d, 'motorista-b');
  await assertSucceeds(batch.commit());
  assert.equal((await getDoc(doc(d, 'catalogoEstacionamentos/EST-A/vagas/2'))).data().reservadaAte, expiraEm);
  assert.equal((await getDoc(doc(d, 'veiculos/XYZ1234'))).data().saldo, 100);
});

test('reserva exige vaga livre, placa da própria conta, horário atual e o mapa no mesmo lote', async () => {
  await assertFails(loteReserva(db('motorista-b'), 'motorista-b', { vaga: 1 }).batch.commit());
  await assertFails(loteReserva(db('motorista-b'), 'motorista-b', { marcarVaga: false }).batch.commit());
  await assertFails(updateDoc(ref('motorista-b', 'catalogoEstacionamentos/EST-A/vagas/2'), { reservadaAte: agora + 1800 }));
  await assertFails(loteReserva(db('motorista-b'), 'motorista-b', { criadaEm: agora - 3600 }).batch.commit());
  await assertFails(loteReserva(db('motorista-a'), 'motorista-a', { placa: 'XYZ1234' }).batch.commit());
  await assertFails(loteReserva(db('motorista-a'), 'motorista-b').batch.commit());
  // Carro já estacionado (ABC1D23 tem estadia aberta) não reserva.
  await assertFails(loteReserva(db('motorista-a'), 'motorista-a', { placa: 'ABC1D23' }).batch.commit());
});

test('vaga reservada por outra pessoa só volta a aceitar reserva quando a anterior vence', async () => {
  const vaga2 = c => doc(c.firestore(), 'catalogoEstacionamentos/EST-A/vagas/2');
  await env.withSecurityRulesDisabled(c => updateDoc(vaga2(c), { reservadaAte: agora + 600 }));
  await assertFails(loteReserva(db('motorista-b'), 'motorista-b').batch.commit());
  await env.withSecurityRulesDisabled(c => updateDoc(vaga2(c), { reservadaAte: agora - 1 }));
  await assertSucceeds(loteReserva(db('motorista-b'), 'motorista-b').batch.commit());
});

// Direito a vaga especial autodeclarado pelo dono no próprio veículo.
const declararDireito = (uid, placa, tipo) =>
  updateDoc(ref(uid, `veiculos/${placa}`), { vagaEspecial: tipo, atualizadoEm: Timestamp.now() });

test('pendência bloqueia reserva e cada conta tem uma reserva ativa por vez', async () => {
  const veiculo = c => doc(c.firestore(), 'veiculos/XYZ1234');
  await env.withSecurityRulesDisabled(c => updateDoc(veiculo(c), { saldo: -1 }));
  await assertFails(loteReserva(db('motorista-b'), 'motorista-b').batch.commit());
  await env.withSecurityRulesDisabled(c => updateDoc(veiculo(c), { saldo: 0 }));
  await assertSucceeds(loteReserva(db('motorista-b'), 'motorista-b').batch.commit());
  // Com direito à vaga 3 (PCD), o único impedimento é a reserva já ativa.
  await assertSucceeds(declararDireito('motorista-b', 'XYZ1234', 'pcd'));
  await assertFails(loteReserva(db('motorista-b'), 'motorista-b', { vaga: 3 }).batch.commit());
});

test('direito a vaga especial: só o dono declara, só valores conhecidos', async () => {
  await assertSucceeds(declararDireito('motorista-b', 'XYZ1234', 'pcd'));
  await assertSucceeds(declararDireito('motorista-b', 'XYZ1234', ''));
  await assertFails(declararDireito('motorista-b', 'XYZ1234', 'vip'));
  await assertFails(declararDireito('motorista-a', 'XYZ1234', 'pcd'));
  // O cadastro pelo painel já pode trazer o direito declarado.
  const novo = uid => ({ ativo: true, vagaAtual: 0, horaEntrada: 0, saldo: 0, estacionamentoId: '',
    tarifaHoraEntrada: 0, ownerUid: uid, atualizadoEm: Timestamp.now() });
  await assertSucceeds(setDoc(ref('motorista-c', 'veiculos/NOV1A23'), { ...novo('motorista-c'), vagaEspecial: 'idoso' }));
  await assertFails(setDoc(ref('motorista-d', 'veiculos/NOV1B23'), { ...novo('motorista-d'), vagaEspecial: 'vip' }));
  // A conta guarda o mesmo direito, declarado no cadastro ou no Perfil.
  await assertSucceeds(updateDoc(ref('motorista-b', 'users/motorista-b'), { vagaEspecial: 'gestante' }));
  await assertSucceeds(updateDoc(ref('motorista-b', 'users/motorista-b'), { vagaEspecial: deleteField() }));
  await assertFails(updateDoc(ref('motorista-b', 'users/motorista-b'), { vagaEspecial: 'vip' }));
  await assertSucceeds(setDoc(ref('motorista-e', 'users/motorista-e'), { role: 'motorista', name: 'E', vagaEspecial: 'pcd' }));
  await assertFails(setDoc(ref('motorista-f', 'users/motorista-f'), { role: 'motorista', name: 'F', vagaEspecial: 'vip' }));
});

test('reserva de vaga especial só para quem declarou o mesmo direito', async () => {
  // Vaga 3 é PCD: sem direito, ou com direito de outro tipo, não reserva.
  await assertFails(loteReserva(db('motorista-b'), 'motorista-b', { vaga: 3 }).batch.commit());
  await assertSucceeds(declararDireito('motorista-b', 'XYZ1234', 'idoso'));
  await assertFails(loteReserva(db('motorista-b'), 'motorista-b', { vaga: 3 }).batch.commit());
  await assertSucceeds(declararDireito('motorista-b', 'XYZ1234', 'pcd'));
  await assertSucceeds(loteReserva(db('motorista-b'), 'motorista-b', { vaga: 3 }).batch.commit());
});

test('vaga sem tipo gravado segue a tabela padrão do site e do totem', async () => {
  // Sem "tipo", a vaga 2 é PCD pela tabela padrão (1 e 2 PCD, 9 e 11 60+, 10 gestante).
  await env.withSecurityRulesDisabled(c =>
    setDoc(doc(c.firestore(), 'catalogoEstacionamentos/EST-A/vagas/2'), { ocupada: false }));
  await assertFails(loteReserva(db('motorista-b'), 'motorista-b').batch.commit());
  await assertSucceeds(declararDireito('motorista-b', 'XYZ1234', 'pcd'));
  await assertSucceeds(loteReserva(db('motorista-b'), 'motorista-b').batch.commit());
});

// Tabela das vagas sem "tipo" gravado (contratos/vagas-especiais.csv), a mesma
// do site e do totem. Vaga fora da tabela é comum: a 13 e a 200 conferem isso.
const tipoEsperado = new Map(tiposDasVagas.map(({ vaga, tipo }) => [Number(vaga), tipo]));
for (const vaga of [...tipoEsperado.keys(), 13, 200]) {
  const tipo = tipoEsperado.get(vaga) ?? 'comum';
  test(`contrato da vaga ${vaga} sem tipo gravado: ${tipo}, como no site e no totem`, async () => {
    await env.withSecurityRulesDisabled(async c => {
      const batch = writeBatch(c.firestore());
      batch.update(doc(c.firestore(), 'catalogoEstacionamentos/EST-A'), { numVagas: 200 });
      batch.set(doc(c.firestore(), `catalogoEstacionamentos/EST-A/vagas/${vaga}`), { ocupada: false });
      await batch.commit();
    });
    const reservar = () => loteReserva(db('motorista-b'), 'motorista-b',
      { vaga, criadaEm: Math.floor(Date.now() / 1000) }).batch.commit();
    if (tipo === 'comum') {
      await assertSucceeds(reservar());
      return;
    }
    // Especial: sem direito, ou com direito de outro tipo, não reserva.
    await assertFails(reservar());
    for (const outro of ['pcd', 'idoso', 'gestante'].filter(direito => direito !== tipo)) {
      await assertSucceeds(declararDireito('motorista-b', 'XYZ1234', outro));
      await assertFails(reservar());
    }
    await assertSucceeds(declararDireito('motorista-b', 'XYZ1234', tipo));
    await assertSucceeds(reservar());
  });
}

test('cancelar libera a vaga; ninguém libera a reserva de outra conta', async () => {
  const d = db('motorista-b');
  await assertSucceeds(loteReserva(d, 'motorista-b').batch.commit());
  await assertFails(updateDoc(ref('motorista-a', 'catalogoEstacionamentos/EST-A/vagas/2'), { reservadaAte: 0 }));
  const cancelar = writeBatch(d);
  cancelar.update(doc(d, 'reservas/motorista-b'), { status: 'cancelada' });
  cancelar.update(doc(d, 'catalogoEstacionamentos/EST-A/vagas/2'), { reservadaAte: 0 });
  await assertSucceeds(cancelar.commit());
  assert.equal((await getDoc(doc(d, 'catalogoEstacionamentos/EST-A/vagas/2'))).data().reservadaAte, 0);
});

test('totem honra a reserva: entrada na vaga reservada consome a reserva no mesmo lote', async () => {
  await assertSucceeds(declararDireito('motorista-b', 'XYZ1234', 'pcd'));
  await assertSucceeds(loteReserva(db('motorista-b'), 'motorista-b', { vaga: 3 }).batch.commit());
  const d = db('totem-a');
  const lote = writeBatch(d);
  lote.update(doc(d, 'veiculos/XYZ1234'), { vagaAtual: 3, horaEntrada: agora, estacionamentoId: 'EST-A', tarifaHoraEntrada: 8.5 });
  lote.set(doc(d, 'estacionamentos/EST-A/vagas/3'), vagaLogica('XYZ1234'));
  lote.update(doc(d, 'catalogoEstacionamentos/EST-A/vagas/3'), { ocupada: true, reservadaAte: 0 });
  lote.update(doc(d, 'reservas/motorista-b'), { status: 'utilizada' });
  await assertSucceeds(lote.commit());
  assert.equal((await getDoc(ref('motorista-b', 'reservas/motorista-b'))).data().status, 'utilizada');
  assert.deepEqual((await getDoc(ref('motorista-b', 'catalogoEstacionamentos/EST-A/vagas/3'))).data(),
    { ocupada: true, reservadaAte: 0, tipo: 'pcd' });
});

test('totem: lê só reservas do próprio pátio e não apaga reserva sem ocupar a vaga', async () => {
  await assertSucceeds(declararDireito('motorista-b', 'XYZ1234', 'pcd'));
  await assertSucceeds(loteReserva(db('motorista-b'), 'motorista-b', { vaga: 3 }).batch.commit());
  await assertSucceeds(getDoc(ref('totem-a', 'reservas/motorista-b')));
  await assertFails(getDoc(ref('totem-b', 'reservas/motorista-b')));
  await assertSucceeds(getDoc(ref('totem-a', 'reservas/sem-reserva')));
  await assertFails(updateDoc(ref('totem-a', 'catalogoEstacionamentos/EST-A/vagas/3'), { reservadaAte: 0 }));
  await assertFails(updateDoc(ref('totem-b', 'reservas/motorista-b'), { status: 'utilizada' }));
  // Sem a entrada da placa na vaga reservada, o totem não marca a reserva como usada.
  await assertFails(updateDoc(ref('totem-a', 'reservas/motorista-b'), { status: 'utilizada' }));
});

test('mapa público: motorista lê sem placa e não muda ocupação nem tipo; admin classifica', async () => {
  await assertSucceeds(getDoc(ref('motorista-b', 'catalogoEstacionamentos/EST-A/vagas/1')));
  await assertFails(getDoc(ref('motorista-b', 'estacionamentos/EST-A/vagas/1')));
  await assertFails(updateDoc(ref('motorista-b', 'catalogoEstacionamentos/EST-A/vagas/2'), { ocupada: true }));
  await assertFails(updateDoc(ref('motorista-b', 'catalogoEstacionamentos/EST-A/vagas/2'), { tipo: 'pcd' }));
  await assertSucceeds(updateDoc(ref('admin', 'catalogoEstacionamentos/EST-A/vagas/2'), { tipo: 'idoso' }));
  await assertFails(updateDoc(ref('admin', 'catalogoEstacionamentos/EST-A/vagas/2'), { reservadaAte: agora + 600 }));
  await assertFails(updateDoc(ref('admin', 'estacionamentos/EST-A/vagas/2'), { placa: 'XYZ1234', ocupada: true }));
});

test('cadastro público cria só motorista; admin edita estacionamento de outra conta', async () => {
  await assertFails(setDoc(ref('novo-operador', 'users/novo-operador'), { role: 'operador' }));
  await assertFails(setDoc(ref('novo-admin', 'users/novo-admin'), { role: 'admin' }));
  await assertSucceeds(setDoc(ref('novo-motorista', 'users/novo-motorista'), { role: 'motorista' }));
  await assertSucceeds(updateDoc(ref('admin', 'estacionamentos/EST-B'), { tarifaHora: 9 }));
  await assertFails(updateDoc(ref('operador-a', 'estacionamentos/EST-B'), { tarifaHora: 9 }));
});

test('saída espelha a vaga livre no mapa público', async () => {
  const d = db('totem-a');
  const lote = loteSaida(d);
  lote.update(doc(d, 'catalogoEstacionamentos/EST-A/vagas/1'), { ocupada: false });
  await assertSucceeds(lote.commit());
  assert.equal((await getDoc(doc(d, 'catalogoEstacionamentos/EST-A/vagas/1'))).data().ocupada, false);
  // Espelho falso: vaga com placa não pode aparecer livre.
  await assertFails(updateDoc(ref('totem-a', 'catalogoEstacionamentos/EST-A/vagas/2'), { ocupada: true }));
});

test('REST do ESP: lote com versões atuais e recibo exclusivo funciona', async () => {
  const veiculo = await rest('/veiculos/ABC1D23');
  const vaga = await rest('/estacionamentos/EST-A/vagas/1');
  const resultado = await rest(':commit', { writes: [
    escrita('veiculos/ABC1D23', saida, { updateTime: veiculo.data.updateTime }),
    escrita('estacionamentos/EST-A/vagas/1', vagaLogica(''), { updateTime: vaga.data.updateTime }),
    escrita(`historico/ABC1D23_${entrada}`, recibo, { exists: false })
  ] });
  assert.equal(resultado.status, 200, JSON.stringify(resultado));
});

test('REST do ESP: entrada com reserva, mapa público e precondição exists em texto', async () => {
  await assertSucceeds(loteReserva(db('motorista-b'), 'motorista-b').batch.commit());
  const veiculo = await rest('/veiculos/XYZ1234');
  const vaga = await rest('/estacionamentos/EST-A/vagas/2');
  const reserva = await rest('/reservas/motorista-b');
  assert.equal(reserva.status, 200, JSON.stringify(reserva));
  const resultado = await rest(':commit', { writes: [
    escrita('veiculos/XYZ1234', { vagaAtual: 2, horaEntrada: agora, estacionamentoId: 'EST-A', tarifaHoraEntrada: 8.5 }, { updateTime: veiculo.data.updateTime }),
    escrita('estacionamentos/EST-A/vagas/2', vagaLogica('XYZ1234'), { updateTime: vaga.data.updateTime }),
    escrita('catalogoEstacionamentos/EST-A/vagas/2', { ocupada: true, reservadaAte: 0 }),
    escrita('reservas/motorista-b', { status: 'utilizada' }, { updateTime: reserva.data.updateTime })
  ] });
  assert.equal(resultado.status, 200, JSON.stringify(resultado));
  // Sem reserva, o totem recebe 404 (não 403) e escolhe a vaga sozinho.
  assert.equal((await rest('/reservas/sem-reserva')).status, 404);
});

test('REST do ESP: saída com exists em texto (formato da biblioteca) e mapa público', async () => {
  const veiculo = await rest('/veiculos/ABC1D23');
  const vaga = await rest('/estacionamentos/EST-A/vagas/1');
  const resultado = await rest(':commit', { writes: [
    escrita('veiculos/ABC1D23', saida, { updateTime: veiculo.data.updateTime }),
    escrita('estacionamentos/EST-A/vagas/1', vagaLogica(''), { updateTime: vaga.data.updateTime }),
    escrita(`historico/ABC1D23_${entrada}`, recibo, { exists: 'false' }),
    escrita('catalogoEstacionamentos/EST-A/vagas/1', { ocupada: false })
  ] });
  assert.equal(resultado.status, 200, JSON.stringify(resultado));
});

test('REST do ESP: duas entradas concorrentes não recebem a mesma vaga', async () => {
  await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), 'veiculos/NEW1234'), livre));
  const vaga = await rest('/estacionamentos/EST-A/vagas/2');
  const primeiro = await rest('/veiculos/XYZ1234');
  const segundo = await rest('/veiculos/NEW1234');
  const abrir = (placa, revisao) => rest(':commit', { writes: [
    escrita(`veiculos/${placa}`, { vagaAtual: 2, horaEntrada: agora, estacionamentoId: 'EST-A', tarifaHoraEntrada: 8.5 }, { updateTime: revisao }),
    escrita('estacionamentos/EST-A/vagas/2', vagaLogica(placa), { updateTime: vaga.data.updateTime })
  ] });
  assert.equal((await abrir('XYZ1234', primeiro.data.updateTime)).status, 200);
  const conflito = await abrir('NEW1234', segundo.data.updateTime);
  assert.ok(['FAILED_PRECONDITION', 'PERMISSION_DENIED'].includes(conflito.data.error?.status), JSON.stringify(conflito));
  assert.equal((await getDoc(ref('totem-a', 'veiculos/NEW1234'))).data().vagaAtual, 0);
});

test('REST do ESP: criação atômica de vaga ainda inexistente', async () => {
  const veiculo = await rest('/veiculos/XYZ1234');
  const resultado = await rest(':commit', { writes: [
    escrita('veiculos/XYZ1234', { vagaAtual: 3, horaEntrada: agora, estacionamentoId: 'EST-A', tarifaHoraEntrada: 8.5 }, { updateTime: veiculo.data.updateTime }),
    escrita('estacionamentos/EST-A/vagas/3', vagaLogica('XYZ1234'), { exists: false })
  ] });
  assert.equal(resultado.status, 200, JSON.stringify(resultado));
});

test('REST do ESP: consulta de vagas é paginada e isolada por pátio', async () => {
  await env.withSecurityRulesDisabled(async c => {
    const batch = writeBatch(c.firestore());
    for (let i = 3; i <= 40; i++) batch.set(doc(c.firestore(), `estacionamentos/EST-A/vagas/${i}`), vagaLogica(''));
    await batch.commit();
  });
  const nomes = new Set();
  let token = '', paginas = 0;
  do {
    const page = await rest(`/estacionamentos/EST-A/vagas?pageSize=16&mask.fieldPaths=placa&pageToken=${encodeURIComponent(token)}`);
    assert.equal(page.status, 200, JSON.stringify(page));
    assert.ok(page.data.documents.length <= 16);
    for (const documento of page.data.documents) {
      assert.ok(documento.updateTime);
      assert.deepEqual(Object.keys(documento.fields), ['placa']);
      assert.ok(!nomes.has(documento.name));
      nomes.add(documento.name);
    }
    token = page.data.nextPageToken ?? '';
    assert.ok(++paginas <= 3);
  } while (token);
  assert.equal(nomes.size, 40);
  assert.equal((await rest('/estacionamentos/EST-A/vagas?pageSize=16', undefined, 'totem-b')).status, 403);
});

test('REST do ESP: máscaras do heartbeat removem limite físico e não vazam campos no catálogo', async () => {
  await env.withSecurityRulesDisabled(c => updateDoc(doc(c.firestore(), 'estacionamentos/EST-A'), { vagasSuportadasTotem: 4 }));
  const dados = { ...disponibilidade, tarifaAplicadaTotem: 8.5, modoTotem: 'atendimento' };
  const mascara = [...Object.keys(dados), 'vagasSuportadasTotem'].map(f => `updateMask.fieldPaths=${f}`).join('&');
  const operacional = await rest(`/estacionamentos/EST-A?${mascara}&currentDocument.exists=true`, { fields: campos(dados) }, 'totem-a', 'PATCH');
  assert.equal(operacional.status, 200, JSON.stringify(operacional));
  assert.ok(!operacional.data.fields.vagasSuportadasTotem);
  const publico = await rest('/catalogoEstacionamentos/EST-A?updateMask.fieldPaths=ultimaAtualizacao&updateMask.fieldPaths=vagasLivres&updateMask.fieldPaths=vagasEmOperacao&currentDocument.exists=true', { fields: campos(dados) }, 'totem-a', 'PATCH');
  assert.equal(publico.status, 200, JSON.stringify(publico));
  assert.ok(!publico.data.fields.modoTotem && !publico.data.fields.tarifaAplicadaTotem);
});

test('REST do ESP: updateMask exclui leituraValida na saída', async () => {
  await env.withSecurityRulesDisabled(c => updateDoc(doc(c.firestore(), 'estacionamentos/EST-A/vagas/1'), { leituraValida: false }));
  const veiculo = await rest('/veiculos/ABC1D23');
  const vaga = await rest('/estacionamentos/EST-A/vagas/1');
  const limpar = escrita('estacionamentos/EST-A/vagas/1', vagaLogica(''), { updateTime: vaga.data.updateTime });
  limpar.updateMask.fieldPaths.push('leituraValida');
  const resultado = await rest(':commit', { writes: [
    escrita('veiculos/ABC1D23', saida, { updateTime: veiculo.data.updateTime }), limpar,
    escrita(`historico/ABC1D23_${entrada}`, recibo, { exists: false })
  ] });
  assert.equal(resultado.status, 200, JSON.stringify(resultado));
  assert.deepEqual((await getDoc(ref('totem-a', 'estacionamentos/EST-A/vagas/1'))).data(), vagaLogica(''));
});

// ---------------------------------------------------------------------------
// Modelo e cor: o dono informa no Perfil; o totem mostra e copia para a vaga.
// ---------------------------------------------------------------------------
const descricao = { marca: 'Volkswagen', modelo: 'Gol', cor: 'prata' };
const descrever = (uid, placa, dados) =>
  updateDoc(ref(uid, `veiculos/${placa}`), { ...dados, atualizadoEm: Timestamp.now() });

test('modelo e cor: só o dono informa, só nomes do documento do carro e cores conhecidas', async () => {
  await assertSucceeds(descrever('motorista-b', 'XYZ1234', descricao));
  await assertSucceeds(descrever('motorista-b', 'XYZ1234', { modelo: 'Up!', cor: 'vermelho' }));
  await assertSucceeds(descrever('motorista-b', 'XYZ1234', { modelo: 'T-Cross 200 TSI' }));
  await assertFails(descrever('motorista-a', 'XYZ1234', descricao));
  for (const invalido of [{ cor: 'Prata' }, { cor: 'furta-cor' }, { cor: 3 }, { modelo: '' },
    { modelo: ' Gol' }, { modelo: 'Gol<b>' }, { modelo: 'x'.repeat(21) }, { marca: 'Citroën' }, { marca: true }]) {
    await assertFails(descrever('motorista-b', 'XYZ1234', invalido));
  }
  await assertSucceeds(descrever('motorista-b', 'XYZ1234',
    { marca: deleteField(), modelo: deleteField(), cor: deleteField() }));
  assert.ok(!('modelo' in (await getDoc(ref('motorista-b', 'veiculos/XYZ1234'))).data()));
});

test('modelo e cor no cadastro pelo painel e na reivindicação de placa do totem', async () => {
  const novo = { ativo: true, vagaAtual: 0, horaEntrada: 0, saldo: 0, estacionamentoId: '',
    tarifaHoraEntrada: 0, ownerUid: 'motorista-c', atualizadoEm: Timestamp.now() };
  await assertSucceeds(setDoc(ref('motorista-c', 'veiculos/NOV1A23'), { ...novo, ...descricao }));
  await assertFails(setDoc(ref('motorista-d', 'veiculos/NOV1B23'),
    { ...novo, ownerUid: 'motorista-d', ...descricao, cor: 'neon' }));
  const doTotem = { ativo: true, vagaAtual: 0, horaEntrada: 0, saldo: 0, estacionamentoId: '',
    tarifaHoraEntrada: 0, cadastradoNoTotem: true };
  await assertFails(setDoc(ref('totem-a', 'veiculos/NEW1234'), { ...doTotem, ...descricao }));
  await assertSucceeds(setDoc(ref('totem-a', 'veiculos/NEW1234'), doTotem));
  await assertSucceeds(updateDoc(ref('motorista-a', 'veiculos/NEW1234'),
    { ownerUid: 'motorista-a', ...descricao, atualizadoEm: Timestamp.now() }));
  assert.equal((await getDoc(ref('motorista-a', 'veiculos/NEW1234'))).data().modelo, 'Gol');
});

test('entrada copia modelo e cor do veículo para a vaga; o pátio vê, outro pátio não', async () => {
  await assertSucceeds(descrever('motorista-b', 'XYZ1234', descricao));
  const comDescricao = { ...vagaLogica('XYZ1234'), modelo: 'Gol', cor: 'prata' };
  await assertSucceeds(loteEntrada(db('totem-a'), 2, comDescricao).commit());
  assert.deepEqual((await getDoc(ref('operador-a', 'estacionamentos/EST-A/vagas/2'))).data(), comDescricao);
  assert.equal((await getDoc(ref('admin', 'estacionamentos/EST-A/vagas/2'))).data().cor, 'prata');
  await assertFails(getDoc(ref('operador-b', 'estacionamentos/EST-A/vagas/2')));
  // Quem vê a vaga não ganha leitura do veículo (que tem o saldo).
  await assertFails(getDoc(ref('operador-a', 'veiculos/XYZ1234')));
  await assertFails(getDoc(ref('admin', 'veiculos/XYZ1234')));
});

test('entrada não aceita modelo ou cor diferente do que o dono informou', async () => {
  await assertSucceeds(descrever('motorista-b', 'XYZ1234', descricao));
  for (const errado of [{ modelo: 'Ferrari', cor: 'prata' }, { modelo: 'Gol', cor: 'preto' },
    { modelo: 'Gol' }, { cor: 'prata' }, { modelo: 'Gol', cor: 'prata', marca: 'Volkswagen' }]) {
    await assertFails(loteEntrada(db('totem-a'), 2, { ...vagaLogica('XYZ1234'), ...errado }).commit());
  }
  // Firmware anterior: entrada sem modelo e cor continua valendo.
  await assertSucceeds(loteEntrada(db('totem-a')).commit());
});

test('carro sem modelo informado não ganha descrição na vaga', async () => {
  await assertFails(loteEntrada(db('totem-a'), 2,
    { ...vagaLogica('XYZ1234'), modelo: 'Gol', cor: 'prata' }).commit());
  // Só a cor informada: a vaga leva só a cor.
  await assertSucceeds(descrever('motorista-b', 'XYZ1234', { cor: 'azul' }));
  await assertSucceeds(loteEntrada(db('totem-a'), 2, { ...vagaLogica('XYZ1234'), cor: 'azul' }).commit());
});

test('saída apaga modelo e cor da vaga junto com a placa', async () => {
  await env.withSecurityRulesDisabled(async c => {
    const batch = writeBatch(c.firestore());
    batch.update(doc(c.firestore(), 'veiculos/ABC1D23'), { modelo: 'Onix', cor: 'preto' });
    batch.update(doc(c.firestore(), 'estacionamentos/EST-A/vagas/1'),
      { ...vagaLogica('ABC1D23'), modelo: 'Onix', cor: 'preto' });
    await batch.commit();
  });
  // Vaga livre com o modelo do carro que saiu seria uma descrição falsa.
  await assertFails(loteSaida(db('totem-a')).commit());
  const d = db('totem-a'), batch = writeBatch(d);
  batch.update(doc(d, 'veiculos/ABC1D23'), saida);
  batch.update(doc(d, 'estacionamentos/EST-A/vagas/1'),
    { ...vagaLogica(''), leituraValida: deleteField(), modelo: deleteField(), cor: deleteField() });
  batch.set(doc(d, `historico/ABC1D23_${entrada}`), recibo);
  await assertSucceeds(batch.commit());
  assert.deepEqual((await getDoc(ref('totem-a', 'estacionamentos/EST-A/vagas/1'))).data(), vagaLogica(''));
});

test('REST do ESP: máscaras da entrada e da saída gravam e apagam modelo e cor', async () => {
  await assertSucceeds(descrever('motorista-b', 'XYZ1234', descricao));
  const mascara = ['leituraValida', 'modelo', 'cor'];
  const veiculo = await rest('/veiculos/XYZ1234');
  const vaga = await rest('/estacionamentos/EST-A/vagas/2');
  const ocupar = escrita('estacionamentos/EST-A/vagas/2',
    { ...vagaLogica('XYZ1234'), modelo: 'Gol', cor: 'prata' }, { updateTime: vaga.data.updateTime });
  ocupar.updateMask.fieldPaths.push('leituraValida');
  const entradaRest = await rest(':commit', { writes: [
    escrita('veiculos/XYZ1234', { vagaAtual: 2, horaEntrada: agora, estacionamentoId: 'EST-A', tarifaHoraEntrada: 8.5 },
      { updateTime: veiculo.data.updateTime }), ocupar
  ] });
  assert.equal(entradaRest.status, 200, JSON.stringify(entradaRest));
  assert.equal((await getDoc(ref('operador-a', 'estacionamentos/EST-A/vagas/2'))).data().modelo, 'Gol');
  // Carro sem descrição: a mesma máscara apaga o que houver e grava só a placa.
  const semDescricao = await rest('/veiculos/ABC1D23');
  const vaga1 = await rest('/estacionamentos/EST-A/vagas/1');
  const liberar = escrita('estacionamentos/EST-A/vagas/1', vagaLogica(''), { updateTime: vaga1.data.updateTime });
  liberar.updateMask.fieldPaths.push(...mascara);
  const saidaRest = await rest(':commit', { writes: [
    escrita('veiculos/ABC1D23', saida, { updateTime: semDescricao.data.updateTime }), liberar,
    escrita(`historico/ABC1D23_${entrada}`, recibo, { exists: false })
  ] });
  assert.equal(saidaRest.status, 200, JSON.stringify(saidaRest));
  assert.deepEqual((await getDoc(ref('totem-a', 'estacionamentos/EST-A/vagas/1'))).data(), vagaLogica(''));
});

// ---------------------------------------------------------------------------
// Privacidade (LGPD): aceite no cadastro e exclusão da conta pelo motorista.
// A placa fica livre para outra pessoa, sem nada do dono anterior.
// ---------------------------------------------------------------------------
test('aceite da política de privacidade no cadastro usa a hora do servidor', async () => {
  const perfil = { role: 'motorista', name: 'Nina', versaoPrivacidade: '2026-10-09' };
  await assertFails(setDoc(ref('nina', 'users/nina'),
    { ...perfil, privacidadeAceitaEm: Timestamp.fromMillis(Date.now() - 86400000) }));
  await assertFails(setDoc(ref('nina', 'users/nina'),
    { ...perfil, privacidadeAceitaEm: serverTimestamp(), versaoPrivacidade: 1 }));
  await assertSucceeds(setDoc(ref('nina', 'users/nina'), { ...perfil, privacidadeAceitaEm: serverTimestamp() }));
  // Depois do cadastro, ninguém troca a data nem a versão aceitas.
  await assertFails(updateDoc(ref('nina', 'users/nina'), { privacidadeAceitaEm: serverTimestamp() }));
  await assertFails(updateDoc(ref('nina', 'users/nina'), { versaoPrivacidade: '2030-01-01' }));
});

const liberacao = (extra = {}) => ({ ownerUid: '', saldo: 0, historicoDesde: serverTimestamp(),
  atualizadoEm: serverTimestamp(), ownerNome: deleteField(), marca: deleteField(), modelo: deleteField(),
  cor: deleteField(), vagaEspecial: deleteField(), ultimaRecarga: deleteField(), ...extra });
// Lote que o site manda ao excluir a conta: libera a placa, apaga o extrato,
// a reserva encerrada e o perfil.
function loteExclusao(uid, { placa = 'XYZ1234', veiculo = liberacao(), comVeiculo = true,
  comPerfil = true, comReserva = false, recargas = [] } = {}) {
  const d = db(uid), batch = writeBatch(d);
  if (comVeiculo) batch.update(doc(d, `veiculos/${placa}`), veiculo);
  for (const id of recargas) batch.delete(doc(d, `veiculos/${placa}/recargas/${id}`));
  if (comReserva) batch.delete(doc(d, `reservas/${uid}`));
  if (comPerfil) batch.delete(doc(d, `users/${uid}`));
  return batch;
}
async function lerSemRegras(path) {
  let snap;
  await env.withSecurityRulesDisabled(async c => { snap = await getDoc(doc(c.firestore(), path)); });
  return snap;
}

test('exclusão da conta: perfil, extrato e dados do carro saem num lote só', async () => {
  await assertSucceeds(descrever('motorista-b', 'XYZ1234', { ...descricao, vagaEspecial: 'pcd' }));
  await assertSucceeds(loteRecarga('motorista-b', { placa: 'XYZ1234', valor: 15, id: 'b1' }).commit());
  await assertSucceeds(loteRecarga('motorista-b', { placa: 'XYZ1234', valor: 5, id: 'b2' }).commit());
  await assertSucceeds(loteExclusao('motorista-b', { recargas: ['b1', 'b2'] }).commit());
  assert.equal((await lerSemRegras('users/motorista-b')).exists(), false);
  assert.equal((await lerSemRegras('veiculos/XYZ1234/recargas/b1')).exists(), false);
  const veiculo = (await lerSemRegras('veiculos/XYZ1234')).data();
  assert.equal(veiculo.ownerUid, '');
  assert.equal(veiculo.saldo, 0);
  assert.ok(veiculo.historicoDesde instanceof Timestamp);
  for (const campo of ['ownerNome', 'marca', 'modelo', 'cor', 'vagaEspecial', 'ultimaRecarga']) {
    assert.ok(!(campo in veiculo), `${campo} ficou no veículo`);
  }
  // O que o totem precisa continua lá: a placa segue funcionando como placa sem dono.
  assert.equal(veiculo.ativo, true);
  assert.equal(veiculo.vagaAtual, 0);
});

test('exclusão da conta: um extrato grande cabe num lote só', async () => {
  await env.withSecurityRulesDisabled(async c => {
    const batch = writeBatch(c.firestore());
    for (let i = 0; i < 60; i++) {
      batch.set(doc(c.firestore(), `veiculos/XYZ1234/recargas/m${i}`),
        { valor: 1, forma: 'pix', uid: 'motorista-b', criadaEm: Timestamp.now() });
    }
    await batch.commit();
  });
  const ids = Array.from({ length: 60 }, (_, i) => `m${i}`);
  await assertSucceeds(loteExclusao('motorista-b', { recargas: ids }).commit());
  assert.equal((await lerSemRegras('veiculos/XYZ1234/recargas/m59')).exists(), false);
});

test('exclusão da conta: só o próprio motorista, e só junto com a placa', async () => {
  // Perfil sem liberar a placa, ou placa liberada sem apagar o perfil.
  await assertFails(loteExclusao('motorista-b', { comVeiculo: false }).commit());
  await assertFails(loteExclusao('motorista-b', { comPerfil: false }).commit());
  // Ninguém exclui a conta de outra pessoa nem libera a placa dela.
  await assertFails(deleteDoc(ref('motorista-a', 'users/motorista-b')));
  await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), 'users/motorista-c'), { role: 'motorista' }));
  await assertFails(loteExclusao('motorista-c').commit());
  await assertSucceeds(deleteDoc(ref('motorista-c', 'users/motorista-c')));
  // Estacionamento e administração não se excluem pelo site.
  await assertFails(deleteDoc(ref('operador-a', 'users/operador-a')));
  await assertFails(deleteDoc(ref('admin', 'users/admin')));
  await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), 'users/legado'),
    { role: 'motorista', estacionamentoId: 'EST-A' }));
  await assertFails(deleteDoc(ref('legado', 'users/legado')));
  assert.equal(await saldoDe('XYZ1234'), 100);
});

test('exclusão da conta: carro no pátio e dívida ficam; a placa sai limpa', async () => {
  // Estadia aberta: registrar a saída antes.
  await assertFails(loteExclusao('motorista-a', { placa: 'ABC1D23' }).commit());
  // Pendência não some com a conta.
  await env.withSecurityRulesDisabled(c => updateDoc(doc(c.firestore(), 'veiculos/XYZ1234'), { saldo: -6.3 }));
  await assertFails(loteExclusao('motorista-b').commit());
  await env.withSecurityRulesDisabled(c => updateDoc(doc(c.firestore(), 'veiculos/XYZ1234'),
    { saldo: 40, ...descricao, vagaEspecial: 'gestante' }));
  for (const parcial of [
    { saldo: 40 }, { saldo: 5 }, { ownerUid: 'motorista-a' }, { ownerUid: deleteField() },
    { historicoDesde: Timestamp.fromMillis(Date.now() - 86400000) }, { historicoDesde: deleteField() },
    { marca: 'Fiat' }, { cor: 'azul' }, { vagaEspecial: 'pcd' }, { ativo: false }, { vagaAtual: 3 },
    { cadastradoNoTotem: true }
  ]) await assertFails(loteExclusao('motorista-b', { veiculo: liberacao(parcial) }).commit());
  // Sem apagar a descrição do carro também não vale.
  await assertFails(loteExclusao('motorista-b',
    { veiculo: { ownerUid: '', saldo: 0, historicoDesde: serverTimestamp() } }).commit());
  assert.equal(await saldoDe('XYZ1234'), 40);
  await assertSucceeds(loteExclusao('motorista-b').commit());
});

test('exclusão da conta: a reserva ativa é cancelada antes e sai junto', async () => {
  const d = db('motorista-b');
  await assertSucceeds(loteReserva(d, 'motorista-b').batch.commit());
  // Ativa: segura a vaga no mapa, então não pode simplesmente sumir.
  await assertFails(loteExclusao('motorista-b', { comReserva: true }).commit());
  // Nem a conta sai deixando a reserva para trás.
  await assertFails(loteExclusao('motorista-b').commit());
  const cancelar = writeBatch(d);
  cancelar.update(doc(d, 'reservas/motorista-b'), { status: 'cancelada' });
  cancelar.update(doc(d, 'catalogoEstacionamentos/EST-A/vagas/2'), { reservadaAte: 0 });
  await assertSucceeds(cancelar.commit());
  // Fora da exclusão da conta a reserva não é apagada, nem a de outra pessoa.
  await assertFails(deleteDoc(ref('motorista-b', 'reservas/motorista-b')));
  await assertFails(deleteDoc(ref('motorista-a', 'reservas/motorista-b')));
  await assertSucceeds(loteExclusao('motorista-b', { comReserva: true }).commit());
  assert.equal((await lerSemRegras('reservas/motorista-b')).exists(), false);
});

test('exclusão da conta: o extrato só sai com a placa liberada e só o de quem recarregou', async () => {
  await assertSucceeds(loteRecarga('motorista-b', { placa: 'XYZ1234', valor: 15, id: 'b1' }).commit());
  const registro = ref('motorista-b', 'veiculos/XYZ1234/recargas/b1');
  // Placa ainda da conta: o extrato não some de uma carteira em uso.
  await assertFails(deleteDoc(registro));
  await assertFails(deleteDoc(ref('motorista-a', 'veiculos/XYZ1234/recargas/b1')));
  await assertFails(deleteDoc(ref('totem-a', 'veiculos/XYZ1234/recargas/b1')));
  // Um extrato grande pode terminar de sair depois do lote que libera a placa.
  await assertSucceeds(loteExclusao('motorista-b').commit());
  await assertFails(deleteDoc(ref('motorista-a', 'veiculos/XYZ1234/recargas/b1')));
  await assertSucceeds(deleteDoc(registro));
});

test('placa liberada: quem cadastra depois não vê as estadias do dono anterior', async () => {
  const antiga = { ...recibo, placa: 'XYZ1234', entrada: entrada - 7200, saida: entrada - 3600 };
  const idAntiga = `historico/XYZ1234_${antiga.entrada}`;
  await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), idAntiga), antiga));
  const porPlaca = (uid, ...filtros) =>
    getDocs(query(collection(db(uid), 'historico'), where('placa', '==', 'XYZ1234'), ...filtros));
  // Enquanto a placa é dele, o dono lê tudo, como antes.
  assert.equal((await assertSucceeds(porPlaca('motorista-b'))).size, 1);
  await assertSucceeds(loteExclusao('motorista-b').commit());
  await assertFails(porPlaca('motorista-b'));

  // Outra pessoa cadastra a placa (reivindicação de placa sem dono).
  await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), 'users/motorista-c'), { role: 'motorista' }));
  const d = db('motorista-c'), reivindicar = writeBatch(d);
  reivindicar.update(doc(d, 'veiculos/XYZ1234'), { ownerUid: 'motorista-c', atualizadoEm: serverTimestamp() });
  reivindicar.set(doc(d, 'users/motorista-c'), { placa: 'XYZ1234' }, { merge: true });
  await assertSucceeds(reivindicar.commit());
  // O limite não pode ser apagado nem recuado por quem reivindicou.
  for (const historicoDesde of [deleteField(), Timestamp.fromMillis(0)]) {
    await assertFails(updateDoc(doc(d, 'veiculos/XYZ1234'), { historicoDesde, atualizadoEm: Timestamp.now() }));
  }
  const limite = (await getDoc(doc(d, 'veiculos/XYZ1234'))).data().historicoDesde;
  const desde = limite.seconds + (limite.nanoseconds > 0 ? 1 : 0);
  const nova = { ...recibo, placa: 'XYZ1234', entrada: desde + 60, saida: desde + 3660 };
  await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), `historico/XYZ1234_${nova.entrada}`), nova));

  await assertFails(getDoc(ref('motorista-c', idAntiga)));
  await assertSucceeds(getDoc(ref('motorista-c', `historico/XYZ1234_${nova.entrada}`)));
  // A consulta precisa trazer o limite; sem ele, ou com um limite anterior, é recusada.
  await assertFails(porPlaca('motorista-c'));
  await assertFails(porPlaca('motorista-c', where('entrada', '>=', desde - 7200)));
  const lidas = await assertSucceeds(porPlaca('motorista-c', where('entrada', '>=', desde)));
  assert.deepEqual(lidas.docs.map(item => item.data().entrada), [nova.entrada]);
  // O estacionamento e a administração continuam com os registros de antes.
  await assertSucceeds(getDoc(ref('operador-a', idAntiga)));
  await assertSucceeds(getDoc(ref('admin', idAntiga)));
});

test('placa liberada continua entrando pelo totem, como placa sem dono', async () => {
  await assertSucceeds(loteExclusao('motorista-b').commit());
  const d = db('totem-a'), batch = writeBatch(d);
  batch.update(doc(d, 'veiculos/XYZ1234'), { vagaAtual: 2, horaEntrada: agora, estacionamentoId: 'EST-A', tarifaHoraEntrada: 8.5 });
  batch.update(doc(d, 'estacionamentos/EST-A/vagas/2'), vagaLogica('XYZ1234'));
  await assertSucceeds(batch.commit());
});
