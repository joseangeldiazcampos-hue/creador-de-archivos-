/* =============================================
   ScanForge — Módulo de OCR con Puter.js
   
   Usa IA real (no Tesseract) para leer texto
   de cualquier imagen: fotos, infografías,
   texto pequeño, diseños complejos, etc.
   
   Gratis, sin API key, sin configuración.
   ============================================= */

const OCR = {

  /**
   * Escanea una imagen usando Puter.js (IA).
   * 
   * @param {File} imageSource - Archivo de imagen.
   * @param {Function} onProgress - Callback de progreso.
   * @returns {Promise<{text: string, confidence: number}|null>}
   */
  async scanImage(imageSource, onProgress) {
    try {
      // Verificar que puter esté disponible
      if (typeof puter === 'undefined') {
        throw new Error('Puter.js no está cargado');
      }

      // Paso 1: Preparar
      if (typeof onProgress === 'function') {
        onProgress({ status: 'Preparando imagen...', progress: 0.1 });
      }

      // Paso 2: Enviar a la IA
      if (typeof onProgress === 'function') {
        onProgress({ status: 'Analizando imagen con IA...', progress: 0.3 });
      }

      // puter.ai.img2txt acepta File, Blob, URL o data URL
      const text = await puter.ai.img2txt(imageSource);

      if (typeof onProgress === 'function') {
        onProgress({ status: 'Texto extraído', progress: 1 });
      }

      if (!text || text.trim().length === 0) {
        return { text: '', confidence: 0 };
      }

      return {
        text: text.trim(),
        confidence: 95, // La IA generalmente tiene alta confianza
      };

    } catch (error) {
      console.error('[ScanForge OCR] Error:', error);

      // Si Puter falla, intentar con el servidor como respaldo
      console.log('[ScanForge] Intentando OCR del servidor como respaldo...');
      try {
        return await this._fallbackServerOCR(imageSource, onProgress);
      } catch (fallbackError) {
        console.error('[ScanForge] Respaldo también falló:', fallbackError);
        return null;
      }
    }
  },

  /**
   * Respaldo: OCR del servidor (Tesseract) si Puter.js falla.
   */
  async _fallbackServerOCR(imageSource, onProgress) {
    if (typeof onProgress === 'function') {
      onProgress({ status: 'Usando OCR alternativo...', progress: 0.3 });
    }

    const base64 = await this._fileToBase64(imageSource);

    const response = await fetch('/api/ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64 }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.mensaje || 'Error en OCR del servidor');
    }

    if (typeof onProgress === 'function') {
      onProgress({ status: 'Texto extraído (respaldo)', progress: 1 });
    }

    return {
      text: data.text || '',
      confidence: data.confidence || 0,
    };
  },

  /**
   * Convierte un File a base64 (data URI).
   */
  _fileToBase64(file) {
    return new Promise((resolve, reject) => {
      if (typeof file === 'string') { resolve(file); return; }
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },
};
