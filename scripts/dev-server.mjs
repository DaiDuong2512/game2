import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const port = Number(process.env.PORT ?? 4173);
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'],
  ['.svg', 'image/svg+xml'], ['.wav', 'audio/wav'], ['.mp3', 'audio/mpeg'],
  ['.webp', 'image/webp'],
  ['.map', 'application/json; charset=utf-8'],
]);

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    let filePath = path.join(root, relative);
    if (!filePath.startsWith(root)) throw new Error('Đường dẫn không hợp lệ');
    let info;
    try { info = await stat(filePath); } catch { info = null; }
    if (info?.isDirectory()) filePath = path.join(filePath, 'index.html');
    try { info = await stat(filePath); } catch { info = null; }
    if (!info?.isFile()) filePath = path.join(root, 'index.html');
    const body = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': mime.get(path.extname(filePath).toLowerCase()) ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'Cross-Origin-Opener-Policy': 'same-origin',
    });
    res.end(body);
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(error instanceof Error ? error.message : 'Lỗi máy chủ');
  }
});
server.listen(port, '0.0.0.0', () => {
  console.log(`Riftwarden: Echo Siege đang chạy tại http://localhost:${port}`);
  console.log('Lối tắt QA: http://localhost:' + port + '/?qa=1');
});
