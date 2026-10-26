// Genera un código QR (PNG y SVG) de la dirección pública de la demo.
// Uso: npm run qr                      -> usa VITE_PUBLIC_URL de .env.production o .env
//      npm run qr -- https://otro.sitio -> usa la dirección indicada
import QRCode from 'qrcode';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';

/** Lee VITE_PUBLIC_URL de un archivo .env sencillo (sin dependencias). */
function fromEnvFile(path) {
  if (!existsSync(path)) return '';
  const line = readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .find((l) => l.trim().startsWith('VITE_PUBLIC_URL='));
  return line ? line.slice(line.indexOf('=') + 1).trim() : '';
}

const url = process.argv[2] || process.env.VITE_PUBLIC_URL || fromEnvFile('.env.production') || fromEnvFile('.env');
if (!url || /tu-dominio\.example/.test(url)) {
  console.error('Falta la dirección pública. Define VITE_PUBLIC_URL en .env.production o pásala como argumento:\n  npm run qr -- https://tu-sitio.example/');
  process.exit(1);
}
mkdirSync('docs', { recursive: true });
await QRCode.toFile('docs/qr.png', url, { width: 640, margin: 2, errorCorrectionLevel: 'M' });
await QRCode.toFile('docs/qr.svg', url, { type: 'svg', margin: 2, errorCorrectionLevel: 'M' });
console.log('QR de ' + url + ' guardado en docs/qr.png y docs/qr.svg');
