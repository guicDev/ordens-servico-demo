'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ExcelJS = require('../vendor/exceljs.min');
const { createEngine, createSeed, KEY } = require('../demo-engine');
const taxes = require('../retencoes-pagamentos');
const reports = require('../demo-relatorios').create(ExcelJS);
const clock = () => new Date('2026-11-25T12:00:00Z');
function memory() { const data = new Map(); return { data, getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, String(value)) }; }
function setup(storage = memory()) { return { storage, engine: createEngine({ storage, now: clock, excel: ExcelJS }) }; }
async function ok(engine, method, url, payload) { const result = await engine.handle(method, url, payload); assert.ok(result.status >= 200 && result.status < 300, `${method} ${url}: ${JSON.stringify(result.body)}`); return result.body; }
async function file(workbook) { return { nomeOriginal: 'exemplo-ficticio.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', conteudoBase64: Buffer.from(await workbook.xlsx.writeBuffer()).toString('base64') }; }
test('DTOs atendem as telas originais e contratos desconhecidos falham explicitamente', async () => {
  const { engine } = setup();
  const data = await ok(engine, 'GET', '/api/me'); assert.equal(data.usuario.usuario, 'admin'); assert.equal(data.usuario.permissoes.estoque, true);
  for (const url of ['/api/os', '/api/solicitantes', '/api/dashboard-temporario', '/api/historico']) assert.ok(Array.isArray(await ok(engine, 'GET', url)), url);
  for (const url of ['/api/financeiro/precificacoes', '/api/pagamentos-abertos', '/api/contratos', '/api/contratos/detalhados', '/api/estoque/itens', '/api/estoque/movimentacoes', '/api/historico-unificado', '/api/inconsistencias']) assert.ok(Array.isArray((await ok(engine, 'GET', url)).itens), url);
  assert.equal((await engine.handle('GET', '/api/inexistente')).status, 501);
});
test('resumos financeiros e de contratos usam os campos dos contratos de tela', async () => {
  const { engine } = setup();
  assert.deepEqual((await ok(engine, 'GET', '/api/financeiro/precificacoes')).resumo, { totalOS: 3, valorTotalFinal: 1260, pendentesPrecificacao: 1, precificadas: 2 });
  const contracts = await ok(engine, 'GET', '/api/contratos');
  assert.equal(contracts.resumo.total, contracts.itens.length);
  assert.equal(contracts.resumo.ativos, 2); assert.equal(contracts.resumo.vencidos, 1); assert.equal(contracts.resumo.proximosVencimento, 1);
  const payments = await ok(engine, 'GET', '/api/pagamentos-abertos');
  assert.equal(payments.resumo.confirmados, 1); assert.equal(payments.resumo.emAberto, 7);
  assert.equal(payments.resumo.valorEmAbertoCentavos, payments.itens.filter(item => item.pagamento !== 'CONFIRMADO').reduce((sum, item) => sum + item.valorLiquidoCentavos, 0));
});
test('cadastro, edição e controle de versão de OS preservam campos e histórico', async () => {
  const { engine } = setup();
  const item = { ...engine.snapshot().ordens[0], id: undefined, numeroOS: '990', nomeEvento: 'Encontro fictício novo', status: undefined };
  const created = await ok(engine, 'POST', '/api/os', item);
  assert.equal(created.status, 'pendente'); assert.equal(created.nomeEvento, item.nomeEvento);
  assert.equal((await engine.handle('PUT', `/api/os/${created.id}`, { ...created, nomeEvento: 'Novo nome' })).status, 409);
  const updated = await ok(engine, 'PUT', `/api/os/${created.id}`, { ...created, nomeEvento: 'Novo nome', versaoEdicao: created.atualizadoEm });
  assert.equal(updated.nomeEvento, 'Novo nome'); assert.ok(updated.historico.length >= 2);
  assert.equal((await engine.handle('POST', '/api/os', item)).status, 400);
});
test('datas, horários, diárias e identificadores inválidos não alteram o estado', async () => {
  const { engine } = setup(), original = engine.snapshot();
  const input = { ...original.ordens[0], numeroOS: '991' };
  for (const patch of [{ dataInicioEvento: '2026-02-30' }, { dataFimEvento: '2020-01-01' }, { horarioInicioEvento: '28:00' }, { quantidadeDiarias: .5 }, { quantidadeDiarias: -1 }, { nomeEvento: '' }]) {
    assert.equal((await engine.handle('POST', '/api/os', { ...input, ...patch })).status, 400);
    assert.deepEqual(engine.snapshot(), original);
  }
  assert.equal((await engine.handle('PATCH', '/api/os/os-demo-1/status', { status: '__proto__' })).status, 400);
});
test('serviço original de status cria reserva por quantidade e diárias e libera no retorno', async () => {
  const { engine } = setup();
  const before = await ok(engine, 'GET', '/api/estoque/itens');
  const os = engine.snapshot().ordens[0];
  await ok(engine, 'PATCH', `/api/os/${os.id}/status`, { status: 'em_execucao', observacaoAprovacao: 'Montagem fictícia' });
  let after = await ok(engine, 'GET', '/api/estoque/itens');
  assert.equal(after.itens[0].quantidadeTotal, before.itens[0].quantidadeTotal);
  assert.equal(after.itens[0].emUso, before.itens[0].emUso + os.quantidadeDiarias);
  await ok(engine, 'PATCH', `/api/os/${os.id}/status`, { status: 'executado' });
  after = await ok(engine, 'GET', '/api/estoque/itens'); assert.equal(after.itens[0].emUso, before.itens[0].emUso);
  assert.ok(engine.snapshot().precificacoes.some(item => item.osId === os.id));
});
test('saldo insuficiente bloqueia status e reserva de forma atômica', async () => {
  const { engine } = setup();
  const original = engine.snapshot().ordens[0];
  await ok(engine, 'PUT', `/api/os/${original.id}`, { ...original, versaoEdicao: original.atualizadoEm, materiais: '999 Caixa de som' });
  const before = engine.snapshot();
  const response = await engine.handle('PATCH', `/api/os/${original.id}/status`, { status: 'em_execucao' });
  assert.equal(response.status, 400); assert.deepEqual(engine.snapshot(), before);
});
test('estoque manual preserva três casas, reduz total na saída e inclui limite mínimo', async () => {
  const { engine } = setup();
  const stock = await ok(engine, 'POST', '/api/estoque/itens', { nome: 'Item fictício decimal', quantidadeInicial: '10', estoqueMinimo: '5', ativo: true, aliases: [] });
  let result = await ok(engine, 'POST', '/api/estoque/movimentacoes', { itemId: stock.id, tipo: 'saida_manual', quantidade: 5, motivo: 'Teste fictício' });
  assert.equal(result.quantidadeTotal, 5); assert.equal(result.statusEstoque, 'baixo');
  result = await ok(engine, 'POST', '/api/estoque/movimentacoes', { itemId: stock.id, tipo: 'entrada_manual', quantidade: .125, motivo: 'Teste fictício' });
  assert.equal(result.quantidadeTotal, 5.125);
  assert.equal((await engine.handle('POST', '/api/estoque/movimentacoes', { itemId: stock.id, tipo: 'saida_manual', quantidade: 6, motivo: 'Teste' })).status, 400);
});
test('precificação usa reais, totais recalculados e doação respeitada', async () => {
  const { engine } = setup(); const price = engine.snapshot().precificacoes[0];
  let item = await ok(engine, 'PUT', `/api/financeiro/precificacoes/${price.id}`, { itens: [{ descricao: 'Caixa de som', quantidade: 3, diarias: 2, valorUnitario: 10.25, subtotal: 999 }], tipoPrecificacao: 'normal' });
  assert.equal(item.valorFinal, 61.5); assert.equal(item.itens[0].subtotal, 61.5);
  item = await ok(engine, 'PUT', `/api/financeiro/precificacoes/${price.id}`, { ...item, tipoPrecificacao: 'doacao' });
  assert.equal(item.valorFinal, 0); assert.equal(item.totalItens, 61.5);
  const auto = await ok(engine, 'POST', `/api/financeiro/precificacoes/${price.id}/calcular-item`, { descricao: 'Caixa de som', quantidade: 2, diarias: 3 });
  assert.equal(auto.item.subtotal, 1080);
});
test('pagamentos reutilizam retenções originais e centavos sem arredondamento intermediário', async () => {
  const { engine } = setup();
  const before = engine.snapshot().pagamentos[1];
  const calc = taxes.calcularRetencoes(before.valorContaCentavos, before.retencoes);
  assert.equal(before.valorLiquidoCentavos, calc.liquidoCentavos);
  let result = await ok(engine, 'PUT', `/api/pagamentos-abertos/${before.id}`, { ...before, pagamento: 'CONFIRMADO', dataPagamento: '2026-11-25' });
  assert.equal(result.pagamento, 'CONFIRMADO'); assert.equal(result.valorLiquidoCentavos, calc.liquidoCentavos);
  assert.equal((await engine.handle('PUT', `/api/pagamentos-abertos/${before.id}`, { ...before, valorLiquidoCentavos: 1 })).status, 400);
  assert.equal((await engine.handle('POST', '/api/pagamentos-abertos', { ...before, retencoes: { iss: 1000001 } })).status, 400);
});
test('contratos agrupam por órgão e vinculam consumo de pagamentos', async () => {
  const { engine } = setup(); const first = engine.snapshot().contratos[0];
  const created = await ok(engine, 'POST', '/api/contratos', { ...first, numeroContrato: 'CT-NOVO', valorOriginalCentavos: 100000, valorGlobalCentavos: 100000 });
  const group = (await ok(engine, 'GET', '/api/contratos')).itens.find(item => item.orgao === first.orgao);
  assert.equal(group.valorGlobalCentavos, first.valorGlobalCentavos + 100000);
  const detail = await ok(engine, 'GET', `/api/contratos/${first.id}`); assert.equal(detail.contratosDetalhados.length, 2);
  assert.equal((await engine.handle('DELETE', `/api/contratos/${first.id}`)).status, 409);
  await ok(engine, 'DELETE', `/api/contratos/${created.id}`);
});
test('lotes e lixeira exigem prévia, confirmação e execução única', async () => {
  const { engine } = setup();
  const preview = await ok(engine, 'POST', '/api/acoes-em-massa/analisar', { entidade: 'os', acao: 'enviar_lixeira', ids: ['os-demo-1'], motivo: 'Exclusão fictícia' });
  assert.equal(preview.resumo.aplicaveis, 1);
  assert.equal((await engine.handle('POST', '/api/acoes-em-massa/executar', { loteId: preview.loteId, tokenConfirmacao: preview.tokenConfirmacao, confirmacaoDestrutiva: '' })).status, 400);
  const execution = await ok(engine, 'POST', '/api/acoes-em-massa/executar', { loteId: preview.loteId, tokenConfirmacao: preview.tokenConfirmacao, confirmacaoDestrutiva: 'EXCLUIR 1' });
  assert.equal(execution.totais.aplicados, 1);
  assert.equal((await engine.handle('POST', '/api/acoes-em-massa/executar', preview)).status, 409);
  assert.equal((await ok(engine, 'GET', '/api/lixeira?entidade=os')).length, 1);
  const restore = await ok(engine, 'POST', '/api/lixeira/restaurar/analisar', { entidade: 'os', ids: ['os-demo-1'] });
  await ok(engine, 'POST', '/api/lixeira/restaurar/executar', restore);
  assert.ok((await ok(engine, 'GET', '/api/os')).some(item => item.id === 'os-demo-1'));
});
test('perfis originais mantêm as restrições sem armazenar senha', async () => {
  const { engine, storage } = setup();
  await ok(engine, 'POST', '/api/login', { usuario: 'contratos', senha: 'demo' });
  assert.equal((await engine.handle('POST', '/api/contratos', {})).status, 403);
  assert.equal((await engine.handle('GET', '/api/estoque/itens')).status, 403);
  await ok(engine, 'GET', '/api/contratos');
  assert.equal(storage.getItem(KEY).includes('senha'), false);
  engine.selectProfile('admin'); assert.equal(engine.profile().permissoes.estoque, true);
});
test('reset e persistência afetam somente o namespace desta demonstração', async () => {
  const { engine, storage } = setup(); storage.setItem('outro-site', 'preservado');
  await ok(engine, 'PATCH', '/api/os/os-demo-1/status', { status: 'autorizado' });
  const second = setup(storage).engine; assert.equal(second.snapshot().ordens[0].status, 'autorizado');
  const independent = setup().engine; assert.equal(independent.snapshot().ordens[0].status, 'pendente');
  engine.reset(); assert.deepEqual(engine.snapshot(), createSeed(clock())); assert.equal(storage.getItem('outro-site'), 'preservado');
});
test('storage bloqueado ou corrompido mantém o aplicativo em memória e avisa', async () => {
  const storage = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('sem espaço'); } };
  const { engine } = setup(storage); assert.match(engine.warning(), /indisponível/);
  await ok(engine, 'PATCH', '/api/os/os-demo-1/status', { status: 'autorizado' });
  assert.match(engine.warning(), /somente nesta aba/);
  const broken = memory(); broken.setItem(KEY, '{'); assert.equal(setup(broken).engine.snapshot().ordens.length, 10);
});
test('geradores XLSX originais produzem arquivos que o leitor reabre', async () => {
  const { engine } = setup(); const state = engine.snapshot();
  for (const workbook of [await reports.ordens.criarWorkbookPlanilha(state.ordens), await reports.ordens.criarWorkbookPlanilhaFinanceira(state.precificacoes), await reports.ordens.criarWorkbookPlanilhaTotaisClientes(state.precificacoes, ['Cliente Horizonte']), await reports.ordens.criarWorkbookHistoricoSistema(state.historico), await reports.contratos.criarWorkbookContratos(engine.getContracts()), await reports.pagamentos.criarWorkbookPlanilhaPagamentosAbertos(state.pagamentos)]) {
    const bytes = await workbook.xlsx.writeBuffer(); assert.equal(bytes[0], 80); assert.equal(bytes[1], 75);
    const read = new ExcelJS.Workbook(); await read.xlsx.load(bytes); assert.ok(read.worksheets[0].rowCount > 1);
  }
});
test('importação de pagamentos usa parser original, prévia e confirmação sem duplicar', async () => {
  const { engine } = setup(); const state = engine.snapshot();
  const workbook = await reports.pagamentos.criarWorkbookPlanilhaPagamentosAbertos(state.pagamentos);
  const arquivo = await file(workbook);
  const preview = await ok(engine, 'POST', '/api/pagamentos-abertos/importacao/analisar', { arquivo });
  assert.equal(preview.resumo.validos, state.pagamentos.length); assert.equal(preview.resumo.atualizados, state.pagamentos.length);
  await ok(engine, 'POST', '/api/pagamentos-abertos/importacao/confirmar', { arquivo });
  assert.equal(engine.snapshot().pagamentos.length, state.pagamentos.length);
});
test('importação de contratos mantém o layout original de doze colunas', async () => {
  const { engine } = setup(); const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet('CONTRATO ATUALIZADO');
  sheet.addRow(['Item', 'Órgão', 'Contrato', 'Descrição', 'Original', 'Aditivo', 'Global', 'Vigência', 'Início', 'Fim', 'Status', 'Atestado']);
  sheet.addRow(['1', 'Cliente Exemplo Fictício', 'CT-EXEMPLO', 'Serviço fictício', 10000, 0, 10000, 12, new Date('2026-01-01T12:00:00Z'), new Date('2027-01-01T12:00:00Z'), '', '']);
  const arquivo = await file(workbook);
  const analysis = await ok(engine, 'POST', '/api/contratos/importacao/analisar', { arquivo }); assert.equal(analysis.resumo.validos, 1);
  const result = await ok(engine, 'POST', '/api/contratos/importacao/confirmar', { arquivo }); assert.equal(result.criados, 1);
  assert.ok(engine.snapshot().contratos.some(item => item.numeroContrato === 'CT-EXEMPLO' && item.valorGlobalCentavos === 1000000));
});
test('importação de dashboard usa cabeçalhos originais e cria os dados mostrados na prévia', async () => {
  const { engine } = setup(); const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet('Geral Geral');
  sheet.addRow(['OS', 'Solicitante', 'Responsável', 'Nome do evento', 'Local do evento', 'Mês', 'Montagem', 'Desmontagem', 'Diárias', 'Descrição', 'Status']);
  sheet.addRow(['991', 'Cliente Fictício Novo', 'Equipe de exemplo', 'Evento importado fictício', 'Espaço Fictício', 'NOV', new Date('2026-11-26T12:00:00Z'), new Date('2026-11-27T12:00:00Z'), 2, 'Caixa de som', 'pendente']);
  const arquivo = await file(workbook);
  const preview = await ok(engine, 'POST', '/api/os/importacao-dashboard/analisar', { arquivo }); assert.equal(preview.resumo.totalOS, 1); assert.equal(preview.registros[0].nomeEvento, 'Evento importado fictício');
  await ok(engine, 'POST', '/api/os/importacao-dashboard/confirmar', { arquivo, status: 'pendente' });
  assert.ok(engine.snapshot().ordens.some(item => item.numeroOS === '991' && item.nomeEvento === 'Evento importado fictício'));
});
test('importação financeira reusa extração original e atualiza os itens em reais', async () => {
  const { engine } = setup(); const workbook = await reports.ordens.criarWorkbookPlanilhaFinanceira(engine.snapshot().precificacoes);
  const arquivo = await file(workbook);
  const preview = await ok(engine, 'POST', '/api/financeiro/importacao-precificacao/analisar', { arquivo }); assert.equal(preview.resumo.osEncontradas, 3);
  const first = engine.snapshot().precificacoes[0].valorFinal;
  await ok(engine, 'POST', '/api/financeiro/importacao-precificacao/confirmar', { arquivo });
  assert.equal(engine.snapshot().precificacoes[0].valorFinal, first);
});
test('inconsistências usam as regras e todos os contadores originais', async () => {
  const { engine } = setup(); const data = await ok(engine, 'GET', '/api/inconsistencias');
  assert.deepEqual(Object.keys(data.resumo).sort(), ['total', 'numerosPulados', 'anoSuspeito', 'numeroInvalido', 'semMateriais', 'materiaisSemItens', 'duplicadas', 'semPrecificacao', 'dadosEssenciais'].sort());
  assert.equal(data.tipos.length, 8); assert.equal(data.resumo.semPrecificacao, 0);
});
test('arquivos de entrada inválidos e anexos ativos são rejeitados', async () => {
  const { engine } = setup();
  assert.equal((await engine.handle('POST', '/api/pagamentos-abertos/importacao/analisar', { arquivo: { nome: 'arquivo.txt', conteudoBase64: 'dGVzdGU=' } })).status, 400);
  const before = engine.snapshot();
  assert.equal((await engine.handle('POST', '/api/contratos/contrato-demo-1/anexo', { arquivo: { nomeOriginal: 'teste.html', mimeType: 'text/html', conteudoBase64: 'PHNjcmlwdD4=' } })).status, 400);
  assert.deepEqual(engine.snapshot(), before);
});
test('páginas mantêm os controles e scripts originais, sem o aplicativo reduzido', () => {
  const root = path.resolve(__dirname, '..');
  for (const [file, ids] of [['index.html', ['modal', 'modalStatus', 'modalPlanilha']], ['pagamentos-abertos.html', ['modalPagamentoAberto', 'modalImportacaoPagamentos']], ['contratos.html', ['modalDetalheContrato', 'modalFormContratoDetalhado']], ['estoque.html', ['modalItemEstoque', 'modalMovEstoque']]]) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    for (const id of ids) assert.match(html, new RegExp(`id="${id}"`));
    assert.match(html, /demo-adapter\.js/); assert.doesNotMatch(html, /src="app\.js/);
  }
  const manifest = require('../scripts/public-files.json'); assert.equal(manifest.filter(file => file.endsWith('.html')).length, 9);
  assert.equal(new Set(manifest).size, manifest.length);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'style.css'))).digest('hex'), '28cae14053310c54bd435b0c0943b13ac58622a90a1148e856439a3b36103e30');
});
