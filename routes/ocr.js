/**
 * ScanForge - Motor OCR (3 Variantes en Paralelo)
 *
 * Genera 3 versiones de la imagen simultáneamente y devuelve
 * los 3 resultados para que el usuario elija el mejor.
 */

const express = require('express');
const sharp = require('sharp');
const Tesseract = require('tesseract.js');

const router = express.Router();

// ─── Pool de 3 workers (uno por variante, corren en paralelo) ──────────────
let workers = null;

async function getWorkers() {
  if (workers) return workers;
  console.log('🔄 Inicializando 3 workers de Tesseract en paralelo...');
  workers = await Promise.all([
    Tesseract.createWorker('spa+eng', 1),
    Tesseract.createWorker('spa+eng', 1),
    Tesseract.createWorker('spa+eng', 1),
  ]);
  console.log('✅ 3 workers listos');
  return workers;
}

// Pre-calentar al arrancar el servidor
getWorkers().catch(err => console.error('⚠️ Warmup falló:', err.message));

// ─── Pre-procesamiento ─────────────────────────────────────────────────────

async function buildVariants(imageBuffer) {
  const meta = await sharp(imageBuffer).metadata();
  const targetWidth = Math.max(meta.width || 800, 2800);

  const base = () => sharp(imageBuffer).resize({
    width: targetWidth,
    kernel: sharp.kernel.lanczos3,
    withoutEnlargement: false,
  }).grayscale();

  const [a, b, c] = await Promise.all([
    // Variante A: Estándar - buena para la mayoría de documentos
    base().normalize().linear(1.3, -15).sharpen({ sigma: 2.0 }).png({ compressionLevel: 1 }).toBuffer(),
    // Variante B: Ultra contraste - para imágenes borrosas o con mal foco
    base().normalize().linear(2.2, -70).sharpen({ sigma: 3.0, m1: 2.0, m2: 3.0 }).png({ compressionLevel: 1 }).toBuffer(),
    // Variante C: Invertida - para texto claro sobre fondo oscuro
    base().normalize().negate().linear(1.3, -15).sharpen({ sigma: 2.0 }).png({ compressionLevel: 1 }).toBuffer(),
  ]);

  return [
    { id: 'A', label: 'Estándar',       buffer: a },
    { id: 'B', label: 'Alto Contraste', buffer: b },
    { id: 'C', label: 'Invertida',      buffer: c },
  ];
}

// ─── Limpieza de texto ─────────────────────────────────────────────────────

function cleanText(text) {
  if (!text) return '';
  return text.split('\n').map(line =>
    line.replace(/[|\\\\/\[\]{}]/g, ' ').replace(/—/g, ' ')
        .replace(/[-=_]{2,}/g, ' ').replace(/\s+/g, ' ').trim()
  ).filter(line => {
    if (line.length <= 2) return false;
    const alpha = (line.match(/[a-záéíóúñA-ZÁÉÍÓÚÑ0-9]/g) || []).length;
    return alpha / line.length > 0.25;
  }).join('\n').trim();
}

function autoCorrect(text) {
  if (!text) return '';
  return text
    .replace(/([a-záéíóúñA-ZÁÉÍÓÚÑ])0([a-záéíóúñA-ZÁÉÍÓÚÑ])/g, '$1o$2')
    .replace(/([a-záéíóúñA-ZÁÉÍÓÚÑ])1([a-záéíóúñA-ZÁÉÍÓÚÑ])/g, '$1l$2')
    .replace(/ {2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

// ─── Ruta POST /api/ocr ────────────────────────────────────────────────────

router.post('/api/ocr', async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) return res.status(400).json({ error: 'Imagen requerida' });

    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');
    console.log(`📸 Imagen: ${(imageBuffer.length / 1024).toFixed(0)} KB`);

    const [variants, wks] = await Promise.all([
      buildVariants(imageBuffer),
      getWorkers(),
    ]);

    // Correr los 3 workers en paralelo (uno por variante) — mucho más rápido
    const results = await Promise.all(variants.map(async (variant, i) => {
      const w = wks[i];
      try {
        await w.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' });
        const result = await w.recognize(variant.buffer);
        const text = autoCorrect(cleanText(result.data.text || ''));
        const confidence = Math.round(result.data.confidence || 0);
        console.log(`  ✅ Variante ${variant.id} (${variant.label}): conf=${confidence}%, chars=${text.length}`);
        return { id: variant.id, label: variant.label, text, confidence };
      } catch (e) {
        console.error(`  ❌ Error variante ${variant.id}:`, e.message);
        return { id: variant.id, label: variant.label, text: '', confidence: 0 };
      }
    }));

    // Ordenar por confianza descendente (la mejor primero)
    results.sort((a, b) => b.confidence - a.confidence);

    console.log(`✅ OCR completado — Mejor: Variante ${results[0].id} (${results[0].confidence}%)`);

    // Devolver las 3 opciones para que el usuario elija
    res.json({ options: results, engine: 'server' });

  } catch (error) {
    console.error('❌ Error OCR:', error.message);
    if (workers) {
      try { await Promise.all(workers.map(w => w.terminate())); } catch (_) {}
      workers = null;
    }
    res.status(500).json({ error: 'Error de OCR', mensaje: error.message });
  }
});

module.exports = router;
