// Servidor estático mínimo para desarrollo local.
//
// Hace falta porque `index.html` importa módulos ES relativos
// (`./assets/js/...`), y abrir el archivo con doble clic (file://) los bloquea
// por CORS. En producción esto lo resuelve Firebase Hosting.
//
//   npm start          -> http://localhost:5173
//   npm start -- 8080  -> otro puerto

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import process from 'node:process';

const port = Number(process.argv[2]) || 5173;
const root = process.cwd();

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

createServer(async (req, res) => {
    try {
        const url = new URL(req.url, `http://localhost:${port}`);
        let pathname = decodeURIComponent(url.pathname);

        if (pathname === '/' || pathname === '/admin') pathname = '/index.html';

        // Evita salir de la raíz del proyecto.
        const filePath = join(root, normalize(pathname).replace(/^([/\\])+/, ''));
        if (!filePath.startsWith(root)) {
            res.writeHead(403).end('Forbidden');
            return;
        }

        const info = await stat(filePath);
        if (info.isDirectory()) {
            res.writeHead(404).end('Not found');
            return;
        }

        const body = await readFile(filePath);
        res.writeHead(200, {
            'Content-Type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream',
            'Cache-Control': 'no-store'
        });
        res.end(body);
    } catch {
        res.writeHead(404).end('Not found');
    }
}).listen(port, () => {
    console.log(`NailsConVal en http://localhost:${port}`);
});
