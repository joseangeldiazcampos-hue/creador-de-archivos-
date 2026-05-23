/**
 * ScanForge - Servidor Principal
 * 
 * El OCR se realiza en el cliente con Puter.js (IA).
 * Este servidor maneja la conversión de texto a archivos
 * (Excel, Word, PDF, TXT) y sirve los archivos estáticos.
 */

const express = require('express');
const cors = require('cors');
const path = require('path');

// Importar rutas
const convertRoutes = require('./routes/convert');

// OCR del servidor (respaldo, usa sharp + tesseract.js)
let ocrRoutes = null;
try {
  ocrRoutes = require('./routes/ocr');
} catch (e) {
  console.log('⚠️ OCR del servidor no disponible (respaldo desactivado):', e.message);
}

const app = express();

// --- Middlewares ---
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// --- Rutas ---
app.use(convertRoutes);
if (ocrRoutes) app.use(ocrRoutes);

// --- Manejo de errores global ---

// Middleware de manejo de errores no capturados
app.use((err, _req, res, _next) => {
  console.error('❌ Error no capturado:', err.message);
  res.status(500).json({
    error: 'Error interno del servidor',
    mensaje: 'Ocurrió un error inesperado. Intente nuevamente.',
  });
});

// --- Iniciar el servidor ---

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log('═══════════════════════════════════════════');
  console.log('  🔥 ScanForge - Servidor activo');
  console.log(`  🌐 Puerto: ${PORT}`);
  console.log(`  📂 Archivos estáticos: /public`);
  console.log(`  🔗 API de conversión: POST /api/convert`);
  console.log(`  ⏰ Iniciado: ${new Date().toLocaleString('es-MX')}`);
  console.log('═══════════════════════════════════════════');
});
