'use strict';
const { STATUSES, createStore, relativeDate, parseMoney, escapeHTML: esc, csvCell } = DemoCore;
let storage;
try { storage = window.localStorage; } catch { storage = null; }
const store = createStore(storage);
const main = document.getElementById('main');
const modal = document.getElementById('modal');
const content = document.getElementById('modal-content');
let page = 'dashboard', orderView = 'kanban', toastTimer;
const filters = { query: '', status: '', start: '', end: '' };
const money = cents => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
const shortDate = value => value ? new Intl.DateTimeFormat('pt-BR').format(new Date(`${value.slice(0, 10)}T12:00:00`)) : '—';
const dateTime = value => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
const moneyInput = cents => (cents / 100).toFixed(2).replace('.', ',');
const statusOptions = selected => Object.entries(STATUSES).map(([value, label]) => `<option value="${value}"${selected === value ? ' selected' : ''}>${label}</option>`).join('');
const badge = (status, label) => `<span class="badge ${esc(status)}">${esc(label ?? STATUSES[status] ?? status)}</span>`;
const button = (label, action, id = '', primary = false) => `<button type="button" class="${primary ? 'btn-topo btn-primario' : 'small-button'}" data-action="${action}" data-id="${esc(id)}">${label}</button>`;
const empty = text => `<div class="empty">${text}</div>`;
function showToast(message, error = false) {
  const box = document.getElementById('toast');
  clearTimeout(toastTimer); box.textContent = message; box.className = `toast${error ? ' error' : ''}`;
  toastTimer = setTimeout(() => box.classList.add('hidden'), 6500);
}
function heading(title, subtitle, actions = '') { return `<div class="page-heading"><div><h2>${title}</h2><p>${subtitle}</p></div><div class="actions">${actions}</div></div>`; }
function metric(label, value, monetary = false) { return `<div class="resumo-card"><span class="resumo-label">${label}</span><strong${monetary ? ' class="money"' : ''}>${esc(value)}</strong></div>`; }
function table(headers, rows) { return `<div class="table-wrap"><table><thead><tr>${headers.map(label => `<th scope="col">${label}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.join('') : `<tr><td colspan="${headers.length}">${empty('Nenhum registro encontrado.')}</td></tr>`}</tbody></table></div>`; }
function getOrders(state) {
  const query = filters.query.toLocaleLowerCase('pt-BR');
  return state.orders.filter(order => (!filters.status || order.status === filters.status) && (!filters.start || order.date >= filters.start) && (!filters.end || order.date <= filters.end) && (!query || [order.number, order.event, order.client, order.location, order.materials].join(' ').toLocaleLowerCase('pt-BR').includes(query))).sort((a, b) => a.date.localeCompare(b.date));
}
function dashboard(state) {
  const active = state.orders.filter(order => !['executado', 'recusado'].includes(order.status));
  const opened = state.payments.filter(item => item.status === 'aberto');
  const paid = state.payments.filter(item => item.status === 'pago');
  const next = active.slice().sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
  return heading('Visão geral', 'Uma operação de eventos inteiramente fictícia, pronta para explorar.', button('+ Nova OS', 'new-order', '', true)) +
    `<section class="cards-resumo" aria-label="Indicadores">${metric('Ordens em andamento', active.length)}${metric('Contratos ativos', state.contracts.filter(item => item.status === 'ativo').length)}${metric('A receber', money(opened.reduce((sum, item) => sum + item.valueCents, 0)), true)}${metric('Recebido', money(paid.reduce((sum, item) => sum + item.valueCents, 0)), true)}</section>` +
    `<div class="dashboard-grid"><section class="panel"><h3>Agenda de eventos</h3>${next.map(order => `<div class="event-row"><div><strong>${esc(order.event)}</strong><p>${esc(order.number)} · ${shortDate(order.date)} · ${esc(order.client)}</p></div>${button('Ver OS', 'details-order', order.id)}</div>`).join('') || empty('Sem eventos em andamento.')}</section><section class="panel"><h3>Ordens por status</h3>${Object.entries(STATUSES).map(([status, label]) => { const count = state.orders.filter(order => order.status === status).length; return `<div class="status-row"><span>${label}</span><div class="status-track"><div class="status-fill" style="width:${Math.round(count / Math.max(state.orders.length, 1) * 100)}%"></div></div><strong>${count}</strong></div>`; }).join('')}<p class="notice">Experimente cadastrar uma OS, movimentar um item e registrar um recebimento. Os indicadores acompanham suas alterações.</p></section></div>`;
}
function orders(state) {
  const rows = getOrders(state);
  const controls = `<div class="filters"><label>Buscar OS<input id="search-orders" data-filter="query" type="search" placeholder="Evento, cliente ou número" value="${esc(filters.query)}"></label><label>Status<select id="filter-status" data-filter="status"><option value="">Todos os status</option>${statusOptions(filters.status)}</select></label><label>De<input id="filter-start" data-filter="start" type="date" value="${esc(filters.start)}"></label><label>Até<input id="filter-end" data-filter="end" type="date" value="${esc(filters.end)}"></label>${button('Limpar', 'clear-filters')}<div class="actions"><button type="button" class="small-button tab-button" data-action="view-kanban" aria-pressed="${orderView === 'kanban'}">Kanban</button><button type="button" class="small-button tab-button" data-action="view-list" aria-pressed="${orderView === 'list'}">Lista</button></div></div>`;
  const statusSelect = order => `<select data-status-id="${esc(order.id)}" aria-label="Alterar status de ${esc(order.number)}">${statusOptions(order.status)}</select>`;
  let body;
  if (orderView === 'list') body = table(['OS / Evento', 'Cliente', 'Data', 'Orçamento', 'Status', 'Ações'], rows.map(order => `<tr><td><strong>${esc(order.number)}</strong><span>${esc(order.event)}</span></td><td>${esc(order.client)}</td><td>${shortDate(order.date)}</td><td class="money">${money(order.budgetCents)}</td><td>${statusSelect(order)}</td><td><div class="actions">${button('Ver', 'details-order', order.id)}${button('Editar', 'edit-order', order.id)}</div></td></tr>`));
  else body = `<div class="kanban" aria-label="Quadro de ordens por status">${Object.entries(STATUSES).map(([status, label]) => { const group = rows.filter(order => order.status === status); return `<section class="coluna"><div class="coluna-topo"><h3>${label}</h3>${badge(status, group.length)}</div>${group.map(order => `<article class="order-card"><span class="muted">${esc(order.number)}</span><h4>${esc(order.event)}</h4><p>${esc(order.client)}</p><p>${shortDate(order.date)} · ${esc(order.location)}</p><strong class="money">${money(order.budgetCents)}</strong>${statusSelect(order)}<div class="actions">${button('Detalhes', 'details-order', order.id)}${button('Editar', 'edit-order', order.id)}</div></article>`).join('') || empty('Nenhuma OS')}</section>`; }).join('')}</div>`;
  return heading('Ordens de serviço', `${rows.length} de ${state.orders.length} ordens · mova uma OS pelo seletor de status.`, button('Exportar CSV', 'export') + button('+ Nova OS', 'new-order', '', true)) + controls + body;
}
function paymentStatus(item) { return item.status === 'pago' ? badge('pago', 'Pago') : item.due < relativeDate(0) ? badge('atrasado', 'Em atraso') : badge('aberto', 'Em aberto'); }
function finance(state) {
  const opened = state.payments.filter(item => item.status === 'aberto');
  const overdue = opened.filter(item => item.due < relativeDate(0));
  return heading('Financeiro', 'Recebimentos de serviços fictícios. Registrar pagamento é uma simulação local.', button('Exportar CSV', 'export') + button('+ Novo lançamento', 'new-payment', '', true)) +
    `<section class="cards-resumo">${metric('Em aberto', money(opened.reduce((sum, item) => sum + item.valueCents, 0)), true)}${metric('Em atraso', money(overdue.reduce((sum, item) => sum + item.valueCents, 0)), true)}${metric('Recebido', money(state.payments.filter(item => item.status === 'pago').reduce((sum, item) => sum + item.valueCents, 0)), true)}${metric('Lançamentos', state.payments.length)}</section>` +
    table(['Descrição / Cliente', 'OS', 'Vencimento', 'Valor', 'Situação', 'Ações'], state.payments.slice().sort((a, b) => a.due.localeCompare(b.due)).map(item => `<tr><td><strong>${esc(item.description)}</strong><p class="muted">${esc(item.client)}</p></td><td>${esc(state.orders.find(order => order.id === item.orderId)?.number || 'Sem vínculo')}</td><td>${shortDate(item.due)}</td><td class="money">${money(item.valueCents)}</td><td>${paymentStatus(item)}${item.status === 'pago' ? `<p class="muted">${shortDate(item.paidAt)}</p>` : ''}</td><td><div class="actions">${item.status === 'aberto' ? button('Registrar pagamento', 'pay', item.id) + button('Editar', 'edit-payment', item.id) : '<span class="muted">Pagamento registrado</span>'}</div></td></tr>`));
}
function contracts(state) {
  return heading('Contratos', 'Acordos de exemplo sem validade ou partes reais.', button('Exportar CSV', 'export') + button('+ Novo contrato', 'new-contract', '', true)) + table(['Contrato / Cliente', 'Vigência', 'Valor', 'Status', 'Ações'], state.contracts.map(item => `<tr><td><strong>${esc(item.title)}</strong><p class="muted">${esc(item.client)}</p></td><td>${shortDate(item.start)} a ${shortDate(item.end)}</td><td class="money">${money(item.valueCents)}</td><td>${badge(item.status, item.status === 'ativo' ? 'Ativo' : 'Encerrado')}</td><td><div class="actions">${button('Editar', 'edit-contract', item.id)}${button('Documento de exemplo', 'document-contract', item.id)}</div></td></tr>`));
}
function inventory(state) {
  const available = state.inventory.reduce((sum, item) => sum + item.available, 0);
  return heading('Estoque', 'Saídas reduzem o disponível; devoluções repõem o que está em uso.', button('Exportar CSV', 'export') + button('+ Novo item', 'new-item', '', true)) +
    `<section class="cards-resumo">${metric('Tipos de item', state.inventory.length)}${metric('Unidades totais', state.inventory.reduce((sum, item) => sum + item.total, 0))}${metric('Disponíveis', available)}${metric('Em uso', state.inventory.reduce((sum, item) => sum + item.total - item.available, 0))}</section>` +
    table(['Item', 'Total', 'Disponível', 'Em uso', 'Ações'], state.inventory.map(item => `<tr><td><strong>${esc(item.name)}</strong></td><td>${item.total}</td><td>${item.available}</td><td>${item.total - item.available}</td><td><div class="actions">${button('Movimentar', 'move-item', item.id)}${button('Editar', 'edit-item', item.id)}</div></td></tr>`)) +
    `<section class="panel" style="margin-top:24px"><h3>Movimentações</h3>${table(['Data', 'Item', 'Tipo', 'Quantidade', 'Motivo'], state.movements.slice().sort((a, b) => b.date.localeCompare(a.date)).map(item => `<tr><td>${shortDate(item.date)}</td><td>${esc(state.inventory.find(row => row.id === item.itemId)?.name || 'Item')}</td><td>${({ entrada: 'Entrada', saida: 'Saída', devolucao: 'Devolução' })[item.direction]}</td><td>${item.quantity}</td><td>${esc(item.reason)}</td></tr>`))}</section>`;
}
function history(state) { return heading('Histórico', 'As ações realizadas nesta demonstração aparecem aqui.', button('Exportar CSV', 'export')) + table(['Quando', 'Ação', 'Detalhe'], state.history.map(item => `<tr><td>${dateTime(item.date)}</td><td><strong>${esc(item.action)}</strong></td><td>${esc(item.detail)}</td></tr>`)); }
function render() {
  const state = store.snapshot();
  const renderer = { dashboard, ordens: orders, financeiro: finance, contratos: contracts, estoque: inventory, historico: history };
  if (!Object.hasOwn(renderer, page)) page = 'dashboard';
  main.innerHTML = (store.warning() ? `<div class="storage-warning" role="status">${esc(store.warning())}</div>` : '') + renderer[page](state);
  document.querySelectorAll('[data-page]').forEach(link => { if (link.dataset.page === page) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); });
}
function openDialog(title, html) { document.getElementById('modal-title').textContent = title; content.innerHTML = html; if (!modal.open) modal.showModal(); }
function input(name, label, value = '', type = 'text', extra = '') { return `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra} required></label>`; }
function notes(name, label, value = '', limit = 2000) { return `<label class="full">${label}<textarea name="${name}" maxlength="${limit}">${esc(value)}</textarea></label>`; }
function form(type, id, fields, submit = 'Salvar') { return `<form data-form="${type}" data-id="${esc(id || '')}"><p class="dialog-note">Use somente informações fictícias. Nada é enviado para um servidor.</p><div class="form-grid">${fields}</div><p class="form-error" role="alert"></p><div class="form-actions">${button('Cancelar', 'close')}<button type="submit" class="btn-topo btn-primario">${submit}</button></div></form>`; }
function editOrder(id) {
  const data = store.snapshot();
  const item = id ? data.orders.find(order => order.id === id) : { number: `DEMO-${String(data.orders.length + 1).padStart(3, '0')}`, event: '', client: '', location: '', date: relativeDate(1), budgetCents: 0, status: 'pendente', materials: '', notes: '' };
  if (!item) throw new Error('OS não encontrada.');
  openDialog(id ? `Editar ${item.number}` : 'Nova ordem de serviço', form('order', id, input('number', 'Número da OS', item.number, 'text', 'maxlength="160"') + input('event', 'Nome do evento', item.event, 'text', 'maxlength="160"') + input('client', 'Cliente fictício', item.client, 'text', 'maxlength="160"') + input('location', 'Local fictício', item.location, 'text', 'maxlength="160"') + input('date', 'Data do evento', item.date, 'date') + input('budget', 'Orçamento (R$)', moneyInput(item.budgetCents), 'text', 'inputmode="decimal"') + `<label>Status<select name="status">${statusOptions(item.status)}</select></label>` + notes('materials', 'Materiais e serviços', item.materials, 1000) + notes('notes', 'Observações', item.notes)));
}
function editContract(id) {
  const item = id ? store.snapshot().contracts.find(row => row.id === id) : { title: '', client: '', valueCents: 0, start: relativeDate(0), end: relativeDate(180), status: 'ativo', notes: '' };
  if (!item) throw new Error('Contrato não encontrado.');
  openDialog(id ? 'Editar contrato' : 'Novo contrato', form('contract', id, input('title', 'Título', item.title, 'text', 'maxlength="160"') + input('client', 'Cliente fictício', item.client, 'text', 'maxlength="160"') + input('value', 'Valor (R$)', moneyInput(item.valueCents), 'text', 'inputmode="decimal"') + `<label>Status<select name="status"><option value="ativo"${item.status === 'ativo' ? ' selected' : ''}>Ativo</option><option value="encerrado"${item.status === 'encerrado' ? ' selected' : ''}>Encerrado</option></select></label>` + input('start', 'Início da vigência', item.start, 'date') + input('end', 'Fim da vigência', item.end, 'date') + notes('notes', 'Observações', item.notes)));
}
function editInventory(id) {
  const item = id ? store.snapshot().inventory.find(row => row.id === id) : { name: '', total: 1 };
  if (!item) throw new Error('Item não encontrado.');
  openDialog(id ? 'Editar item' : 'Novo item de estoque', form('item', id, input('name', 'Nome do item', item.name, 'text', 'maxlength="160"') + input('total', 'Quantidade total', item.total, 'number', 'min="0" max="1000000" step="1"')));
}
function moveInventory(id) {
  const item = store.snapshot().inventory.find(row => row.id === id);
  if (!item) throw new Error('Item não encontrado.');
  openDialog('Movimentar estoque', form('movement', id, `<p class="dialog-note full"><strong>${esc(item.name)}</strong><br>${item.available} disponíveis · ${item.total - item.available} em uso</p><label>Tipo<select name="direction"><option value="saida">Saída para uso</option><option value="devolucao">Devolução ao estoque</option><option value="entrada">Entrada de novas unidades</option></select></label>` + input('quantity', 'Quantidade', 1, 'number', 'min="1" max="1000000" step="1"') + input('date', 'Data', relativeDate(0), 'date') + input('reason', 'Motivo fictício', '', 'text', 'maxlength="160"'), 'Registrar movimentação'));
}
function editPayment(id) {
  const data = store.snapshot();
  const item = id ? data.payments.find(row => row.id === id) : { description: '', client: '', orderId: '', valueCents: 0, due: relativeDate(7) };
  if (!item || item.status === 'pago') throw new Error('Este lançamento não pode ser editado.');
  openDialog(id ? 'Editar lançamento' : 'Novo lançamento', form('payment', id, input('description', 'Descrição fictícia', item.description, 'text', 'maxlength="160"') + input('client', 'Cliente fictício', item.client, 'text', 'maxlength="160"') + input('value', 'Valor (R$)', moneyInput(item.valueCents), 'text', 'inputmode="decimal"') + input('due', 'Vencimento', item.due, 'date') + `<label class="full">Vincular à OS (opcional)<select name="orderId"><option value="">Sem vínculo</option>${data.orders.map(order => `<option value="${esc(order.id)}"${item.orderId === order.id ? ' selected' : ''}>${esc(order.number)} · ${esc(order.event)}</option>`).join('')}</select></label>`));
}
function pay(id) {
  const item = store.snapshot().payments.find(row => row.id === id);
  if (!item) throw new Error('Lançamento não encontrado.');
  openDialog('Registrar pagamento simulado', form('pay', id, `<p class="dialog-note full">${esc(item.description)}<br><strong>${money(item.valueCents)}</strong><br>Esta ação não movimenta dinheiro real.</p>` + input('paidAt', 'Data do recebimento', relativeDate(0), 'date', `max="${relativeDate(0)}"`), 'Confirmar pagamento fictício'));
}
function orderDetails(id) {
  const order = store.snapshot().orders.find(row => row.id === id);
  if (!order) throw new Error('OS não encontrada.');
  const detail = `<dl class="detail-grid"><div><dt>Número</dt><dd>${esc(order.number)}</dd></div><div><dt>Status</dt><dd>${STATUSES[order.status]}</dd></div><div><dt>Evento fictício</dt><dd>${esc(order.event)}</dd></div><div><dt>Cliente fictício</dt><dd>${esc(order.client)}</dd></div><div><dt>Data</dt><dd>${shortDate(order.date)}</dd></div><div><dt>Local fictício</dt><dd>${esc(order.location)}</dd></div><div><dt>Orçamento</dt><dd>${money(order.budgetCents)}</dd></div><div class="full"><dt>Materiais e serviços</dt><dd>${esc(order.materials || 'Não informados')}</dd></div><div class="full"><dt>Observações</dt><dd>${esc(order.notes || 'Sem observações')}</dd></div></dl>`;
  openDialog(`OS ${order.number}`, `<p class="dialog-note">Documento demonstrativo, sem validade.</p>${detail}<div class="form-actions">${button('Fechar', 'close')}${button('Imprimir exemplo', 'print-order', id)}</div>`);
}
function printDocument(title, body) {
  document.getElementById('print-area').innerHTML = `<div class="print-stamp">DEMONSTRAÇÃO — DADOS FICTÍCIOS — SEM VALIDADE</div><h1>${esc(title)}</h1>${body}<p>Documento gerado localmente para demonstrar funcionalidades.</p>`;
  if (modal.open) modal.close();
  window.print();
}
function contractDocument(id) {
  const item = store.snapshot().contracts.find(row => row.id === id);
  if (!item) throw new Error('Contrato não encontrado.');
  const html = `<p class="notice">EXEMPLO FICTÍCIO, SEM VALIDADE. Este documento não representa acordo, prestação de serviço ou compromisso real.</p><dl class="detail-grid"><div><dt>Objeto demonstrativo</dt><dd>${esc(item.title)}</dd></div><div><dt>Parte fictícia</dt><dd>${esc(item.client)}</dd></div><div><dt>Valor fictício</dt><dd>${money(item.valueCents)}</dd></div><div><dt>Vigência demonstrativa</dt><dd>${shortDate(item.start)} a ${shortDate(item.end)}</dd></div><div class="full"><dt>Observações</dt><dd>${esc(item.notes || 'Sem observações')}</dd></div></dl>`;
  openDialog('Documento fictício de contrato', html + `<div class="form-actions">${button('Fechar', 'close')}${button('Imprimir exemplo', 'print-contract', id)}</div>`);
}
function exportCSV() {
  const state = store.snapshot();
  const config = {
    ordens: { headers: ['Número', 'Evento fictício', 'Cliente fictício', 'Data', 'Status', 'Orçamento (R$)'], rows: getOrders(state).map(item => [item.number, item.event, item.client, item.date, STATUSES[item.status], moneyInput(item.budgetCents)]) },
    financeiro: { headers: ['Descrição fictícia', 'Cliente fictício', 'Vencimento', 'Valor (R$)', 'Status', 'Data do pagamento'], rows: state.payments.map(item => [item.description, item.client, item.due, moneyInput(item.valueCents), item.status, item.paidAt]) },
    contratos: { headers: ['Título fictício', 'Cliente fictício', 'Valor (R$)', 'Início', 'Fim', 'Status'], rows: state.contracts.map(item => [item.title, item.client, moneyInput(item.valueCents), item.start, item.end, item.status]) },
    estoque: { headers: ['Item', 'Total', 'Disponível', 'Em uso'], rows: state.inventory.map(item => [item.name, item.total, item.available, item.total - item.available]) },
    historico: { headers: ['Data', 'Ação', 'Detalhe'], rows: state.history.map(item => [item.date, item.action, item.detail]) }
  }[page];
  if (!config) return;
  const csv = '\uFEFF' + [config.headers, ...config.rows].map(row => row.map(csvCell).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `demonstracao-${page}.csv`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('CSV fictício exportado.');
}
const actions = {
  close: () => modal.close(), 'new-order': () => editOrder(), 'edit-order': editOrder, 'details-order': orderDetails,
  'new-contract': () => editContract(), 'edit-contract': editContract, 'document-contract': contractDocument,
  'new-item': () => editInventory(), 'edit-item': editInventory, 'move-item': moveInventory,
  'new-payment': () => editPayment(), 'edit-payment': editPayment, pay,
  'view-kanban': () => { orderView = 'kanban'; render(); }, 'view-list': () => { orderView = 'list'; render(); },
  'clear-filters': () => { Object.assign(filters, { query: '', status: '', start: '', end: '' }); render(); },
  export: exportCSV,
  'print-order': id => { orderDetails(id); printDocument(document.getElementById('modal-title').textContent, content.querySelector('dl').outerHTML); },
  'print-contract': id => { contractDocument(id); printDocument('Contrato fictício de demonstração', content.querySelector('dl').outerHTML); },
  reset: () => openDialog('Restaurar demonstração?', `<p>As alterações feitas neste navegador serão substituídas por um cenário fictício novo. Outros sites não serão afetados.</p><div class="form-actions">${button('Cancelar', 'close')}${button('Restaurar dados fictícios', 'confirm-reset', '', true)}</div>`),
  'confirm-reset': () => { store.reset(); Object.assign(filters, { query: '', status: '', start: '', end: '' }); modal.close(); render(); showToast(store.warning() || 'Demonstração restaurada.'); }
};
document.addEventListener('click', event => {
  const target = event.target.closest('[data-action]');
  if (!target || !Object.hasOwn(actions, target.dataset.action)) return;
  try { actions[target.dataset.action](target.dataset.id); } catch (error) { showToast(error.message, true); }
});
document.addEventListener('submit', event => {
  const element = event.target.closest('form[data-form]');
  if (!element) return;
  event.preventDefault();
  const data = Object.fromEntries(new FormData(element));
  const id = element.dataset.id;
  try {
    if (element.dataset.form === 'order') store.saveOrder({ ...data, id, budgetCents: parseMoney(data.budget) });
    if (element.dataset.form === 'contract') store.saveContract({ ...data, id, valueCents: parseMoney(data.value) });
    if (element.dataset.form === 'item') store.saveInventory({ ...data, id, total: Number(data.total) });
    if (element.dataset.form === 'movement') store.moveStock({ ...data, itemId: id, quantity: Number(data.quantity) });
    if (element.dataset.form === 'payment') store.savePayment({ ...data, id, valueCents: parseMoney(data.value) });
    if (element.dataset.form === 'pay') store.payPayment(id, data.paidAt);
    modal.close(); render(); showToast(store.warning() || 'Alteração salva nesta demonstração.');
  } catch (error) { element.querySelector('.form-error').textContent = error.message; }
});
document.addEventListener('change', event => {
  if (!event.target.matches('[data-status-id]')) return;
  try { store.setOrderStatus(event.target.dataset.statusId, event.target.value); render(); showToast(store.warning() || 'Status da OS atualizado.'); }
  catch (error) { render(); showToast(error.message, true); }
});
document.addEventListener('input', event => {
  const element = event.target;
  if (!element.dataset.filter) return;
  filters[element.dataset.filter] = element.value;
  const { selectionStart, selectionEnd, id } = element;
  render(); const replacement = document.getElementById(id); replacement?.focus();
  if (selectionStart !== null && replacement?.setSelectionRange) replacement.setSelectionRange(selectionStart, selectionEnd);
});
document.getElementById('reset-button').addEventListener('click', actions.reset);
document.getElementById('theme-button').addEventListener('click', event => {
  const dark = document.body.classList.toggle('dark'); event.target.textContent = dark ? 'Tema claro' : 'Tema escuro'; event.target.setAttribute('aria-pressed', String(dark));
});
function route() { const hash = location.hash.slice(1); page = ['dashboard', 'ordens', 'financeiro', 'contratos', 'estoque', 'historico'].includes(hash) ? hash : 'dashboard'; render(); }
window.addEventListener('hashchange', route);
route();
