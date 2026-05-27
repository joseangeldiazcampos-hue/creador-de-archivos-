/**
 * ScanForge - Motor OCR (1 Worker, 3 Modos PSM → 3 Opciones)
 *
 * Usa un único worker de Tesseract (ahorra RAM en Render free tier ~512MB)
 * y corre 3 modos PSM distintos secuencialmente.
 * Devuelve las 3 opciones ordenadas por confianza para que el usuario elija.
 */

const express = require('express');
const sharp = require('sharp');
const Tesseract = require('tesseract.js');

const router = express.Router();

let worker = null;
let workerReady = false;

// ─── Worker único ──────────────────────────────────────────────────────────

async function getWorker() {
  if (worker && workerReady) return worker;
  if (worker) {
    try { await worker.terminate(); } catch (_) {}
    worker = null;
  }
  console.log('🔄 Inicializando worker Tesseract...');
  worker = await Tesseract.createWorker('spa+eng', 1);
  workerReady = true;
  console.log('✅ Worker listo');
  return worker;
}

// Pre-calentar al arrancar
getWorker().catch(err => {
  console.error('⚠️ Warmup falló:', err.message);
  worker = null;
  workerReady = false;
});

// ─── Pre-procesamiento ─────────────────────────────────────────────────────

async function preprocessImage(imageBuffer) {
  const meta = await sharp(imageBuffer).metadata();
  const targetWidth = Math.max(meta.width || 800, 2500);

  return sharp(imageBuffer)
    .resize({ width: targetWidth, kernel: sharp.kernel.lanczos3, withoutEnlargement: false })
    .grayscale()
    .normalize()
    .linear(1.4, -20)
    .sharpen({ sigma: 2.0 })
    .png({ compressionLevel: 1 })
    .toBuffer();
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
    .replace(/ {2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ─── 3 Modos PSM para dar al usuario 3 versiones ──────────────────────────

const PSM_OPTIONS = [
  { psm: '6',  label: 'Bloque de texto',   desc: 'Ideal para párrafos y documentos' },
  { psm: '3',  label: 'Automático',        desc: 'Detección automática de estructura' },
  { psm: '11', label: 'Texto disperso',    desc: 'Ideal para infografías y diseños' },
];

// ─── Ruta POST /api/ocr ────────────────────────────────────────────────────

router.post('/api/ocr', async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) return res.status(400).json({ error: 'Imagen requerida' });

    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');
    console.log(`📸 Imagen: ${(imageBuffer.length / 1024).toFixed(0)} KB`);

    const processed = await preprocessImage(imageBuffer);
    console.log(`🖼️ Preprocesada: ${(processed.length / 1024).toFixed(0)} KB`);

    const w = await getWorker();
    const results = [];

    for (const mode of PSM_OPTIONS) {
      try {
        await w.setParameters({
          tessedit_pageseg_mode: mode.psm,
          preserve_interword_spaces: '1',
        });

        const result = await w.recognize(processed);
        const raw = (result.data.text || '').trim();
        const text = autoCorrect(cleanText(raw));
        const confidence = Math.round(result.data.confidence || 0);

        console.log(`  PSM ${mode.psm} (${mode.label}): conf=${confidence}%, chars=${text.length}`);

        results.push({
          id: mode.psm,
          label: mode.label,
          desc: mode.desc,
          text,
          confidence,
        });
      } catch (e) {
        console.error(`  ❌ PSM ${mode.psm} error:`, e.message);
        results.push({ id: mode.psm, label: mode.label, desc: mode.desc, text: '', confidence: 0 });
      }
    }

    // Ordenar: mayor confianza primero
    results.sort((a, b) => b.confidence - a.confidence);

    // Si todos los resultados están vacíos, reportarlo
    const hasText = results.some(r => r.text.length > 5);
    if (!hasText) {
      console.log('❌ No se detectó texto en ningún modo.');
      return res.json({
        options: results,
        engine: 'server',
        error: 'no_text',
      });
    }

    console.log(`✅ Mejor: PSM ${results[0].id} (${results[0].confidence}%)`);
    res.json({ options: results, engine: 'server' });

  } catch (error) {
    console.error('❌ Error OCR:', error.message);
    workerReady = false;
    if (worker) {
      try { await worker.terminate(); } catch (_) {}
      worker = null;
    }
    res.status(500).json({ error: 'Error de OCR', mensaje: error.message });
  }
});

module.exports = router;
