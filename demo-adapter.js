(function () {
  'use strict';
  let storage;
  try { storage = localStorage; } catch { storage = null; }
  const fallback = new Map();
  const safeStorage = {
    getItem(key) { try { return storage?.getItem(key) ?? fallback.get(key) ?? null; } catch { return fallback.get(key) ?? null; } },
    setItem(key, value) { fallback.set(key, String(value)); try { storage?.setItem(key, String(value)); } catch { /* O estado de interface permanece em memória. */ } },
    removeItem(key) { fallback.delete(key); try { storage?.removeItem(key); } catch { /* O estado de interface permanece em memória. */ } },
    key(index) { try { return storage?.key(index) ?? [...fallback.keys()][index] ?? null; } catch { return [...fallback.keys()][index] ?? null; } },
    get length() { try { return storage?.length ?? fallback.size; } catch { return fallback.size; } }
  };
  try { Object.defineProperty(window, 'localStorage', { configurable: true, value: safeStorage }); } catch { /* Navegadores que protegem esta propriedade mantêm o armazenamento original. */ }
  const engine = DemoOS.createEngine({ storage });
  const requests = [], errors = [];
  const channels = new Set();
  const originalFetch = window.fetch.bind(window), originalOpen = window.open.bind(window);
  const relatorios = DemoRelatorios.create(ExcelJS);
  const mimeXlsx = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  function idsFrom(query) { return [...query.getAll('ids'), ...(query.get('ids') || '').split(',')].filter(Boolean); }
  function selected(rows, query, body = {}) {
    const ids = Array.isArray(body.ids) ? body.ids : idsFrom(query);
    let result = rows;
    if (ids.length) result = result.filter(row => ids.includes(row.id));
    const mode = body.modo || query.get('modo');
    for (const key of ['orgao', 'status', 'cliente', 'numeroOS', 'competencia', 'empresa', 'pagamento', 'acao', 'responsavel']) {
      const value = body[key] || query.get(key);
      if (value) result = result.filter(row => DemoOS.normal(row[key === 'status' && row.statusCalculado ? 'statusCalculado' : key]) === DemoOS.normal(value));
    }
    if (body.ano || query.get('ano')) result = result.filter(row => String(row.anoEvento) === String(body.ano || query.get('ano')));
    if (mode === 'abertos') result = result.filter(row => row.pagamento !== 'CONFIRMADO');
    if (mode === 'confirmados') result = result.filter(row => row.pagamento === 'CONFIRMADO');
    if (mode === 'vencimentos' || query.get('aba') === 'vencimentos') result = result.filter(row => row.diasParaVencimento !== null && row.diasParaVencimento <= 90);
    const clients = body.clientes || query.getAll('clientes');
    if (clients.length) result = result.filter(row => clients.includes(row.cliente || row.razaoSocial));
    const initial = body.dataInicial || query.get('dataInicial'), final = body.dataFinal || query.get('dataFinal');
    const dateKey = query.get('tipoData') === 'pagamento' ? 'dataPagamento' : rows[0]?.modulo ? 'data' : rows[0]?.emissao !== undefined ? 'emissao' : 'dataEvento';
    if (initial) result = result.filter(row => String(row[dateKey] || row.dataInicioEvento || '').slice(0, 10) >= initial);
    if (final) result = result.filter(row => String(row[dateKey] || row.dataInicioEvento || '').slice(0, 10) <= final);
    const queryText = body.busca || query.get('busca'), field = body.campoBusca || query.get('campoBusca');
    if (queryText) result = result.filter(row => DemoOS.normal(field && field !== 'todos' ? row[field] : Object.values(row).filter(value => typeof value === 'string').join(' ')).includes(DemoOS.normal(queryText)));
    return result;
  }
  function asBytes(value) { return Uint8Array.from(atob(value), character => character.charCodeAt(0)); }
  function pdfForOrder(os, photographic = false) {
    return new Promise((resolve, reject) => {
      const document = new PDFDocument({ size: 'A4', margin: 45, info: { Title: photographic ? 'Relatório demonstrativo fictício' : 'Ordem de serviço fictícia', Author: 'Demonstração' } });
      const chunks = []; document.on('data', chunk => chunks.push(chunk)); document.on('error', reject);
      document.on('end', async () => resolve(new Uint8Array(await new Blob(chunks).arrayBuffer())));
      document.rect(45, 40, 505, 55).fill('#0f172a');
      document.fillColor('#ffffff').fontSize(18).font('Helvetica-Bold').text(photographic ? 'RELATÓRIO DEMONSTRATIVO' : 'ORDEM DE SERVIÇO - EVENTO', 45, 58, { align: 'center', width: 505 });
      document.fillColor('#334155').fontSize(10).font('Helvetica').text('DEMONSTRAÇÃO — DADOS FICTÍCIOS — SEM VALIDADE', 45, 105, { align: 'right', width: 505 });
      const title = (text, y) => { document.roundedRect(45, y, 505, 24, 6).fill('#e2e8f0'); document.fillColor('#0f172a').fontSize(11).font('Helvetica-Bold').text(text, 55, y + 7); };
      const line = (label, value, x, y, width = 240) => { document.fillColor('#0f172a').fontSize(10).font('Helvetica-Bold').text(label, x, y, { continued: true }); document.font('Helvetica').fillColor('#334155').text(String(value || '-'), { width }); };
      const box = (text, y, height) => { document.roundedRect(45, y, 505, height, 8).stroke('#cbd5e1'); document.fillColor('#334155').fontSize(11).font('Helvetica').text(text || '-', 55, y + 10, { width: 485 }); };
      title('DADOS GERAIS', 130); document.roundedRect(45, 160, 505, 160, 10).stroke('#cbd5e1');
      line('Número da OS: ', os.numeroOS, 60, 175); line('Status atual: ', os.status, 320, 175, 180);
      line('Evento: ', os.nomeEvento, 60, 205, 430); line('Solicitante: ', os.solicitante, 60, 230); line('Resp. do evento: ', os.responsavelEvento, 320, 230, 180);
      line('Local do evento: ', os.localEvento, 60, 255); line('Telefone: ', os.telefoneEvento, 320, 255, 180);
      line('Período do evento: ', os.periodoEvento || DemoOS.brDate(os.dataInicioEvento), 60, 280, 290); line('Horário de início: ', os.horarioInicioEvento, 370, 280, 120); line('Quantidade de diárias: ', os.quantidadeDiarias, 60, 305, 180);
      title(photographic ? 'EXEMPLO DE RELATÓRIO, SEM FOTOGRAFIAS REAIS' : 'MATERIAIS / ITENS PARA EXECUCAO', 335);
      box(photographic ? 'Integração simulada com conteúdo fictício. Nenhum serviço externo foi consultado. Este exemplo não contém fotografias ou arquivos de uma operação real.' : os.materiais || 'Não informado.', 365, 100);
      title('OBSERVAÇÕES OPERACIONAIS', 485); box(os.observacoes || os.observacaoAprovacao || 'Sem observações.', 515, 90);
      document.moveTo(75, 700).lineTo(245, 700).stroke('#64748b'); document.moveTo(350, 700).lineTo(520, 700).stroke('#64748b');
      document.fillColor('#334155').fontSize(10).font('Helvetica').text('Responsável pela emissão', 95, 707).text('Responsável pela execução', 372, 707); document.end();
    });
  }
  async function generatedResponse(url, method, body) {
    const path = url.pathname, state = engine.snapshot();
    let workbook, name = 'demonstracao.xlsx', match;
    const permission = engine.profile().permissoes;
    if (path.startsWith('/api/financeiro') && !permission.financeiro || path.startsWith('/api/pagamentos') && !permission.pagamentos || path.startsWith('/api/contratos') && !permission.contratos || path.startsWith('/api/historico-') && !permission.historico) return new Response(JSON.stringify({ erro: 'Perfil sem acesso a este relatório.' }), { status: 403 });
    if ((match = path.match(/^\/api\/os\/([^/]+)\/(pdf|relatorio-fotografico)$/)) || (match = path.match(/^\/api\/dashboard-temporario\/relatorio-fotografico\/([^/]+)$/))) {
      const os = state.ordens.find(item => item.id === match[1]); if (!os) return new Response(JSON.stringify({ erro: 'OS não encontrada.' }), { status: 404 });
      const photographic = !path.endsWith('/pdf');
      if (photographic) announce('Integração simulada: será baixado um relatório PDF fictício, sem fotografias reais.');
      return new Response(await pdfForOrder(os, photographic), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${photographic ? 'relatorio-ficticio' : 'os'}-${os.numeroOS}.pdf"` } });
    }
    if (path.startsWith('/uploads/')) { const attachment = [...state.ordens.map(item => item.osSolicitanteArquivo), ...state.contratos.map(item => item.anexo)].find(item => item?.url === path); if (!attachment) return new Response(JSON.stringify({ erro: 'Anexo fictício não encontrado.' }), { status: 404 }); return new Response(asBytes(attachment.conteudoBase64), { headers: { 'Content-Type': attachment.mimeType, 'Content-Disposition': `attachment; filename="${attachment.nomeOriginal.replace(/["\r\n]/g, '')}"` } }); }
    if (path === '/modelos/MODELO-IMPORTACAO-PAGAMENTOS-IMPOSTOS.xlsx') {
      workbook = await relatorios.pagamentos.criarWorkbookPlanilhaPagamentosAbertos(state.pagamentos.slice(0, 2), { ordenacao: 'secretaria' }); name = 'modelo-pagamentos-ficticios.xlsx';
    } else if (path.startsWith('/api/planilhas/')) {
      let rows = selected(state.ordens, url.searchParams, body);
      if (body.modo === 'status') rows = rows.filter(item => item.status === body.status);
      if (!rows.length) throw new Error('Nenhuma OS encontrada para gerar a planilha.');
      workbook = await relatorios.ordens.criarWorkbookPlanilha(rows, 'OS'); name = 'os-demonstracao.xlsx';
    } else if (path === '/api/financeiro/planilhas') {
      const rows = selected(state.precificacoes, url.searchParams, body);
      if (body.modo === 'totais_clientes') { const clients = body.clientes?.length ? body.clientes : body.gruposClientes?.length ? [...new Set(state.ordens.map(item => item.solicitante))] : []; if (!clients.length) throw new Error('Selecione pelo menos um cliente.'); workbook = await relatorios.ordens.criarWorkbookPlanilhaTotaisClientes(state.precificacoes, clients); }
      else { if (!rows.length) throw new Error('Nenhuma OS financeira encontrada.'); workbook = await relatorios.ordens.criarWorkbookPlanilhaFinanceira(rows); }
      name = 'precificacao-demonstracao.xlsx';
    } else if (path === '/api/pagamentos-abertos/planilha') {
      const rows = selected(state.pagamentos.map(item => ({ ...item, numeroContrato: state.contratos.find(contract => contract.id === item.contratoId)?.numeroContrato || '' })), url.searchParams, body);
      if (!rows.length) throw new Error('Nenhum pagamento encontrado para exportar.');
      workbook = await relatorios.pagamentos.criarWorkbookPlanilhaPagamentosAbertos(rows, { ordenacao: url.searchParams.get('ordenacao') }); name = 'pagamentos-demonstracao.xlsx';
    } else if (path === '/api/contratos/planilha') {
      const rows = selected(engine.getContracts(), url.searchParams, body);
      if (url.searchParams.get('modo') === 'mapa_empenhos') { if (!url.searchParams.get('orgao')) throw new Error('Selecione um órgão fictício.'); announce('Mapa demonstrativo: somente empenhos fictícios, sem consulta a portais externos.'); workbook = new ExcelJS.Workbook(); workbook.creator = 'Demonstração fictícia'; const sheet = workbook.addWorksheet('MAPA FICTICIO'); sheet.addRow(['DEMONSTRAÇÃO — DADOS FICTÍCIOS — SEM CONSULTA EXTERNA']); sheet.addRow(['Órgão', 'Contrato', 'Empenho fictício', 'Valor empenhado', 'Consumido', 'Saldo']); rows.forEach((item, index) => sheet.addRow([item.orgao, item.numeroContrato, `EMP-DEMO-${index + 1}`, item.valorGlobalCentavos / 100, item.valorConsumidoCentavos / 100, item.saldoRestanteCentavos / 100])); sheet.columns.forEach(column => { column.width = 28; }); name = 'mapa-empenhos-ficticios.xlsx'; }
      else { workbook = await relatorios.contratos.criarWorkbookContratos(rows, url.searchParams.get('aba') === 'vencimentos' ? 'vencimentos' : 'contratos'); name = 'contratos-demonstracao.xlsx'; }
    } else if (path === '/api/historico-sistema/planilha') { const rows = selected(state.historico, url.searchParams, body); workbook = await relatorios.ordens.criarWorkbookHistoricoSistema(rows); name = 'historico-demonstracao.xlsx'; }
    else return null;
    return new Response(await workbook.xlsx.writeBuffer(), { headers: { 'Content-Type': mimeXlsx, 'Content-Disposition': `attachment; filename="${name}"` } });
  }
  function announce(message) { if (typeof window.mostrarAvisoSistema === 'function') window.mostrarAvisoSistema(message, 'aviso', 6500); else setTimeout(() => { const output = document.getElementById('demo-status'); if (output) output.textContent = message; }, 0); }
  function emitChanges() { const names = ['os_sincronizar', 'os_criada', 'os_atualizada', 'os_status_alterado', 'os_excluida', 'financeiro_atualizado', 'pagamentos_atualizados', 'contratos_atualizados', 'estoque_atualizado']; setTimeout(() => { for (const channel of channels) for (const name of names) channel.dispatchEvent(new MessageEvent(name, { data: JSON.stringify({ demonstracao: true }) })); }, 40); }
  window.fetch = async function (resource, init = {}) {
    const url = new URL(typeof resource === 'string' ? resource : resource.url, location.href), method = String(init.method || resource.method || 'GET').toUpperCase();
    if (url.origin !== location.origin) { errors.push({ method, path: '[origem externa bloqueada]', status: 403 }); throw new TypeError('Conexão externa indisponível na demonstração.'); }
    let body = {};
    try { if (init.body) body = JSON.parse(init.body); } catch { return new Response(JSON.stringify({ erro: 'Dados JSON inválidos.' }), { status: 400 }); }
    let response;
    try {
      response = await generatedResponse(url, method, body);
      if (!response && (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/'))) { const result = await engine.handle(method, url.pathname + url.search, body); if (result.body?.file) { const file = result.body.file; response = new Response(asBytes(file.conteudoBase64), { status: result.status, headers: { 'Content-Type': file.mimeType, 'Content-Disposition': `attachment; filename="${file.nomeOriginal.replace(/["\r\n]/g, '')}"` } }); } else response = new Response(JSON.stringify(result.body), { status: result.status, headers: { 'Content-Type': 'application/json' } }); }
      if (!response) { const allowed = /^\/(?:vendor\/(?:exceljs\.min|pdfkit\.standalone)\.js|assets\/identidade\.svg)$/; if (!allowed.test(url.pathname)) throw new Error('Recurso não permitido pelo contrato demonstrativo.'); response = await originalFetch(resource, init); }
    } catch (error) { response = new Response(JSON.stringify({ erro: error.message }), { status: 400, headers: { 'Content-Type': 'application/json' } }); }
    requests.push({ method, path: url.pathname, status: response.status }); if (!response.ok) errors.push({ method, path: url.pathname, status: response.status });
    if (method !== 'GET' && response.ok) { emitChanges(); if (engine.warning()) announce(engine.warning()); }
    return response;
  };
  class LocalEventSource extends EventTarget {
    static CONNECTING = 0; static OPEN = 1; static CLOSED = 2;
    constructor(url) { super(); if (new URL(url, location.href).pathname !== '/api/notificacoes/stream') throw new Error('Canal demonstrativo desconhecido.'); this.readyState = 1; this.url = url; channels.add(this); queueMicrotask(() => this.dispatchEvent(new Event('open'))); }
    close() { this.readyState = 2; channels.delete(this); }
  }
  window.EventSource = LocalEventSource;
  window.demoBaixar = async function (url) { const response = await fetch(url); if (!response.ok) { const data = await response.json().catch(() => ({})); announce(data.erro || 'Não foi possível gerar o arquivo fictício.'); return; } const blob = await response.blob(), href = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = href; anchor.download = response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] || 'demonstracao'; document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(href), 2000); };
  window.open = function (url, target, features) { if (url && /^\/(?:api|uploads)\//.test(String(url))) { window.demoBaixar(url); return { close() {}, focus() {} }; } if (url && new URL(url, location.href).origin !== location.origin) { announce('Links externos não fazem parte desta demonstração.'); return null; } return originalOpen(url, target, features); };
  document.addEventListener('click', event => { const link = event.target.closest('a[href]'); if (!link) return; const href = link.getAttribute('href'); const url = new URL(href, location.href); if (url.origin === location.origin && /^\/(?:api|uploads|modelos)\//.test(url.pathname)) { event.preventDefault(); window.demoBaixar(url.pathname + url.search); } }, true);
  Object.assign(DemoOS, { engine, requests, errors, reset: () => { engine.reset(); location.reload(); }, download: generatedResponse });
  Object.defineProperty(DemoOS, 'state', { get: () => engine.snapshot() });
  document.addEventListener('DOMContentLoaded', () => {
    const details = document.createElement('details'); details.id = 'demo-controls'; details.innerHTML = '<summary>Demonstração · dados fictícios</summary><div><p>Nenhum dado real. Alterações ficam apenas neste navegador.</p><label>Perfil demonstrativo<select id="demo-profile"></select></label><button type="button" id="demo-reset">Restaurar dados fictícios</button><a href="/dashboard-temporario.html">Dashboard temporário</a><p id="demo-status" role="status"></p></div>';
    document.body.append(details);
    const select = document.getElementById('demo-profile');
    for (const profile of ['admin', 'operador-demo', 'financeiro', 'temporario', 'contratos']) { const option = document.createElement('option'); option.value = profile; option.textContent = DemoOS.user(profile).nome; option.selected = profile === engine.profile().usuario; select.append(option); }
    select.addEventListener('change', () => { engine.selectProfile(select.value); location.href = select.value === 'temporario' ? '/dashboard-temporario.html' : select.value === 'contratos' ? '/contratos' : '/os'; });
    document.getElementById('demo-reset').addEventListener('click', () => { if (confirm('Restaurar todos os dados fictícios deste navegador?')) { engine.reset(); try { for (let i = localStorage.length - 1; i >= 0; i--) { const key = localStorage.key(i); if (key?.startsWith('demonstracao.os.ui.')) localStorage.removeItem(key); } } catch { /* A restauração também funciona em memória. */ } location.reload(); } });
    document.getElementById('demo-status').textContent = engine.warning();
    if (document.getElementById('usuario') && document.getElementById('senha')) { document.getElementById('usuario').value = 'admin'; document.getElementById('senha').value = 'demo'; const help = document.querySelector('.login-card-topo p'); if (help) help.textContent = 'Acesso fictício: use admin e demo. Não informe credenciais reais.'; }
  });
})();
