'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function carregarNavegacao(usuario) {
  let consultas = 0;
  const menus = [];
  const contexto = {
    document: { readyState: 'loading', querySelector: () => null, getElementById: () => null, addEventListener() {} },
    fetch: async () => { consultas++; return { ok: true, json: async () => ({ usuario }) }; },
    addEventListener() {},
  };
  contexto.window = contexto;
  vm.createContext(contexto);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../navegacao.js'), 'utf8'), contexto);
  // O dashboard possui uma função global com esse nome para exibir o responsável.
  vm.runInContext('function obterUsuarioAtual() { return ""; }', contexto);
  contexto.renderizarMenuLateral = atual => menus.push(
    contexto.MODULOS_SISTEMA.filter(modulo => contexto.usuarioTemPermissaoModulo(atual, modulo)).map(modulo => modulo.id)
  );
  const usuarios = await Promise.all([contexto.inicializarNavegacao(), contexto.inicializarNavegacao()]);
  return { usuarios, consultas, menus, contexto };
}

test('dashboard mantém o usuário completo e todos os menus na primeira entrada', async () => {
  const usuario = { id: '1', usuario: 'admin', nome: 'Administrador de demonstração', permissoes: {
    dashboard: true, financeiro: true, pagamentos: true, contratos: true, historico: true, estoque: true,
  } };
  const resultado = await carregarNavegacao(usuario);
  assert.equal(resultado.consultas, 1);
  for (const atual of resultado.usuarios) assert.equal(JSON.stringify(atual), JSON.stringify(usuario));
  assert.equal(resultado.contexto.obterUsuarioNavegacao(), resultado.usuarios[0]);
  const esperado = ['dashboard', 'financeiro', 'pagamentos', 'contratos', 'historico', 'estoque', 'inconsistencias'];
  assert.equal(resultado.menus.length, 2);
  for (const menu of resultado.menus) assert.deepEqual(Array.from(menu), esperado);
});

test('a correção de navegação conserva as restrições do perfil demonstrativo', async () => {
  const usuario = { usuario: 'contratos', nome: 'Consulta de contratos', permissoes: {
    dashboard: false, financeiro: false, pagamentos: false, contratos: true, historico: false, estoque: false,
  } };
  const resultado = await carregarNavegacao(usuario);
  assert.equal(resultado.consultas, 1);
  for (const menu of resultado.menus) assert.deepEqual(Array.from(menu), ['contratos']);
});
