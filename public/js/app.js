/* =============================================
   ScanForge — Lógica principal de la aplicación
   ============================================= */

document.addEventListener('DOMContentLoaded', () => {

  /* ---------- Estado ---------- */
  let selectedFormat = null;
  let extractedText = '';
  let currentFile = null;

  /* ---------- DOM ---------- */
  const dropZone         = document.getElementById('drop-zone');
  const fileInput         = document.getElementById('file-input');
  const cameraInput       = document.getElementById('camera-input');
  const btnUpload         = document.getElementById('btn-upload');
  const btnCamera         = document.getElementById('btn-camera');
  const previewImage      = document.getElementById('preview-image');
  const imagePreview      = document.getElementById('image-preview');
  const btnRemove         = document.getElementById('btn-remove');
  const extractedTextArea = document.getElementById('extracted-text');
  const formatCards       = document.querySelectorAll('.format-card');
  const filenameInput     = document.getElementById('filename');
  const btnConvert        = document.getElementById('btn-convert');
  const uploadSection     = document.getElementById('upload-section');
  const ocrSection        = document.getElementById('ocr-section');
  const formatSection     = document.getElementById('format-section');
  const btnScanAnother    = document.getElementById('btn-scan-another');

  /* ========================================
     Drag & Drop
     ======================================== */
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', (e) => { e.preventDefault(); dropZone.classList.remove('drag-over'); });
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) handleImage(file);
    else UI.showToast('Por favor, sube una imagen válida', 'error');
  });
  dropZone.addEventListener('click', (e) => { if (!e.target.closest('button')) fileInput.click(); });

  /* ========================================
     Botones de subida / cámara
     ======================================== */
  btnUpload.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
  btnCamera.addEventListener('click', (e) => { e.stopPropagation(); cameraInput.click(); });
  fileInput.addEventListener('change', (e) => { if (e.target.files[0]) handleImage(e.target.files[0]); });
  cameraInput.addEventListener('change', (e) => { if (e.target.files[0]) handleImage(e.target.files[0]); });

  /* ========================================
     Quitar imagen
     ======================================== */
  btnRemove.addEventListener('click', () => {
    UI.resetAll();
    selectedFormat = null;
    extractedText = '';
    currentFile = null;
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
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.click(); }
    });
  });

  /* ========================================
     Sincronizar textarea
     ======================================== */
  extractedTextArea.addEventListener('input', (e) => {
    extractedText = e.target.value;
    const statChars = document.getElementById('stat-chars');
    if (statChars) statChars.textContent = `📝 ${extractedText.length} caracteres`;
  });

  /* ========================================
     Botones
     ======================================== */
  btnConvert.addEventListener('click', handleConvert);

  if (btnScanAnother) {
    btnScanAnother.addEventListener('click', () => {
      UI.resetAll();
      selectedFormat = null;
      extractedText = '';
      currentFile = null;
    });
  }

  /* ========================================
     Manejar imagen
     ======================================== */
  async function handleImage(file) {
    if (file.size > 20 * 1024 * 1024) {
      UI.showToast('La imagen es demasiado grande (máx. 20 MB)', 'error');
      return;
    }

    currentFile = file;

    // Vista previa
    const reader = new FileReader();
    reader.onload = (e) => {
      previewImage.src = e.target.result;
      imagePreview.classList.remove('hidden');
      dropZone.classList.add('hidden');
    };
    reader.readAsDataURL(file);

    // Ejecutar OCR
    UI.showSection(ocrSection);
    UI.updateProgress(0, 'Iniciando escaneo...');

    try {
      const result = await OCR.scanImage(file, (progress) => {
        UI.updateProgress(Math.round(progress.progress * 100), progress.status);
      });

      if (result && result.text) {
        extractedText = result.text;
        extractedTextArea.value = result.text;

        UI.updateProgress(100, `✅ Completado — Confianza: ${Math.round(result.confidence)}%`);

        const statConfidence = document.getElementById('stat-confidence');
        const statChars = document.getElementById('stat-chars');
        if (statConfidence) statConfidence.textContent = `🎯 Confianza: ${Math.round(result.confidence)}%`;
        if (statChars) statChars.textContent = `📝 ${result.text.length} caracteres`;

        UI.showSection(formatSection);
        UI.showToast('¡Texto escaneado exitosamente!', 'success');
      } else {
        UI.updateProgress(0, '❌ No se pudo detectar texto');
        UI.showToast('No se detectó texto. Intenta con otra imagen.', 'error');
      }
    } catch (err) {
      console.error('[ScanForge] Error:', err);
      UI.updateProgress(0, '❌ Error en el escaneo');
      UI.showToast('Error: ' + (err.message || 'Error desconocido'), 'error');
    }
  }

  /* ========================================
     Conversión de formato
     ======================================== */
  async function handleConvert() {
    if (!selectedFormat) { UI.showToast('Selecciona un formato', 'error'); return; }
    if (!extractedText.trim()) { UI.showToast('No hay texto para convertir', 'error'); return; }

    const filename = filenameInput.value.trim() || 'documento_escaneado';
    UI.setButtonLoading(btnConvert, true);

    try {
      const response = await fetch('/api/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: extractedText, format: selectedFormat, filename }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => null);
        throw new Error(err?.mensaje || `Error (${response.status})`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}.${selectedFormat}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      UI.setButtonLoading(btnConvert, false);
      UI.showSuccess();
      UI.showToast('¡Archivo descargado!', 'success');
    } catch (err) {
      UI.setButtonLoading(btnConvert, false);
      UI.showToast('Error: ' + err.message, 'error');
    }
  }
});
