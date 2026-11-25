'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.resolve(root, 'dist');
const files = ['index.html', 'style.css', 'demo.css', 'core.js', 'app.js'];
if (path.dirname(output) !== root || path.basename(output) !== 'dist') throw new Error('Destino de build inválido.');
for (const name of files) {
  const stat = fs.lstatSync(path.join(root, name));
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Arquivo de build inválido: ${name}`);
}
if (fs.existsSync(output) && fs.lstatSync(output).isSymbolicLink()) throw new Error('O destino não pode ser um link.');
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output);
for (const name of files) fs.copyFileSync(path.join(root, name), path.join(output, name));
console.log(`Build concluído: ${files.length} arquivos estáticos em dist.`);
