/**
 * ScanForge - OCR en el Servidor (Multi-PSM)
 * 
 * Prueba múltiples modos de segmentación de Tesseract (PSM)
 * para manejar diferentes tipos de documentos:
 * - Texto normal, columnas, infografías, tablas, etc.
 * 
 * Incluye limpieza de texto basura (bordes de cajas leídos como |, -, \)
 */

const express = require('express');
const sharp = require('sharp');
const Tesseract = require('tesseract.js');

const router = express.Router();

let worker = null;

/**
 * Inicializa el worker de Tesseract.
 */
async function getWorker() {
  if (worker) return worker;
  console.log('🔄 Inicializando worker de Tesseract...');
  try {
    worker = await Tesseract.createWorker('spa+eng', 1, {
      cacheMethod: 'readOnly', // No intentar escribir en disco en producción
    });
    console.log('✅ Worker de Tesseract listo');
  } catch (err) {
    console.error('❌ Error creando worker de Tesseract:', err.message);
    worker = null;
    throw err;
  }
  return worker;
}

// Pre-calentar Tesseract al iniciar el servidor para no tener el retraso en la primera petición
getWorker().catch(err => console.error('⚠️ Warmup de Tesseract falló:', err.message));

/**
 * Prepara la imagen con sharp (suave, sin binarización).
 */
async function preprocessImage(imageBuffer) {
  const meta = await sharp(imageBuffer).metadata();
  const w = meta.width || 800;

  // Escalar agresivamente para texto pequeño
  const targetWidth = 3500;
  const needsUpscale = w < targetWidth;

  let pipe = sharp(imageBuffer);

  if (needsUpscale) {
    pipe = pipe.resize({
      width: targetWidth,
      kernel: sharp.kernel.lanczos3,
      withoutEnlargement: false,
    });
  }

  // Pre-procesamiento compatible: grises + contraste lineal + nitidez fuerte
  // Se evita .clahe() porque no está disponible en todos los entornos de producción
  const processed = await pipe
    .grayscale()
    .normalize()
    .linear(1.3, -15)   // Contraste aumentado
    .sharpen({ sigma: 2.0, m1: 1.0, m2: 2.0 }) // Letras con bordes nítidos
    .png({ compressionLevel: 1 }) // PNG rápido sin comprimir mucho
    .toBuffer();

  return processed;
}

/**
 * Limpia el texto extraído: quita basura de bordes/cajas.
 */
function cleanText(text) {
  if (!text) return '';

  let lines = text.split('\n');

  lines = lines.map(line => {
    // Quitar líneas que son solo símbolos de bordes/cajas
    // Ejemplo: "| — — — — |", "== = ——", "- — - — -"
    let cleaned = line
      .replace(/[|\\\/\[\]{}]/g, ' ')  // Quitar pipes, barras, corchetes
      .replace(/—/g, ' ')              // Quitar em-dash
      .replace(/[-=_]{2,}/g, ' ')      // Quitar líneas de guiones/iguales repetidos
      .replace(/\s+/g, ' ')            // Colapsar espacios
      .trim();

    return cleaned;
  });

  // Filtrar líneas vacías o que solo tienen 1-2 caracteres basura
  lines = lines.filter(line => {
    if (line.length <= 2) return false;
    // Si la línea es casi toda símbolos, quitarla
    const alphaCount = (line.match(/[a-záéíóúñA-ZÁÉÍÓÚÑ0-9]/g) || []).length;
    const ratio = alphaCount / line.length;
    return ratio > 0.3; // Al menos 30% de la línea debe ser texto real
  });

  return lines.join('\n').trim();
}

/**
 * Mejora: Corrección Automática (NLP Básico)
 * Corrige errores comunes de interpretación óptica (letras confundidas con números).
 */
