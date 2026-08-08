import { mkdir, rm, copyFile, cp, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';

const root = process.cwd();
const publicDir = join(root, 'public');

const requiredFiles = [
    'index.html'
];

const optionalFiles = [
    'favicon.ico',
    'manifest.json',
    'manifest.webmanifest',
    'robots.txt',
    'site.webmanifest',
    'apple-touch-icon.png'
];

async function exists(path) {
    try {
        await stat(path);
        return true;
    } catch {
        return false;
    }
}

async function cleanPublicDir() {
    await mkdir(publicDir, { recursive: true });
    const entries = await readdir(publicDir, { withFileTypes: true });
    for (const entry of entries) {
        await rm(join(publicDir, entry.name), { recursive: true, force: true });
    }
}

async function copyRequiredFiles() {
    for (const file of requiredFiles) {
        const source = join(root, file);
        const destination = join(publicDir, file);
        if (!(await exists(source))) {
            throw new Error(`Falta el archivo requerido para Hosting: ${file}`);
        }
        await copyFile(source, destination);
    }
}

async function copyOptionalFiles() {
    for (const file of optionalFiles) {
        const source = join(root, file);
        const destination = join(publicDir, file);
        if (await exists(source)) {
            await copyFile(source, destination);
        }
    }
}

async function copyAssets() {
    const source = join(root, 'assets');
    const destination = join(publicDir, 'assets');
    if (!(await exists(source))) {
        throw new Error('Falta la carpeta assets/ requerida para Hosting.');
    }
    await cp(source, destination, { recursive: true });
}

async function listPublicFiles() {
    const files = [];
    async function walk(currentDir, base = '') {
        const entries = await readdir(currentDir, { withFileTypes: true });
        for (const entry of entries) {
            const relative = base ? `${base}/${entry.name}` : entry.name;
            const absolute = join(currentDir, entry.name);
            if (entry.isDirectory()) {
                await walk(absolute, relative);
            } else {
                files.push(relative.replace(/\\/g, '/'));
            }
        }
    }

    await walk(publicDir);
    return files.sort();
}

await cleanPublicDir();
await copyRequiredFiles();
await copyOptionalFiles();
await copyAssets();

const files = await listPublicFiles();
console.log('Hosting preparado en public/');
for (const file of files) {
    console.log(`- ${file}`);
}
