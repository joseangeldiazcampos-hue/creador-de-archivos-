const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '..', 'public');

const svgIcon = `
<svg width="512" height="512" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="24" height="24" fill="#0f172a"/>
  <rect x="3" y="2" width="18" height="20" rx="2" stroke="#7c3aed" stroke-width="1.5"/>
  <path d="M7 7h10M7 11h10M7 15h6" stroke="#7431ed" stroke-width="1.5" stroke-linecap="round"/>
  <rect y="17" width="24" height="2" fill="#06b6d4"/>
</svg>
`;

async function generate() {
  try {
    // Generar Iconos
    await sharp(Buffer.from(svgIcon))
      .resize(192, 192)
      .png()
      .toFile(path.join(publicDir, 'icon-192.png'));
    
    await sharp(Buffer.from(svgIcon))
      .resize(512, 512)
      .png()
      .toFile(path.join(publicDir, 'icon-512.png'));

    // Generar un Screenshot de ejemplo (simulado, 1280x720)
    await sharp({
      create: {
        width: 1280,
        height: 720,
        channels: 4,
        background: { r: 15, g: 23, b: 42, alpha: 1 }
      }
    })
    .composite([
      { input: Buffer.from('<svg><text x="400" y="360" font-family="Arial" font-size="40" fill="#fff">ScanForge App Screenshot</text></svg>'), gravity: 'center' }
    ])
    .png()
    .toFile(path.join(publicDir, 'screenshot-1.png'));

    // Generar otro Screenshot para Mobile (720x1280)
    await sharp({
      create: {
        width: 720,
        height: 1280,
        channels: 4,
        background: { r: 15, g: 23, b: 42, alpha: 1 }
      }
    })
    .composite([
      { input: Buffer.from('<svg><text x="150" y="600" font-family="Arial" font-size="30" fill="#fff">ScanForge Mobile</text></svg>'), gravity: 'center' }
    ])
    .png()
    .toFile(path.join(publicDir, 'screenshot-2.png'));

    console.log('Activos generados correctamente');
  } catch (err) {
    console.error('Error generando activos:', err);
  }
}

generate();
