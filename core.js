(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DemoCore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const STORAGE_KEY = 'ordens-servico-demo.state.v1';
  const STATUSES = { pendente: 'Pendente', autorizado: 'Autorizada', em_execucao: 'Em execução', na_rua: 'Na rua', executado: 'Executada', recusado: 'Recusada' };
  const clone = value => JSON.parse(JSON.stringify(value));
  const localDate = value => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  function relativeDate(offset, now = new Date()) {
    const value = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, 12);
    return localDate(value);
  }
  function text(value, label, optional = false, limit = 160) {
    if (typeof value !== 'string') throw new Error(`${label}: informe um texto.`);
    const result = value.trim();
    if ((!optional && !result) || result.length > limit) throw new Error(`${label}: use ${optional ? 'até' : 'de 1 a'} ${limit} caracteres.`);
    return result;
  }
  function date(value, label) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label}: data inválida.`);
    const parsed = new Date(`${value}T12:00:00`);
    if (Number.isNaN(parsed.getTime()) || localDate(parsed) !== value || value < '2000-01-01' || value > '2100-12-31') throw new Error(`${label}: data inválida.`);
    return value;
  }
  function integer(value, label, minimum = 0) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > 1000000000000) throw new Error(`${label}: valor inválido.`);
    return value;
  }
  function parseMoney(value) {
    if (typeof value !== 'string' || !/^\d{1,10}(?:[.,]\d{1,2})?$/.test(value.trim())) throw new Error('Valor: use um número positivo com até duas casas decimais, sem separador de milhar.');
    const [whole, fraction = ''] = value.trim().replace(',', '.').split('.');
    return integer(Number(whole) * 100 + Number(fraction.padEnd(2, '0')), 'Valor');
  }
  function seed(now = new Date()) {
    const clients = ['Cliente Horizonte — fictício', 'Cliente Aurora — fictício', 'Cliente Prisma — fictício'];
    const events = ['Encontro de ideias', 'Festival das cores', 'Mostra de projetos', 'Jornada de inovação', 'Celebração de talentos', 'Feira de experiências', 'Seminário de criação', 'Oficina de cenários'];
    const statuses = ['pendente', 'autorizado', 'em_execucao', 'na_rua', 'executado', 'recusado', 'pendente', 'executado'];
    const orders = events.map((event, i) => ({ id: `os-${i + 1}`, number: `DEMO-${String(i + 1).padStart(3, '0')}`, client: clients[i % 3], event, location: `Espaço ${['Céu', 'Jardim', 'Luz'][i % 3]} — fictício`, date: relativeDate(i - 3, now), status: statuses[i], budgetCents: [1250000, 850000, 640000, 920000, 1580000, 320000, 480000, 760000][i], notes: 'Exemplo inteiramente fictício para explorar a demonstração.', materials: ['Painel cenográfico e iluminação', 'Sonorização e estruturas', 'Mobiliário e apoio técnico'][i % 3] }));
    return {
      version: 1,
      orders,
      contracts: [
        { id: 'contract-1', title: 'Produção de encontros', client: clients[0], valueCents: 25000000, start: relativeDate(-60, now), end: relativeDate(300, now), status: 'ativo', notes: 'Contrato de exemplo, sem validade.' },
        { id: 'contract-2', title: 'Estruturas para experiências', client: clients[1], valueCents: 18000000, start: relativeDate(-15, now), end: relativeDate(165, now), status: 'ativo', notes: 'Valores e partes fictícios.' },
        { id: 'contract-3', title: 'Cenografia experimental', client: clients[2], valueCents: 9000000, start: relativeDate(-300, now), end: relativeDate(-5, now), status: 'encerrado', notes: 'Cenário histórico de demonstração.' }
      ],
      inventory: [ { id: 'item-1', name: 'Módulo de painel', total: 40, available: 32 }, { id: 'item-2', name: 'Caixa de som', total: 16, available: 12 }, { id: 'item-3', name: 'Refletor de LED', total: 24, available: 24 }, { id: 'item-4', name: 'Estrutura modular', total: 12, available: 8 } ],
      movements: [ { id: 'move-1', itemId: 'item-1', direction: 'saida', quantity: 8, reason: 'Montagem demonstrativa', date: relativeDate(-1, now) }, { id: 'move-2', itemId: 'item-2', direction: 'saida', quantity: 4, reason: 'Evento demonstrativo', date: relativeDate(-1, now) }, { id: 'move-3', itemId: 'item-4', direction: 'saida', quantity: 4, reason: 'Montagem demonstrativa', date: relativeDate(-2, now) } ],
      payments: orders.slice(0, 6).map((order, i) => ({ id: `payment-${i + 1}`, orderId: order.id, description: `Serviços — ${order.event}`, client: order.client, valueCents: order.budgetCents, due: relativeDate(i * 4 - 8, now), status: i === 4 ? 'pago' : 'aberto', paidAt: i === 4 ? relativeDate(-2, now) : '' })),
      history: [ { id: 'history-initial', date: now.toISOString(), action: 'Demonstração iniciada', detail: 'Cenário fictício criado para este navegador.' } ]
    };
  }
  function escapeHTML(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
  function csvCell(value) {
    const raw = String(value ?? '');
    return '"' + (/^[\s]*[=+\-@\t\r]/.test(raw) ? "'" : '') + raw.replace(/"/g, '""') + '"';
  }
  function validState(value) {
    if (!value || value.version !== 1 || !['orders', 'contracts', 'inventory', 'movements', 'payments', 'history'].every(key => Array.isArray(value[key]) && value[key].length <= 5000 && value[key].every(item => item && typeof item === 'object' && typeof item.id === 'string'))) return false;
    try {
      value.orders.forEach(item => { text(item.number, 'Número'); text(item.event, 'Evento'); text(item.client, 'Cliente'); text(item.location, 'Local'); date(item.date, 'Data'); integer(item.budgetCents, 'Orçamento'); text(item.notes, 'Notas', true, 2000); text(item.materials, 'Materiais', true, 1000); if (!Object.hasOwn(STATUSES, item.status)) throw new Error(); });
      value.contracts.forEach(item => { text(item.title, 'Título'); text(item.client, 'Cliente'); integer(item.valueCents, 'Valor'); date(item.start, 'Início'); date(item.end, 'Fim'); if (item.end < item.start || !['ativo', 'encerrado'].includes(item.status)) throw new Error(); text(item.notes, 'Notas', true, 2000); });
      value.inventory.forEach(item => { text(item.name, 'Item'); integer(item.total, 'Total'); integer(item.available, 'Disponível'); if (item.available > item.total) throw new Error(); });
      value.payments.forEach(item => { text(item.description, 'Descrição'); text(item.client, 'Cliente'); integer(item.valueCents, 'Valor', 1); date(item.due, 'Vencimento'); if (!['pago', 'aberto'].includes(item.status)) throw new Error(); if (item.status === 'pago') date(item.paidAt, 'Pagamento'); });
      value.movements.forEach(item => { integer(item.quantity, 'Quantidade', 1); date(item.date, 'Data'); if (!['entrada', 'saida', 'devolucao'].includes(item.direction)) throw new Error(); text(item.reason, 'Motivo'); });
      value.history.forEach(item => { text(item.action, 'Ação'); text(item.detail, 'Detalhe', false, 500); if (!Number.isFinite(Date.parse(item.date))) throw new Error(); });
      return true;
    } catch { return false; }
  }
  function createStore(storage, options = {}) {
    const now = options.now || (() => new Date());
    let state = seed(now()), warning = '', sequence = 0;
    try {
      if (!storage) throw new Error('Armazenamento indisponível');
      const raw = storage.getItem(STORAGE_KEY);
      if (raw) {
        const loaded = JSON.parse(raw);
        if (!validState(loaded)) throw new Error('Estado inválido');
        state = loaded;
      }
    } catch { warning = 'Não foi possível ler o estado local. Um cenário fictício novo foi aberto.'; }
    function id(prefix) { sequence++; return `${prefix}-${now().getTime()}-${sequence}-${Math.random().toString(36).slice(2, 8)}`; }
    function persist() {
      try {
        if (!storage) throw new Error('Sem armazenamento');
        storage.setItem(STORAGE_KEY, JSON.stringify(state));
        warning = '';
      } catch { warning = 'Armazenamento indisponível. Alterações ficam apenas nesta aba e serão perdidas ao recarregar.'; }
    }
    function log(action, detail) { state.history.unshift({ id: id('history'), date: now().toISOString(), action, detail }); }
    function find(collection, entityId) {
      const item = state[collection].find(row => row.id === entityId);
      if (!item) throw new Error('Registro não encontrado. Atualize a tela.');
      return item;
    }
    function save(collection, item, action) {
      if (item.id) {
        const index = state[collection].findIndex(row => row.id === item.id);
        if (index < 0) throw new Error('Registro não encontrado.');
        state[collection][index] = item;
      } else { item.id = id(collection); state[collection].push(item); }
      log(action, item.number || item.title || item.name || item.description);
      persist();
      return clone(item);
    }
    return {
      snapshot: () => clone(state),
      warning: () => warning,
      reset() { state = seed(now()); persist(); return clone(state); },
      saveOrder(input) {
        const item = { id: input.id || '', number: text(input.number, 'Número'), event: text(input.event, 'Evento'), client: text(input.client, 'Cliente'), location: text(input.location, 'Local'), date: date(input.date, 'Data do evento'), status: input.status, budgetCents: integer(input.budgetCents, 'Orçamento'), materials: text(input.materials || '', 'Materiais', true, 1000), notes: text(input.notes || '', 'Observações', true, 2000) };
        if (!Object.hasOwn(STATUSES, item.status)) throw new Error('Status inválido.');
        if (state.orders.some(row => row.id !== item.id && row.number.toLowerCase() === item.number.toLowerCase())) throw new Error('Já existe uma OS com este número.');
        return save('orders', item, input.id ? 'OS editada' : 'OS criada');
      },
      setOrderStatus(entityId, status) {
        if (!Object.hasOwn(STATUSES, status)) throw new Error('Status inválido.');
        const item = find('orders', entityId);
        if (item.status !== status) { item.status = status; log('Status da OS alterado', `${item.number}: ${STATUSES[status]}`); persist(); }
      },
      saveContract(input) {
        const item = { id: input.id || '', title: text(input.title, 'Título'), client: text(input.client, 'Cliente'), valueCents: integer(input.valueCents, 'Valor', 1), start: date(input.start, 'Início'), end: date(input.end, 'Fim'), status: input.status, notes: text(input.notes || '', 'Observações', true, 2000) };
        if (item.end < item.start) throw new Error('O fim do contrato deve ser igual ou posterior ao início.');
        if (!['ativo', 'encerrado'].includes(item.status)) throw new Error('Status inválido.');
        return save('contracts', item, input.id ? 'Contrato editado' : 'Contrato criado');
      },
      saveInventory(input) {
        const total = integer(input.total, 'Quantidade total');
        const old = input.id ? find('inventory', input.id) : null;
        const inUse = old ? old.total - old.available : 0;
        if (total < inUse) throw new Error('O total não pode ser menor que a quantidade em uso.');
        const item = { id: input.id || '', name: text(input.name, 'Nome do item'), total, available: total - inUse };
        return save('inventory', item, old ? 'Item de estoque editado' : 'Item de estoque criado');
      },
      moveStock(input) {
        const item = find('inventory', input.itemId);
        const quantity = integer(input.quantity, 'Quantidade', 1);
        const reason = text(input.reason, 'Motivo');
        const moveDate = date(input.date, 'Data da movimentação');
        if (!['entrada', 'saida', 'devolucao'].includes(input.direction)) throw new Error('Tipo de movimentação inválido.');
        if (input.direction === 'saida' && quantity > item.available) throw new Error('Quantidade indisponível no estoque.');
        if (input.direction === 'devolucao' && quantity > item.total - item.available) throw new Error('A devolução excede a quantidade em uso.');
        if (input.direction === 'entrada') { integer(item.total + quantity, 'Total'); item.total += quantity; item.available += quantity; }
        else item.available += input.direction === 'saida' ? -quantity : quantity;
        state.movements.unshift({ id: id('move'), itemId: item.id, direction: input.direction, quantity, reason, date: moveDate });
        log('Estoque movimentado', `${item.name}: ${input.direction}, ${quantity} unidade(s)`);
        persist();
      },
      savePayment(input) {
        const previous = input.id ? find('payments', input.id) : null;
        if (previous?.status === 'pago') throw new Error('O lançamento já pago não pode ser editado.');
        const orderId = input.orderId || '';
        if (orderId) find('orders', orderId);
        const item = { id: input.id || '', orderId, description: text(input.description, 'Descrição'), client: text(input.client, 'Cliente'), valueCents: integer(input.valueCents, 'Valor', 1), due: date(input.due, 'Vencimento'), status: 'aberto', paidAt: '' };
        return save('payments', item, input.id ? 'Lançamento editado' : 'Lançamento criado');
      },
      payPayment(entityId, paidAt) {
        const item = find('payments', entityId);
        const value = date(paidAt, 'Data do pagamento');
        if (value > relativeDate(0, now())) throw new Error('O pagamento não pode ter data futura.');
        if (item.status === 'pago') throw new Error('Este lançamento já foi pago.');
        item.status = 'pago'; item.paidAt = value;
        log('Pagamento simulado', `${item.description}: ${item.valueCents} centavos`);
        persist();
      }
    };
  }
  return { STORAGE_KEY, STATUSES, seed, createStore, parseMoney, relativeDate, escapeHTML, csvCell, validState };
});
