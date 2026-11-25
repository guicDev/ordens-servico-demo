'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT || 4174);
const config = require('../vercel.json');
const allowed = new Map(require('./public-files.json').map(name => ['/' + name, name]));
allowed.set('/', 'index.html');
for (const entry of config.rewrites) allowed.set(entry.source, entry.destination.slice(1));
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8' };
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Porta inválida.');
http.createServer((request, response) => {
  for (const header of config.headers[0].headers) response.setHeader(header.key, header.value);
  response.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
  let route;
  try { route = new URL(request.url, 'http://localhost').pathname; } catch { response.writeHead(400); response.end(); return; }
  const file = allowed.get(route);
  if (!file) { response.writeHead(404); response.end('Recurso não encontrado.'); return; }
  fs.readFile(path.join(root, file), (error, data) => {
    if (error) { response.writeHead(500); response.end('Falha ao ler arquivo.'); return; }
    response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    response.writeHead(200); response.end(request.method === 'HEAD' ? undefined : data);
  });
}).listen(port, '127.0.0.1', () => console.log(`Demonstração local: http://127.0.0.1:${port}`));