function autoCorrectText(text) {
  if (!text) return '';
  return text
    // Corrige '0' leídos como 'O' dentro de palabras (ej. "h0la" -> "hola")
    .replace(/([a-zA-ZáéíóúÁÉÍÓÚñÑ])0([a-zA-ZáéíóúÁÉÍÓÚñÑ])/g, '$1o$2')
    // Corrige '1' leídos como 'l' dentro de palabras
    .replace(/([a-zA-ZáéíóúÁÉÍÓÚñÑ])1([a-zA-ZáéíóúÁÉÍÓÚñÑ])/g, '$1l$2')
    // Normalizar múltiples espacios a uno solo
    .replace(/ {2,}/g, ' ')
    // Limpiar saltos de línea exagerados
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * POST /api/ocr
 * 
 * Multi-PSM: prueba 3 modos de segmentación de página:
 * - PSM 3: Automático (bueno para documentos normales)
 * - PSM 6: Bloque uniforme (bueno para párrafos)
 * - PSM 11: Texto disperso (bueno para infografías/diseños complejos)
 * - PSM 4: Columna de texto (bueno para libros)
 */
router.post('/api/ocr', async (req, res) => {
  try {
    const { image } = req.body;

    if (!image) {
      return res.status(400).json({
        error: 'Imagen requerida',
        mensaje: 'Debe enviar la imagen en formato base64.',
      });
    }

    // Decodificar base64
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');
    console.log(`📸 Imagen recibida: ${(imageBuffer.length / 1024).toFixed(0)} KB`);

    // Preprocesar imagen (suave)
    const processed = await preprocessImage(imageBuffer);
    console.log(`🖼️ Imagen procesada: ${(processed.length / 1024).toFixed(0)} KB`);

    // Obtener worker
    const w = await getWorker();

    // Probar múltiples modos de segmentación
    const psmModes = [
      { psm: '6',  name: 'bloque_uniforme' },
      { psm: '4',  name: 'columna_texto' },
      { psm: '3',  name: 'automático' },
      { psm: '11', name: 'texto_disperso' },
    ];

    const results = [];

    for (const mode of psmModes) {
      try {
        // Configurar PSM para esta pasada
        await w.setParameters({
          tessedit_pageseg_mode: mode.psm,
          preserve_interword_spaces: '1',
        });

        const result = await w.recognize(processed);
        const rawText = (result.data.text || '').trim();
        const cleaned = cleanText(rawText);
        const confidence = result.data.confidence || 0;

        console.log(`  📝 PSM ${mode.psm} (${mode.name}): confianza=${confidence.toFixed(1)}%, chars_raw=${rawText.length}, chars_clean=${cleaned.length}`);

        results.push({
          psm: mode.psm,
          name: mode.name,
          text: cleaned,
          rawText: rawText,
          confidence,
          // Score combinado: confianza * cantidad de texto útil
          score: confidence * Math.min(cleaned.length, 2000) / 100,
        });

        // Mejora: Early Stopping (Velocidad x4)
        // Si el texto es de muy alta calidad y logramos más de 95% de confianza, detenemos la búsqueda
        if (confidence >= 95 && cleaned.length > 20) {
          console.log(`🚀 Early Stopping! Confianza estelar del ${confidence.toFixed(1)}% en modo ${mode.name}. Deteniendo escaneo extra.`);
          break; 
        }
      } catch (e) {
        console.error(`  ❌ Error PSM ${mode.psm}:`, e.message);
      }
    }

    // Elegir el mejor: mayor score (confianza * texto útil)
    const validResults = results.filter(r => r.text.length > 5);

    if (validResults.length === 0) {
      console.log('❌ Ningún resultado válido');
      return res.json({
        text: results[0]?.rawText || '',
        confidence: results[0]?.confidence || 0,
        engine: 'server',
      });
    }

    validResults.sort((a, b) => b.score - a.score);
    const best = validResults[0];

    console.log(`✅ Mejor: PSM ${best.psm} (${best.name}) — confianza: ${best.confidence.toFixed(1)}%, score: ${best.score.toFixed(0)}`);

    res.json({
      text: autoCorrectText(best.text), // Aplicamos el NLP final aquí
      confidence: best.confidence,
      engine: 'server',
      mode: best.name,
    });

  } catch (error) {
    console.error('❌ Error en OCR servidor:', error.message);

    if (worker) {
      try { await worker.terminate(); } catch (e) { /* ignorar */ }
      worker = null;
    }

    res.status(500).json({
      error: 'Error de OCR',
      mensaje: 'No se pudo procesar la imagen: ' + error.message,
    });
  }
});

module.exports = router;
