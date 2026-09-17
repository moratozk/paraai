// Galeria local dos frames gerados por ui_totem.test.cpp. Não é a maquete
// virtual, não acessa Firebase e não serve o repositório nem credenciais.
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
const pasta = new URL('./.runtime/preview/', import.meta.url);
const arquivos = (await readdir(pasta)).filter(n => /^\d{2}-[a-z]+\.svg$/.test(n)).sort();
if (!arquivos.length) throw new Error('Execute primeiro ui_totem.test.cpp para gerar os frames.');
const pagina = `<!doctype html><html lang="pt-BR"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>ParaAí — inspeção do firmware</title>
<style>body{margin:24px;background:#0c0e12;color:#f4f6fb;font:16px system-ui}h1{font-size:24px;color:#ffc400}p{max-width:850px;color:#b5bbca;line-height:1.5}main{display:flex;flex-wrap:wrap;gap:24px}figure{margin:0}figcaption{margin-bottom:8px}img{display:block;width:320px;height:240px;image-rendering:pixelated;border:1px solid #464e5e}</style>
<h1>Totem de atendimento</h1><p>Inspeção do código real de DisplayUI e Adafruit_GFX, com as fontes do firmware em 320 × 240. Toque, relógio e Wi-Fi simulados somente para os testes. Não valida a calibração física, não consulta o Firebase e não é a futura maquete virtual.</p>
<main>${arquivos.map(n=>`<figure><figcaption>${n.replace('.svg','').replace('-', ' · ')}</figcaption><img src="/${n}" alt="Tela ${n}" width="320" height="240"></figure>`).join('')}</main></html>`;
createServer(async (req,res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.url === '/') { res.setHeader('Content-Type','text/html; charset=utf-8'); res.end(pagina); return; }
  const nome = req.url.slice(1);
  if (!arquivos.includes(nome)) { res.writeHead(404); res.end(); return; }
  try { res.setHeader('Content-Type','image/svg+xml'); res.end(await readFile(new URL(nome,pasta))); }
  catch { res.writeHead(500); res.end('Frame indisponível'); }
}).listen(4174,'127.0.0.1',()=>console.log('Inspeção do firmware: http://127.0.0.1:4174'));
