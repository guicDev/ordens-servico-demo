'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
for (const file of require('./public-files.json').filter(file => file.endsWith('.js') && !file.startsWith('vendor/'))) execFileSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'inherit' });
for (const file of ['build.js', 'serve.js']) execFileSync(process.execPath, ['--check', path.join(__dirname, file)], { stdio: 'inherit' });
for (const file of require('./public-files.json')) if (!fs.statSync(path.join(root, file)).isFile()) throw new Error(`Arquivo ausente: ${file}`);
console.log('Scripts e lista de arquivos verificados.');
