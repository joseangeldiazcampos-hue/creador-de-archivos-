/* =============================================
   ScanForge — Lógica principal de la aplicación
   ============================================= */

document.addEventListener('DOMContentLoaded', () => {

  /* ---------- Estado de la aplicación ---------- */
  let selectedFormat = null;
  let extractedText = '';

  /* ---------- Referencias al DOM ---------- */
  const dropZone        = document.getElementById('drop-zone');
  const fileInput        = document.getElementById('file-input');
  const cameraInput      = document.getElementById('camera-input');
  const btnUpload        = document.getElementById('btn-upload');
  const btnCamera        = document.getElementById('btn-camera');
  const previewImage     = document.getElementById('preview-image');
  const imagePreview     = document.getElementById('image-preview');
  const btnRemove        = document.getElementById('btn-remove');
  const extractedTextArea = document.getElementById('extracted-text');
  const formatCards      = document.querySelectorAll('.format-card');
  const filenameInput    = document.getElementById('filename');
  const btnConvert       = document.getElementById('btn-convert');
  const uploadSection    = document.getElementById('upload-section');
  const ocrSection       = document.getElementById('ocr-section');
  const formatSection    = document.getElementById('format-section');
  const successSection   = document.getElementById('success-section');
  const btnScanAnother   = document.getElementById('btn-scan-another');

  /* ========================================
     Drag & Drop
     ======================================== */
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');

    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      handleImage(file);
    } else {
      UI.showToast('Por favor, sube una imagen válida', 'error');
    }
  });

  // Clic en la zona de arrastre también abre el selector
  dropZone.addEventListener('click', (e) => {
    // Evitar que se dispare si se hizo clic en un botón
    if (e.target.closest('button')) return;
    fileInput.click();
  });

  /* ========================================
     Botones de subida / cámara
     ======================================== */
  btnUpload.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
  });

  btnCamera.addEventListener('click', (e) => {
    e.stopPropagation();
    cameraInput.click();
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) handleImage(e.target.files[0]);
  });

  cameraInput.addEventListener('change', (e) => {
    if (e.target.files[0]) handleImage(e.target.files[0]);
  });

  /* ========================================
     Quitar imagen
     ======================================== */
  btnRemove.addEventListener('click', () => {
    UI.resetAll();
    selectedFormat = null;
    extractedText = '';
  });

  /* ========================================
     Selección de formato
     ======================================== */
  formatCards.forEach((card) => {
    card.addEventListener('click', () => {
      formatCards.forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedFormat = card.dataset.format;
      btnConvert.disabled = false;
    });

    // Soporte de teclado (Enter / Espacio)
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        card.click();
      }
    });
  });

  /* ========================================
     Sincronizar textarea con estado
     ======================================== */
  extractedTextArea.addEventListener('input', (e) => {
    extractedText = e.target.value;

    // Actualizar contador de caracteres en tiempo real
    const statChars = document.getElementById('stat-chars');
    if (statChars) {
      statChars.textContent = `📝 ${extractedText.length} caracteres`;
    }
  });

  /* ========================================
     Botón de conversión
     ======================================== */
  btnConvert.addEventListener('click', handleConvert);

  /* ========================================
     Botón "Escanear otra imagen"
     ======================================== */
  if (btnScanAnother) {
    btnScanAnother.addEventListener('click', () => {
      UI.resetAll();
      selectedFormat = null;
      extractedText = '';
    });
  }

  /* ========================================
     Manejar la imagen subida
     ======================================== */
  async function handleImage(file) {
    // Validar tamaño (máximo 20 MB)
    const maxSize = 20 * 1024 * 1024;
    if (file.size > maxSize) {
      UI.showToast('La imagen es demasiado grande (máx. 20 MB)', 'error');
      return;
    }

    // Mostrar vista previa
    const reader = new FileReader();
    reader.onload = (e) => {
      previewImage.src = e.target.result;
      imagePreview.classList.remove('hidden');
      dropZone.classList.add('hidden');
    };
    reader.readAsDataURL(file);

    // Mostrar sección de OCR e iniciar escaneo
    UI.showSection(ocrSection);
    UI.updateProgress(0, 'Iniciando escaneo...');

    try {
      const result = await OCR.scanImage(file, (progress) => {
        const percent = Math.round(progress.progress * 100);
        UI.updateProgress(percent, progress.status);
      });

      if (result && result.text) {
        extractedText = result.text;
        extractedTextArea.value = result.text;

        // Actualizar barra de progreso
        UI.updateProgress(100, `✅ Completado — Confianza: ${Math.round(result.confidence)}%`);

        // Actualizar estadísticas
        const statConfidence = document.getElementById('stat-confidence');
        const statChars = document.getElementById('stat-chars');
        if (statConfidence) {
          statConfidence.textContent = `🎯 Confianza: ${Math.round(result.confidence)}%`;
        }
        if (statChars) {
          statChars.textContent = `📝 ${result.text.length} caracteres`;
        }

        // Mostrar sección de formato
        UI.showSection(formatSection);
        UI.showToast('¡Texto escaneado exitosamente!', 'success');

      } else {
        UI.updateProgress(0, '❌ No se pudo detectar texto');
        UI.showToast('No se pudo detectar texto en la imagen. Intenta con otra imagen.', 'error');
      }

    } catch (err) {
      console.error('[ScanForge] Error en OCR:', err);
      UI.updateProgress(0, '❌ Error en el escaneo');
      UI.showToast('Error al escanear: ' + (err.message || 'Error desconocido'), 'error');
    }
  }

  /* ========================================
     Manejar la conversión de formato
     ======================================== */
  async function handleConvert() {
    if (!selectedFormat) {
      UI.showToast('Selecciona un formato de archivo', 'error');
      return;
    }

    if (!extractedText.trim()) {
      UI.showToast('No hay texto para convertir. Escanea una imagen primero.', 'error');
      return;
    }

    const filename = filenameInput.value.trim() || 'documento_escaneado';
    UI.setButtonLoading(btnConvert, true);

    try {
      const response = await fetch('/api/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: extractedText,
          format: selectedFormat,
          filename: filename
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || `Error en la conversión (${response.status})`);
      }

      // Descargar el archivo generado
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}.${selectedFormat}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Éxito
      UI.setButtonLoading(btnConvert, false);
      UI.showSuccess();
      UI.showToast('¡Archivo descargado exitosamente!', 'success');

    } catch (err) {
      console.error('[ScanForge] Error en conversión:', err);
      UI.setButtonLoading(btnConvert, false);
      UI.showToast('Error: ' + (err.message || 'No se pudo generar el archivo'), 'error');
    }
  }
});
