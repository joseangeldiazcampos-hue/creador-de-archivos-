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
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

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

// --- Middlewares de Seguridad Básicos ---
app.use(helmet({
  contentSecurityPolicy: false, // Se desactiva temporalmente CSP para permitir scripts de terceros (como Puter.js)
  crossOriginEmbedderPolicy: false
}));

// --- Limitador de Peticiones (Rate Limiting) ---
// Evita ataques DDoS o abusos en la API
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // Limita a 100 peticiones por IP cada 15 minutos
  message: { error: 'Demasiadas peticiones desde esta IP, por favor inténtelo de nuevo después de 15 minutos.' }
});
app.use(limiter);

// --- Middlewares Generales ---
app.use(cors());
// Limitar severamente el tamaño del JSON para prevenir saturación de memoria
app.use(express.json({ limit: '5mb' })); // Cambiado de 50mb a 5mb (el OCR en el cliente envía texto, no imagen)
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
