import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, writeBatch, Timestamp, increment, deleteField, setLogLevel } from 'firebase/firestore';
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
  const dados = { ...livre, cadastradoNoTotem: true };
  delete dados.ownerUid; delete dados.ownerNome; delete dados.atualizadoEm;
  await assertSucceeds(setDoc(ref('totem-a', 'veiculos/NEW1234'), dados));
  await assertSucceeds(updateDoc(ref('motorista-a', 'veiculos/NEW1234'), { ownerUid: 'motorista-a', ownerNome: 'Ana', atualizadoEm: Timestamp.now() }));
  await assertFails(updateDoc(ref('motorista-b', 'veiculos/NEW1234'), { ownerUid: 'motorista-b', ownerNome: 'B', atualizadoEm: Timestamp.now() }));
});
test('painel cadastra veículo sem o nome do dono e a recarga apaga o nome legado', async () => {
  const novo = { ativo: true, vagaAtual: 0, horaEntrada: 0, saldo: 0, estacionamentoId: '',
    tarifaHoraEntrada: 0, ownerUid: 'motorista-a', atualizadoEm: Timestamp.now() };
  await assertSucceeds(setDoc(ref('motorista-a', 'veiculos/NEW1234'), novo));
  await assertSucceeds(updateDoc(ref('motorista-a', 'veiculos/ABC1D23'),
    { saldo: increment(10), ownerNome: deleteField(), atualizadoEm: Timestamp.now() }));
  assert.ok(!('ownerNome' in (await getDoc(ref('motorista-a', 'veiculos/ABC1D23'))).data()));
});
test('recarga simulada do próprio veículo permanece compatível', async () => {
  await assertSucceeds(updateDoc(ref('motorista-a', 'veiculos/ABC1D23'), { saldo: increment(50), atualizadoEm: Timestamp.now() }));
  await assertFails(updateDoc(ref('motorista-b', 'veiculos/ABC1D23'), { saldo: increment(50) }));
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
  await env.withSecurityRulesDisabled(c => updateDoc(doc(c.firestore(), 'veiculos/XYZ1234'), { saldo: -3.5 }));
  await assertFails(loteEntrada(db('totem-a')).commit());
  await assertSucceeds(updateDoc(ref('motorista-b', 'veiculos/XYZ1234'), { saldo: increment(3.499), atualizadoEm: Timestamp.now() }));
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
test('REST do ESP: versão antiga não sobrescreve recarga concorrente', async () => {
  const original = await rest('/veiculos/ABC1D23');
  assert.equal(original.status, 200);
  await updateDoc(ref('motorista-a', 'veiculos/ABC1D23'), { saldo: increment(50), atualizadoEm: Timestamp.now() });
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

test('pendência bloqueia reserva e cada conta tem uma reserva ativa por vez', async () => {
  const veiculo = c => doc(c.firestore(), 'veiculos/XYZ1234');
  await env.withSecurityRulesDisabled(c => updateDoc(veiculo(c), { saldo: -1 }));
  await assertFails(loteReserva(db('motorista-b'), 'motorista-b').batch.commit());
  await env.withSecurityRulesDisabled(c => updateDoc(veiculo(c), { saldo: 0 }));
  await assertSucceeds(loteReserva(db('motorista-b'), 'motorista-b').batch.commit());
  await assertFails(loteReserva(db('motorista-b'), 'motorista-b', { vaga: 3 }).batch.commit());
});

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
