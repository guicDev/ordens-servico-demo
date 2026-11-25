'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { STORAGE_KEY, STATUSES, seed, createStore, parseMoney, escapeHTML, csvCell, validState } = require('../core.js');
const clock = () => new Date('2026-06-15T12:00:00.000Z');
function memory() {
  const values = new Map();
  return { getItem: key => values.has(key) ? values.get(key) : null, setItem: (key, value) => values.set(key, String(value)), values };
}
function setup() { const storage = memory(); return { storage, store: createStore(storage, { now: clock }) }; }
function orderInput() { return { number: 'EXEMPLO-123', event: 'Evento de teste', client: 'Cliente de exemplo', location: 'Espaço fictício', date: '2026-06-16', status: 'pendente', budgetCents: 12345, materials: 'Estrutura', notes: '' }; }
test('cenário novo é válido, relativo ao relógio e independente entre instâncias', () => {
  const first = seed(clock()), second = seed(clock());
  assert.equal(validState(first), true);
  assert.equal(first.orders[0].date, '2026-06-12');
  first.orders[0].event = 'Alterado';
  assert.notEqual(first.orders[0].event, second.orders[0].event);
  assert.equal(Object.keys(STATUSES).length, 6);
});
test('todos os status podem ser alterados e o histórico acompanha', () => {
  const { store } = setup();
  for (const status of Object.keys(STATUSES)) {
    store.setOrderStatus('os-1', status);
    assert.equal(store.snapshot().orders[0].status, status);
  }
  assert.equal(store.snapshot().history.length, 6);
  assert.equal(store.snapshot().history[0].action, 'Status da OS alterado');
});
test('status inválido não altera estado nem histórico', () => {
  const { store } = setup(), before = store.snapshot();
  assert.throws(() => store.setOrderStatus('os-1', '__proto__'), /inválido/);
  assert.throws(() => store.setOrderStatus('inexistente', 'executado'), /encontrado/);
  assert.deepEqual(store.snapshot(), before);
});
test('cadastro e edição de OS persistem valores exatos', () => {
  const { store, storage } = setup();
  const created = store.saveOrder(orderInput());
  store.saveOrder({ ...created, event: 'Novo nome', budgetCents: 12346 });
  const reloaded = createStore(storage, { now: clock });
  const found = reloaded.snapshot().orders.find(item => item.id === created.id);
  assert.equal(found.event, 'Novo nome'); assert.equal(found.budgetCents, 12346);
  assert.equal(validState(reloaded.snapshot()), true);
});
test('número de OS duplicado, entrada vazia e data impossível são rejeitados', () => {
  const { store } = setup(), before = store.snapshot();
  assert.throws(() => store.saveOrder({ ...orderInput(), number: 'demo-001' }), /existe/);
  assert.throws(() => store.saveOrder({ ...orderInput(), event: '  ' }), /Evento/);
  assert.throws(() => store.saveOrder({ ...orderInput(), date: '2026-02-30' }), /inválida/);
  assert.throws(() => store.saveOrder({ ...orderInput(), budgetCents: -1 }), /inválido/);
  assert.deepEqual(store.snapshot(), before);
});
test('dinheiro aceita vírgula ou ponto e permanece inteiro em centavos', () => {
  assert.equal(parseMoney('0,01'), 1);
  assert.equal(parseMoney('10.10'), 1010);
  assert.equal(parseMoney('27,9'), 2790);
  assert.equal(parseMoney('9999999999,99'), 999999999999);
  for (const invalid of ['-1', '1,234', '1.234,56', '1e3', '', 'NaN', 'Infinity', '10000000000', '0x12']) assert.throws(() => parseMoney(invalid), /Valor/);
});
test('registrar pagamento atualiza apenas o lançamento e cria histórico', () => {
  const { store } = setup();
  const before = store.snapshot();
  store.payPayment('payment-1', '2026-06-15');
  const after = store.snapshot();
  const payment = after.payments.find(item => item.id === 'payment-1');
  assert.equal(payment.status, 'pago'); assert.equal(payment.paidAt, '2026-06-15');
  assert.equal(payment.valueCents, before.payments[0].valueCents);
  assert.deepEqual(after.orders, before.orders);
  assert.equal(after.history.length, before.history.length + 1);
  assert.throws(() => store.payPayment('payment-1', '2026-06-15'), /já foi pago/);
  assert.equal(store.snapshot().history.length, after.history.length);
});
test('pagamento futuro e data impossível não alteram estado', () => {
  const { store } = setup(), before = store.snapshot();
  assert.throws(() => store.payPayment('payment-1', '2026-06-16'), /futura/);
  assert.throws(() => store.payPayment('payment-1', '2026-02-30'), /inválida/);
  assert.deepEqual(store.snapshot(), before);
});
test('cadastro financeiro exige valor positivo e vínculo existente', () => {
  const { store } = setup();
  const input = { description: 'Exemplo', client: 'Cliente fictício', due: '2026-06-20', orderId: 'os-1', valueCents: 25001 };
  const created = store.savePayment(input);
  assert.equal(created.valueCents, 25001); assert.equal(created.status, 'aberto');
  assert.throws(() => store.savePayment({ ...input, valueCents: 0 }), /Valor/);
  assert.throws(() => store.savePayment({ ...input, orderId: 'outro' }), /encontrado/);
  store.payPayment(created.id, '2026-06-15');
  assert.throws(() => store.savePayment({ ...input, id: created.id }), /já pago/);
});
test('saída e devolução mantêm total e disponível consistentes', () => {
  const { store } = setup();
  const initial = store.snapshot().inventory[0];
  store.moveStock({ itemId: initial.id, direction: 'saida', quantity: 3, reason: 'Montagem fictícia', date: '2026-06-15' });
  let item = store.snapshot().inventory[0];
  assert.equal(item.total, initial.total); assert.equal(item.available, initial.available - 3);
  store.moveStock({ itemId: initial.id, direction: 'devolucao', quantity: 3, reason: 'Retorno fictício', date: '2026-06-15' });
  item = store.snapshot().inventory[0]; assert.deepEqual(item, initial);
  assert.equal(store.snapshot().movements.length, 5);
});
test('entrada aumenta estoque e movimentações inválidas são atômicas', () => {
  const { store } = setup();
  store.moveStock({ itemId: 'item-1', direction: 'entrada', quantity: 5, reason: 'Aquisição fictícia', date: '2026-06-15' });
  assert.equal(store.snapshot().inventory[0].total, 45);
  assert.equal(store.snapshot().inventory[0].available, 37);
  const before = store.snapshot();
  for (const input of [ { direction: 'saida', quantity: 38 }, { direction: 'devolucao', quantity: 9 }, { direction: 'entrada', quantity: 0 }, { direction: 'saida', quantity: 0.5 }, { direction: 'outro', quantity: 1 } ]) {
    assert.throws(() => store.moveStock({ itemId: 'item-1', reason: 'Teste', date: '2026-06-15', ...input }));
    assert.deepEqual(store.snapshot(), before);
  }
});
test('editar estoque preserva quantidade em uso e impede total insuficiente', () => {
  const { store } = setup();
  store.saveInventory({ id: 'item-1', name: 'Módulo fictício', total: 20 });
  assert.equal(store.snapshot().inventory[0].available, 12);
  assert.throws(() => store.saveInventory({ id: 'item-1', name: 'Módulo fictício', total: 7 }), /em uso/);
  const created = store.saveInventory({ name: 'Novo item fictício', total: 9 });
  assert.equal(created.total, 9); assert.equal(created.available, 9);
});
test('contrato exige vigência válida e valor positivo', () => {
  const { store } = setup();
  const input = { title: 'Contrato fictício', client: 'Parte fictícia', valueCents: 10000, start: '2026-06-15', end: '2026-07-15', status: 'ativo', notes: '' };
  const created = store.saveContract(input);
  assert.equal(created.valueCents, 10000);
  assert.throws(() => store.saveContract({ ...input, end: '2026-05-15' }), /posterior/);
  assert.throws(() => store.saveContract({ ...input, valueCents: 0 }), /Valor/);
  assert.throws(() => store.saveContract({ ...input, status: 'outro' }), /inválido/);
});
test('restauração substitui somente o estado da aplicação', () => {
  const { store, storage } = setup();
  storage.setItem('outro-aplicativo', 'preservado');
  store.saveOrder(orderInput()); store.setOrderStatus('os-1', 'executado');
  store.reset();
  assert.deepEqual(store.snapshot(), seed(clock()));
  assert.equal(storage.getItem('outro-aplicativo'), 'preservado');
  assert.equal(createStore(storage, { now: clock }).snapshot().orders.length, 8);
  assert.deepEqual([...storage.values.keys()].sort(), [STORAGE_KEY, 'outro-aplicativo'].sort());
});
test('navegadores separados e snapshots não compartilham referências', () => {
  const first = setup(), second = setup();
  first.store.setOrderStatus('os-1', 'executado');
  assert.equal(second.store.snapshot().orders[0].status, 'pendente');
  const snapshot = first.store.snapshot(); snapshot.orders[0].event = 'Modificação externa';
  assert.notEqual(first.store.snapshot().orders[0].event, 'Modificação externa');
});
test('storage bloqueado mantém funcionamento em memória e avisa', () => {
  const blocked = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('sem espaço'); } };
  const store = createStore(blocked, { now: clock });
  assert.match(store.warning(), /ler/);
  store.setOrderStatus('os-1', 'executado');
  assert.equal(store.snapshot().orders[0].status, 'executado');
  assert.match(store.warning(), /apenas nesta aba/);
  store.reset(); assert.equal(store.snapshot().orders[0].status, 'pendente');
  assert.match(createStore(undefined, { now: clock }).warning(), /ler/);
});
test('estado corrompido ou incompatível recebe cenário limpo sem falhar', () => {
  for (const corrupt of ['{', '{"version":1}', JSON.stringify({ ...seed(clock()), orders: [{ id: 'x' }] }), JSON.stringify({ ...seed(clock()), inventory: [{ id: 'x', name: 'Item', total: 1, available: 9 }] })]) {
    const storage = memory(); storage.setItem(STORAGE_KEY, corrupt);
    const store = createStore(storage, { now: clock });
    assert.deepEqual(store.snapshot(), seed(clock())); assert.match(store.warning(), /cenário fictício novo/);
  }
});
test('texto de usuário é escapado e CSV neutraliza fórmulas', () => {
  const payload = '<img src=x onerror="alert(1)">';
  assert.equal(escapeHTML(payload), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  assert.equal(escapeHTML("A&B's"), 'A&amp;B&#39;s');
  for (const value of ['=1+1', '+SUM(A1)', '-1+2', '@SUM(A1)', ' \t=1']) assert.ok(csvCell(value).startsWith('"\''));
  assert.equal(csvCell('Texto "fictício"'), '"Texto ""fictício"""');
  const { store } = setup();
  const order = store.saveOrder({ ...orderInput(), event: payload });
  assert.equal(order.event, payload);
});
