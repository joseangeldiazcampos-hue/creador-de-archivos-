/**
 * ScanForge - Servidor Principal
 * 
 * Servidor Express que gestiona la conversión de texto escaneado (OCR)
 * a múltiples formatos de archivo: Excel, Word, PDF y TXT.
 * 
 * El OCR se realiza en el cliente con Tesseract.js; este servidor
 * se encarga únicamente de la conversión y descarga de archivos.
 */

const express = require('express');
const cors = require('cors');
const path = require('path');

// Importar rutas de conversión
const convertRoutes = require('./routes/convert');

// Crear la aplicación Express
const app = express();

// --- Middlewares ---

// Habilitar CORS para permitir peticiones desde cualquier origen
app.use(cors());

// Parsear cuerpos JSON con un límite de 50MB para textos extensos
app.use(express.json({ limit: '50mb' }));

// Servir archivos estáticos desde la carpeta 'public'
app.use(express.static(path.join(__dirname, 'public')));

// --- Rutas ---

// Montar las rutas de conversión de archivos
app.use(convertRoutes);

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
