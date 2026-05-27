/**
 * ScanForge - Motor OCR Ultra (Multi-PSM + Multi-Preprocesamiento)
 *
 * Estrategia de máxima precisión:
 * 1. Prueba la imagen en 3 variantes de preprocesamiento (original, alto contraste, invertida)
 * 2. Por cada variante corre hasta 4 modos PSM de Tesseract
 * 3. Early Stopping: si alguna combinación supera el 95% de confianza, para de inmediato
 * 4. Elige el resultado con mayor score (confianza × cantidad de texto)
 * 5. Aplica autoCorrect NLP al texto ganador
 */

const express = require('express');
const sharp = require('sharp');
const Tesseract = require('tesseract.js');

const router = express.Router();

let worker = null;

// ─── Worker ────────────────────────────────────────────────────────────────

async function getWorker() {
  if (worker) return worker;
  console.log('🔄 Inicializando worker de Tesseract...');
  try {
    worker = await Tesseract.createWorker('spa+eng', 1);
    console.log('✅ Worker de Tesseract listo');
  } catch (err) {
    console.error('❌ Error creando worker:', err.message);
    worker = null;
    throw err;
  }
  return worker;
}

// Pre-calentar Tesseract al arrancar el servidor
getWorker().catch(err => console.error('⚠️ Warmup falló:', err.message));

// ─── Pre-procesamiento ─────────────────────────────────────────────────────

/**
 * Genera múltiples variantes de la imagen para maximizar la lectura.
 * Variante A: Estándar (grises + contraste fuerte)
 * Variante B: Ultra-contraste (para texto muy claro o borroso)
 * Variante C: Invertida (para texto blanco sobre fondo oscuro)
 */
async function generateVariants(imageBuffer) {
  const meta = await sharp(imageBuffer).metadata();
  const w = meta.width || 800;
  const targetWidth = Math.max(w, 3000); // Mínimo 3000px de ancho para mejor OCR

  const base = sharp(imageBuffer).resize({
    width: targetWidth,
    kernel: sharp.kernel.lanczos3,
    withoutEnlargement: false,
  });

  const [varA, varB, varC] = await Promise.all([
    // Variante A: Estándar
    base.clone()
      .grayscale()
      .normalize()
      .linear(1.3, -15)
      .sharpen({ sigma: 2.0, m1: 1.0, m2: 2.0 })
      .png({ compressionLevel: 1 })
      .toBuffer(),

    // Variante B: Ultra contraste (para imágenes con mal foco o iluminación)
    base.clone()
      .grayscale()
      .normalize()
      .linear(2.0, -60)
      .sharpen({ sigma: 3.0, m1: 2.0, m2: 3.0 })
      .png({ compressionLevel: 1 })
      .toBuffer(),

    // Variante C: Invertida (texto claro sobre fondo oscuro)
    base.clone()
      .grayscale()
      .normalize()
      .negate()
      .linear(1.3, -15)
      .sharpen({ sigma: 2.0 })
      .png({ compressionLevel: 1 })
      .toBuffer(),
  ]);

  return [
    { name: 'estándar',       buffer: varA },
    { name: 'ultra-contraste', buffer: varB },
    { name: 'invertida',       buffer: varC },
  ];
}

// ─── Limpieza de texto ──────────────────────────────────────────────────────

function cleanText(text) {
  if (!text) return '';
  let lines = text.split('\n').map(line =>
    line
      .replace(/[|\\\\/\[\]{}]/g, ' ')
      .replace(/—/g, ' ')
      .replace(/[-=_]{2,}/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  ).filter(line => {
    if (line.length <= 2) return false;
    const alpha = (line.match(/[a-záéíóúñA-ZÁÉÍÓÚÑ0-9]/g) || []).length;
    return alpha / line.length > 0.25;
  });
  return lines.join('\n').trim();
}

// ─── Corrección NLP ──────────────────────────────────────────────────────────

function autoCorrectText(text) {
  if (!text) return '';
  return text
    .replace(/([a-záéíóúñA-ZÁÉÍÓÚÑ])0([a-záéíóúñA-ZÁÉÍÓÚÑ])/g, '$1o$2')
    .replace(/([a-záéíóúñA-ZÁÉÍÓÚÑ])1([a-záéíóúñA-ZÁÉÍÓÚÑ])/g, '$1l$2')
    .replace(/ {2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ─── Ruta POST /api/ocr ─────────────────────────────────────────────────────

const PSM_MODES = [
  { psm: '6',  name: 'bloque' },
  { psm: '3',  name: 'auto' },
  { psm: '4',  name: 'columna' },
  { psm: '11', name: 'disperso' },
];

router.post('/api/ocr', async (req, res) => {
  try {
    const { image } = req.body;

    if (!image) {
      return res.status(400).json({ error: 'Imagen requerida', mensaje: 'Envía la imagen en formato base64.' });
    }

    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');
    console.log(`📸 Imagen recibida: ${(imageBuffer.length / 1024).toFixed(0)} KB`);

    const variants = await generateVariants(imageBuffer);
    const w = await getWorker();

    const allResults = [];
    let stopped = false;

    outer: for (const variant of variants) {
      console.log(`\n🖼️  Variante: ${variant.name}`);
      for (const mode of PSM_MODES) {
        if (stopped) break outer;

        try {
          await w.setParameters({
            tessedit_pageseg_mode: mode.psm,
            preserve_interword_spaces: '1',
          });

          const result = await w.recognize(variant.buffer);
          const raw = (result.data.text || '').trim();
          const cleaned = cleanText(raw);
          const confidence = result.data.confidence || 0;
          const score = confidence * Math.min(cleaned.length, 3000) / 100;

          console.log(`  PSM ${mode.psm} (${mode.name}): conf=${confidence.toFixed(1)}%, chars=${cleaned.length}, score=${score.toFixed(0)}`);

          allResults.push({ variant: variant.name, psm: mode.psm, name: mode.name, text: cleaned, confidence, score });

          // Early Stopping: 95% de confianza con texto real es perfecto
          if (confidence >= 95 && cleaned.length > 20) {
            console.log(`🚀 Early Stopping! ${confidence.toFixed(1)}% en variante "${variant.name}" PSM ${mode.psm}`);
            stopped = true;
          }
        } catch (e) {
          console.error(`  ❌ Error PSM ${mode.psm}:`, e.message);
        }
      }
    }

    const valid = allResults.filter(r => r.text.length > 5);
    if (valid.length === 0) {
      return res.json({ text: '', confidence: 0, engine: 'server', mode: 'ninguno' });
    }

    valid.sort((a, b) => b.score - a.score);
    const best = valid[0];
    console.log(`\n✅ Ganador: variante "${best.variant}" PSM ${best.psm} — confianza: ${best.confidence.toFixed(1)}%`);

    res.json({
      text: autoCorrectText(best.text),
      confidence: best.confidence,
      engine: 'server',
      mode: `${best.variant}/${best.name}`,
    });

  } catch (error) {
    console.error('❌ Error general en OCR:', error.message);
    if (worker) {
      try { await worker.terminate(); } catch (_) {}
      worker = null;
    }
    res.status(500).json({ error: 'Error de OCR', mensaje: 'No se pudo procesar la imagen: ' + error.message });
  }
});

module.exports = router;
