import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'attendance-tracker', 'dist');

if (!existsSync(dist)) {
  console.error('Build output missing. Run: npm run build:app');
  process.exit(1);
}

const copyFile = (name) => {
  cpSync(join(dist, name), join(root, name), { force: true });
};

copyFile('index.html');
cpSync(join(dist, 'index.html'), join(root, '404.html'), { force: true });
if (existsSync(join(dist, '404.html'))) {
  copyFile('404.html');
}

const assetsSrc = join(dist, 'assets');
const assetsDest = join(root, 'assets');
if (existsSync(assetsDest)) {
  rmSync(assetsDest, { recursive: true, force: true });
}
mkdirSync(assetsDest, { recursive: true });
cpSync(assetsSrc, assetsDest, { recursive: true });

for (const entry of readdirSync(dist, { withFileTypes: true })) {
  if (!entry.isFile()) continue;
  if (entry.name === 'index.html' || entry.name === '404.html') continue;
  cpSync(join(dist, entry.name), join(root, entry.name), { force: true });
}

console.log('Synced attendance-tracker/dist to repo root for GitHub Pages.');
