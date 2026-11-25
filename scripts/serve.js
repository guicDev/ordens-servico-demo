'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT || 4174);
const allowed = new Map([['/', 'index.html'], ['/index.html', 'index.html'], ['/style.css', 'style.css'], ['/demo.css', 'demo.css'], ['/core.js', 'core.js'], ['/app.js', 'app.js']]);
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8' };
const csp = "default-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:";
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT deve ser um inteiro entre 1024 e 65535.');
http.createServer((request, response) => {
  response.setHeader('Content-Security-Policy', csp);
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end('Método indisponível.'); return; }
  let route;
  try { route = new URL(request.url, 'http://localhost').pathname; } catch { response.writeHead(400); response.end(); return; }
  const file = allowed.get(route);
  if (!file) { response.writeHead(404); response.end('Página não encontrada.'); return; }
  fs.readFile(path.join(root, file), (error, data) => {
    if (error) { response.writeHead(500); response.end('Não foi possível carregar o arquivo.'); return; }
    response.setHeader('Content-Type', mime[path.extname(file)]);
    response.writeHead(200); response.end(request.method === 'HEAD' ? undefined : data);
  });
}).listen(port, '127.0.0.1', () => console.log(`Demonstração local: http://127.0.0.1:${port}`));
