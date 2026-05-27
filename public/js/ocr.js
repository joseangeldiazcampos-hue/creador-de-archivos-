/* =============================================
   ScanForge — Motor OCR (3 opciones en paralelo)
   ============================================= */

const OCR = {

  async scanImage(imageSource, onProgress) {
    try {
      if (typeof onProgress === 'function') {
        onProgress({ status: 'Preparando imagen...', progress: 0.1 });
      }
      return await this._serverOCR(imageSource, onProgress);
    } catch (error) {
      console.error('[ScanForge OCR] Error:', error);
      return null;
    }
  },

  async _serverOCR(imageSource, onProgress) {
    if (typeof onProgress === 'function') {
      onProgress({ status: 'Analizando imagen (3 variantes en paralelo)...', progress: 0.3 });
    }

    const base64 = await this._fileToBase64(imageSource);

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
        throw new Error('El servidor tardó demasiado. Por favor intenta de nuevo.');
      }
      throw fetchError;
    }
    clearTimeout(timeoutId);

    const data = await response.json();
    if (!response.ok) throw new Error(data.mensaje || `Error ${response.status}`);

    if (typeof onProgress === 'function') {
      onProgress({ status: '✅ Análisis completado', progress: 1 });
    }

    // Retornar las 3 opciones para que app.js las muestre
    return { options: data.options || [] };
  },

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
