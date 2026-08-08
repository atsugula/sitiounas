// Servidor estático mínimo para desarrollo local.
//
// Hace falta porque `index.html` importa módulos ES relativos
// (`./assets/js/...`), y abrir el archivo con doble clic (file://) los bloquea
// por CORS. En producción esto lo resuelve Firebase Hosting.
//
// Aplica además las mismas cabeceras de seguridad que `firebase.json`, para
// que la CSP se pruebe aquí y no se descubra rota el día del despliegue.
//
//   npm start          -> http://localhost:5173
//   npm start -- 8080  -> otro puerto

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import process from 'node:process';

const port = Number(process.argv[2]) || 5173;
const rootArgIndex = process.argv.indexOf('--root');
const repoRoot = process.cwd();
const root = rootArgIndex >= 0 && process.argv[rootArgIndex + 1]
    ? join(repoRoot, process.argv[rootArgIndex + 1])
    : repoRoot;

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

/** Cabeceras de seguridad declaradas en firebase.json, para no duplicarlas. */
function loadSecurityHeaders() {
    try {
        const config = JSON.parse(readFileSync(join(repoRoot, 'firebase.json'), 'utf8'));
        const rule = config?.hosting?.headers?.find((entry) => entry.source === '**');
        if (!rule?.headers) return {};
        return Object.fromEntries(rule.headers.map((header) => [header.key, header.value]));
    } catch (error) {
        console.warn('No se pudieron leer las cabeceras de firebase.json:', error.message);
        return {};
    }
}

const securityHeaders = loadSecurityHeaders();
// HSTS no tiene sentido en http://localhost y algunos navegadores se quejan.
delete securityHeaders['Strict-Transport-Security'];

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
            ...securityHeaders,
            'Content-Type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream',
            'Cache-Control': 'no-store'
        });
        res.end(body);
    } catch {
        res.writeHead(404).end('Not found');
    }
}).listen(port, () => {
    const applied = Object.keys(securityHeaders);
    console.log(`Ramos Nails en http://localhost:${port}`);
    console.log(applied.length
        ? `Cabeceras de seguridad activas: ${applied.join(', ')}`
        : 'Sin cabeceras de seguridad (no se pudo leer firebase.json)');
});
