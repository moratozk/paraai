import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, writeBatch, Timestamp, increment, setLogLevel } from 'firebase/firestore';
import { createMockUserToken } from '@firebase/util';

// Nunca aceitar projeto/host de produção, nem carregar Credenciais.h/.env.
const projectId = 'demo-paraai';
setLogLevel('silent'); // Rejeições esperadas são conferidas por assertFails.
const host = process.env.FIRESTORE_EMULATOR_HOST;
assert.match(host ?? '', /^(127\.0\.0\.1|localhost):8180$/,
  'Execute npm test: esta suíte só pode usar o emulador local na porta 8180.');
const base = `http://${host}/v1/projects/${projectId}/databases/(default)/documents`;
let env;
const entrada = 1788800000;
const estacionamento = { ownerUid: 'operador-a', nome: 'Patio A', numVagas: 4, tarifaHora: 8.5 };
const vitrine = { nome: 'Patio A', numVagas: 4, tarifaHora: 8.5,
  cep: '00000000', logradouro: 'Rua A', numero: '1', bairro: 'Centro', cidade: 'Teste', uf: 'SP' };
const livre = { ativo: true, vagaAtual: 0, horaEntrada: 0, saldo: 100,
  estacionamentoId: '', tarifaHoraEntrada: 0, ownerUid: 'motorista-a', ownerNome: 'Ana', atualizadoEm: Timestamp.now() };
const aberta = { ...livre, vagaAtual: 1, horaEntrada: entrada, estacionamentoId: 'EST-A', tarifaHoraEntrada: 8.5 };
const saida = { vagaAtual: 0, horaEntrada: 0, estacionamentoId: '', tarifaHoraEntrada: 0, saldo: 91.5 };
const recibo = { placa: 'ABC1D23', vaga: 1, entrada, saida: entrada + 3600,
  duracaoMinutos: 60, valorCobrado: 8.5, tarifaHora: 8.5, estacionamentoId: 'EST-A' };
const disponibilidade = { ultimaAtualizacao: entrada, vagasLivres: 3, vagasEmOperacao: 4 };
const db = uid => env.authenticatedContext(uid).firestore();
const ref = (uid, path) => doc(db(uid), path);

