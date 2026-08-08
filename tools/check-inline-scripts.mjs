// Validación de sintaxis de los <script> embebidos en index.html.
//
// El proyecto es un único HTML con todo el JavaScript inline, así que no hay
// build ni linter que avise de un error de sintaxis: se descubriría en el
// navegador de una clienta. Este script extrae cada bloque inline y lo pasa
// por `node --check`, respetando si es módulo o script clásico.
//
// Uso:
//   npm run check
//
// Salida: código 0 si todos los bloques compilan, 1 si alguno falla.

import { readFileSync, writeFileSync, unlinkSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

const target = process.argv[2] || 'index.html';
const html = readFileSync(target, 'utf8');
const workDir = mkdtempSync(join(tmpdir(), 'ncv-check-'));

const SCRIPT_RE = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g;

let index = 0;
let checked = 0;
let failed = 0;
let match;

while ((match = SCRIPT_RE.exec(html)) !== null) {
    index += 1;

    const openTag = match[0].slice(0, match[0].indexOf('>') + 1);
    const body = match[1];

    // Los <script src="..."> no tienen cuerpo propio que validar.
    if (/\ssrc=/.test(openTag) || !body.trim()) continue;

    const isModule = /type\s*=\s*["']module["']/.test(openTag);
    const startLine = html.slice(0, match.index).split('\n').length;
    const file = join(workDir, `block-${index}${isModule ? '.mjs' : '.cjs'}`);

    writeFileSync(file, body);
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    unlinkSync(file);

    checked += 1;

    if (result.status === 0) {
        console.log(`OK    bloque #${index}  linea ${startLine}  ${isModule ? 'module' : 'classic'}`);
    } else {
        failed += 1;
        console.error(`FALLO bloque #${index}  linea ${startLine}  ${isModule ? 'module' : 'classic'}`);
        console.error(result.stderr.split('\n').slice(0, 15).join('\n'));
    }
}

rmSync(workDir, { recursive: true, force: true });

console.log(`\n${checked} bloque(s) inline revisados en ${target}, ${failed} con error.`);
process.exit(failed > 0 ? 1 : 0);
