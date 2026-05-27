/* =============================================
   ScanForge — Motor OCR Interno (Tesseract)
   
   Envía la imagen al servidor propio para
   procesarla con Tesseract Multi-PSM + NLP.
   Sin dependencias externas, sin inicios de sesión.
   ============================================= */

const OCR = {

  /**
   * Escanea una imagen usando el servidor propio.
   * @param {File} imageSource - Archivo de imagen.
   * @param {Function} onProgress - Callback de progreso.
   * @returns {Promise<{text: string, confidence: number}|null>}
   */
  async scanImage(imageSource, onProgress) {
    try {
      if (typeof onProgress === 'function') {
        onProgress({ status: 'Preparando imagen...', progress: 0.1 });
      }
      console.log('[ScanForge] Enviando al motor OCR interno del servidor...');
      return await this._serverOCR(imageSource, onProgress);
    } catch (error) {
      console.error('[ScanForge OCR] Error fatal en OCR:', error);
      return null;
    }
  },

  /**
   * Envía la imagen al servidor y espera el resultado.
   * Usa AbortController con 120 segundos de timeout para aguantar
   * el arranque en frío de Render (Tesseract tarda ~30-60s en cargarse).
   */
  async _serverOCR(imageSource, onProgress) {
    if (typeof onProgress === 'function') {
      onProgress({ status: 'Analizando imagen con el servidor...', progress: 0.2 });
    }

    const base64 = await this._fileToBase64(imageSource);

    // AbortController: cancela la petición si tarda más de 120 segundos
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    let response;
    try {
      response = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64 }),
        signal: controller.signal,
      });
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        throw new Error('El servidor tardó demasiado en responder. Por favor intenta de nuevo.');
      }
      throw fetchError;
    }
    clearTimeout(timeoutId);

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.mensaje || `Error del servidor (${response.status})`);
    }

    if (typeof onProgress === 'function') {
      onProgress({ status: `✅ Texto extraído (${data.mode || 'auto'})`, progress: 1 });
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