before(async () => {
  env = await initializeTestEnvironment({ projectId, firestore: {
    host: host.split(':')[0], port: 8180,
    rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8')
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
      'users/motorista-a': { role: 'motorista' },
      'veiculos/ABC1D23': aberta,
      'veiculos/XYZ1234': { ...livre, ownerUid: 'motorista-b' },
      'estacionamentos/EST-A/vagas/1': { ocupada: true, placa: 'ABC1D23' },
      'estacionamentos/EST-A/vagas/2': { ocupada: false, placa: '' }
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
test('totem revogado não consulta veículo nem grava sensor', async () => {
  await assertFails(getDoc(ref('totem-revogado', 'veiculos/ABC1D23')));
  await assertFails(updateDoc(ref('totem-revogado', 'estacionamentos/EST-A/vagas/1'), { ocupada: false }));
});
test('heartbeat operacional e público permitido somente ao próprio totem', async () => {
  await assertSucceeds(updateDoc(ref('totem-a', 'estacionamentos/EST-A'), {
    ...disponibilidade, vagasSuportadasTotem: 4, tarifaAplicadaTotem: 8.5
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
test('sensor indisponível mantém booleanos e não aceita campos extras', async () => {
  await assertSucceeds(updateDoc(ref('totem-a', 'estacionamentos/EST-A/vagas/1'), { ocupada: true, leituraValida: false }));
  await assertFails(updateDoc(ref('totem-a', 'estacionamentos/EST-A/vagas/1'), { ocupada: null }));
  await assertFails(updateDoc(ref('totem-a', 'estacionamentos/EST-A/vagas/1'), { leituraValida: 'sim' }));
  await assertFails(updateDoc(ref('totem-a', 'estacionamentos/EST-A/vagas/1'), { senha: 'proibido' }));
  await assertFails(setDoc(ref('totem-a', 'estacionamentos/EST-A/vagas/5'), { ocupada: false }));
});
test('entrada atômica associa veículo e vaga sem mudar saldo/dono', async () => {
  const d = db('totem-a'), batch = writeBatch(d);
  batch.update(doc(d, 'veiculos/XYZ1234'), { vagaAtual: 2, horaEntrada: entrada, estacionamentoId: 'EST-A', tarifaHoraEntrada: 8.5 });
  batch.update(doc(d, 'estacionamentos/EST-A/vagas/2'), { placa: 'XYZ1234' });
  await assertSucceeds(batch.commit());
  const v = (await getDoc(doc(d, 'veiculos/XYZ1234'))).data();
  assert.equal(v.saldo, 100);
  assert.equal(v.ownerUid, 'motorista-b');
});
test('entrada rejeita vaga fora da faixa e estadia já aberta', async () => {
  await assertFails(updateDoc(ref('totem-a', 'veiculos/XYZ1234'), { vagaAtual: 5, horaEntrada: entrada, estacionamentoId: 'EST-A', tarifaHoraEntrada: 8.5 }));
  await assertFails(updateDoc(ref('totem-a', 'veiculos/ABC1D23'), { vagaAtual: 2, horaEntrada: entrada + 5 }));
});
test('entrada rejeita veículo inativo', async () => {
  await env.withSecurityRulesDisabled(c => updateDoc(doc(c.firestore(), 'veiculos/XYZ1234'), { ativo: false }));
  await assertFails(updateDoc(ref('totem-a', 'veiculos/XYZ1234'), { vagaAtual: 2, horaEntrada: entrada, estacionamentoId: 'EST-A', tarifaHoraEntrada: 8.5 }));
});
test('cadastro acadêmico no totem continua compatível com reivindicação pelo motorista', async () => {
  const dados = { ...livre, cadastradoNoTotem: true };
  delete dados.ownerUid; delete dados.ownerNome; delete dados.atualizadoEm;
  await assertSucceeds(setDoc(ref('totem-a', 'veiculos/NEW1234'), dados));
  await assertSucceeds(updateDoc(ref('motorista-a', 'veiculos/NEW1234'), { ownerUid: 'motorista-a', ownerNome: 'Ana', atualizadoEm: Timestamp.now() }));
  await assertFails(updateDoc(ref('motorista-b', 'veiculos/NEW1234'), { ownerUid: 'motorista-b', ownerNome: 'B', atualizadoEm: Timestamp.now() }));
});
test('recarga simulada do próprio veículo permanece compatível', async () => {
  await assertSucceeds(updateDoc(ref('motorista-a', 'veiculos/ABC1D23'), { saldo: increment(50), atualizadoEm: Timestamp.now() }));
  await assertFails(updateDoc(ref('motorista-b', 'veiculos/ABC1D23'), { saldo: increment(50) }));
});

function loteSaida(d, dadosRecibo = recibo) {
  const batch = writeBatch(d);
  batch.update(doc(d, 'veiculos/ABC1D23'), saida);
  batch.update(doc(d, 'estacionamentos/EST-A/vagas/1'), { placa: '' });
  batch.set(doc(d, `historico/ABC1D23_${entrada}`), dadosRecibo);
  return batch;
}
test('saída: débito, vaga e recibo confirmados juntos com tarifa congelada', async () => {
  await assertSucceeds(updateDoc(ref('operador-a', 'estacionamentos/EST-A'), { tarifaHora: 20 }));
  const d = db('totem-a');
  await assertSucceeds(loteSaida(d).commit());
  assert.equal((await getDoc(doc(d, 'veiculos/ABC1D23'))).data().saldo, 91.5);
  assert.equal((await getDoc(ref('motorista-a', `historico/ABC1D23_${entrada}`))).data().tarifaHora, 8.5);
  assert.equal((await getDoc(doc(d, 'estacionamentos/EST-A/vagas/1'))).data().placa, '');
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
  for (const alteracao of [{ tarifaHora: 9 }, { valorCobrado: 9 }, { duracaoMinutos: 65 }, { entrada: entrada - 1 }]) {
    await assertFails(loteSaida(db('totem-a'), { ...recibo, ...alteracao }).commit());
  }
  assert.equal((await getDoc(ref('motorista-a', 'veiculos/ABC1D23'))).data().saldo, 100);
});
test('recibo imutável: repetição da saída não debita outra vez', async () => {
  const d = db('totem-a');
  await assertSucceeds(loteSaida(d).commit());
  await assertFails(loteSaida(d).commit());
  assert.equal((await getDoc(doc(d, 'veiculos/ABC1D23'))).data().saldo, 91.5);
  await assertFails(getDoc(ref('motorista-b', `historico/ABC1D23_${entrada}`)));
});

async function rest(path, body, uid = 'totem-a') {
  const response = await fetch(`${base}${path}`, {
    method: body ? 'POST' : 'GET',
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
test('REST do ESP: versão antiga não sobrescreve recarga concorrente', async () => {
  const original = await rest('/veiculos/ABC1D23');
  assert.equal(original.status, 200);
  await updateDoc(ref('motorista-a', 'veiculos/ABC1D23'), { saldo: increment(50), atualizadoEm: Timestamp.now() });
  const resultado = await rest(':commit', { writes: [
    escrita('veiculos/ABC1D23', saida, { updateTime: original.data.updateTime }),
    escrita('estacionamentos/EST-A/vagas/1', { placa: '' }, { exists: true }),
    escrita(`historico/ABC1D23_${entrada}`, recibo, { exists: false })
  ] });
  // A validação do saldo pode rejeitar antes da precondição de versão.
  assert.ok(['PERMISSION_DENIED', 'FAILED_PRECONDITION'].includes(resultado.data.error?.status), JSON.stringify(resultado));
  // Mesmo com o novo saldo correto, uma leitura antiga continua proibida.
  const revisaoAntiga = await rest(':commit', { writes: [
    escrita('veiculos/ABC1D23', { ...saida, saldo: 141.5 }, { updateTime: original.data.updateTime }),
    escrita('estacionamentos/EST-A/vagas/1', { placa: '' }, { exists: true }),
    escrita(`historico/ABC1D23_${entrada}`, recibo, { exists: false })
  ] });
  assert.equal(revisaoAntiga.data.error?.status, 'FAILED_PRECONDITION', JSON.stringify(revisaoAntiga));
  assert.equal((await getDoc(ref('motorista-a', 'veiculos/ABC1D23'))).data().saldo, 150);
  assert.equal((await getDoc(ref('totem-a', 'estacionamentos/EST-A/vagas/1'))).data().placa, 'ABC1D23');
  assert.equal((await rest(`/historico/ABC1D23_${entrada}`, undefined, 'motorista-a')).status, 403);
});
test('REST do ESP: lote com versões atuais e recibo exclusivo funciona', async () => {
  const veiculo = await rest('/veiculos/ABC1D23');
  const vaga = await rest('/estacionamentos/EST-A/vagas/1');
  const resultado = await rest(':commit', { writes: [
    escrita('veiculos/ABC1D23', saida, { updateTime: veiculo.data.updateTime }),
    escrita('estacionamentos/EST-A/vagas/1', { placa: '' }, { updateTime: vaga.data.updateTime }),
    escrita(`historico/ABC1D23_${entrada}`, recibo, { exists: false })
  ] });
  assert.equal(resultado.status, 200, JSON.stringify(resultado));
});

test('REST do ESP: duas entradas concorrentes não recebem a mesma vaga', async () => {
  await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), 'veiculos/NEW1234'), livre));
  const vaga = await rest('/estacionamentos/EST-A/vagas/2');
  const primeiro = await rest('/veiculos/XYZ1234');
  const segundo = await rest('/veiculos/NEW1234');
  const abrir = (placa, revisao) => rest(':commit', { writes: [
    escrita(`veiculos/${placa}`, { vagaAtual: 2, horaEntrada: entrada, estacionamentoId: 'EST-A', tarifaHoraEntrada: 8.5 }, { updateTime: revisao }),
    escrita('estacionamentos/EST-A/vagas/2', { placa }, { updateTime: vaga.data.updateTime })
  ] });
  assert.equal((await abrir('XYZ1234', primeiro.data.updateTime)).status, 200);
  const conflito = await abrir('NEW1234', segundo.data.updateTime);
  assert.equal(conflito.data.error?.status, 'FAILED_PRECONDITION', JSON.stringify(conflito));
  assert.equal((await getDoc(ref('totem-a', 'veiculos/NEW1234'))).data().vagaAtual, 0);
});
