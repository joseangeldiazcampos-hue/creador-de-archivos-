/* =============================================
   ScanForge — Módulo de OCR (Tesseract.js v5)
   ============================================= */

const OCR = {

  /**
   * Escanea una imagen y extrae el texto usando Tesseract.js.
   * @param {File|string} imageSource - Archivo de imagen o URL/base64.
   * @param {Function} onProgress - Callback de progreso: ({ status: string, progress: number }).
   * @returns {Promise<{text: string, confidence: number}|null>} Resultado del escaneo o null en caso de error.
   */
  async scanImage(imageSource, onProgress) {
    try {
      // Mensajes de estado en español para la interfaz
      const statusMessages = {
        'loading tesseract core':     'Cargando motor de OCR...',
        'initializing tesseract':     'Inicializando Tesseract...',
        'loading language traineddata': 'Cargando datos de idioma...',
        'initializing api':           'Preparando el reconocimiento...',
        'recognizing text':           'Reconociendo texto...',
      };

      const result = await Tesseract.recognize(imageSource, 'spa+eng', {
        logger: (m) => {
          if (typeof onProgress === 'function') {
            const status = statusMessages[m.status] || m.status;
            const progress = typeof m.progress === 'number' ? m.progress : 0;
            onProgress({ status, progress });
          }
        }
      });

      // Extraer datos del resultado
      const text = result.data.text || '';
      const confidence = result.data.confidence || 0;

      return { text: text.trim(), confidence };

    } catch (error) {
      console.error('[ScanForge OCR] Error al escanear la imagen:', error);
      return null;
    }
  }
};
