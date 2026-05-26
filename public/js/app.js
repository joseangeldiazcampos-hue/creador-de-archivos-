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
  const imagePreviewGrid  = document.getElementById('image-preview-grid');
  const previewActions    = document.getElementById('preview-actions');
  const btnRemove         = document.getElementById('btn-remove');
  const btnProcessAll     = document.getElementById('btn-process-all');
  let selectedFiles       = [];
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
    if (e.dataTransfer.files.length > 0) handleFilesSelection(e.dataTransfer.files);
  });
  dropZone.addEventListener('click', (e) => { if (!e.target.closest('button')) fileInput.click(); });

  /* ========================================
     Botones de subida / cámara
     ======================================== */
  btnUpload.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
  btnCamera.addEventListener('click', (e) => { e.stopPropagation(); cameraInput.click(); });
  fileInput.addEventListener('change', (e) => { handleFilesSelection(e.target.files); });
  cameraInput.addEventListener('change', (e) => { handleFilesSelection(e.target.files); });

  /* ========================================
     Quitar imagen
     ======================================== */
  btnRemove.addEventListener('click', () => {
    UI.resetAll();
    selectedFormat = null;
    extractedText = '';
    selectedFiles = [];
    if(imagePreviewGrid) imagePreviewGrid.innerHTML = '';
    if(imagePreviewGrid) imagePreviewGrid.classList.add('hidden');
    if(previewActions) previewActions.classList.add('hidden');
    dropZone.classList.remove('hidden');
  });

  if (btnProcessAll) {
    btnProcessAll.addEventListener('click', processAllImages);
  }

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
  function handleFilesSelection(filesList) {
    const files = Array.from(filesList).filter(f => f.type.startsWith('image/'));
    if (files.length === 0) {
      UI.showToast('Por favor, selecciona imágenes válidas', 'error');
      return;
    }

    let tooLarge = false;
    files.forEach(f => {
      if (f.size > 20 * 1024 * 1024) tooLarge = true;
      else selectedFiles.push(f);
    });

    if (tooLarge) UI.showToast('Algunas imágenes superan los 20MB y fueron ignoradas', 'error');
    if (selectedFiles.length === 0) return;

    dropZone.classList.add('hidden');
    imagePreviewGrid.classList.remove('hidden');
    previewActions.classList.remove('hidden');
    
    // Renderizar miniaturas
    imagePreviewGrid.innerHTML = '';
    selectedFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const div = document.createElement('div');
        div.className = 'preview-thumb-container';
        div.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
        imagePreviewGrid.appendChild(div);
      };
      reader.readAsDataURL(file);
    });
  }

  async function processAllImages() {
    UI.showSection(ocrSection);
    UI.updateProgress(0, 'Iniciando escaneo en lote...');
    previewActions.classList.add('hidden');

    let combinedText = '';
    let totalConfidence = 0;
    let successfulScans = 0;

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      UI.updateProgress(Math.round((i / selectedFiles.length) * 100), `Escaneando imagen ${i + 1} de ${selectedFiles.length}...`);
      
      try {
        const result = await OCR.scanImage(file, () => {});
        if (result && result.text) {
          combinedText += `\n\n--- Página ${i + 1} ---\n\n${result.text}`;
          totalConfidence += result.confidence;
          successfulScans++;
        }
      } catch (err) {
        console.error(`Error escaneando imagen ${i+1}:`, err);
      }
    }

    if (successfulScans > 0) {
      extractedText = combinedText.trim();
      extractedTextArea.value = extractedText;
      const avgConfidence = Math.round(totalConfidence / successfulScans);

      UI.updateProgress(100, `✅ Completado — Confianza prom: ${avgConfidence}%`);
      const statConfidence = document.getElementById('stat-confidence');
      const statChars = document.getElementById('stat-chars');
      if (statConfidence) statConfidence.textContent = `🎯 Confianza: ${avgConfidence}%`;
      if (statChars) statChars.textContent = `📝 ${extractedText.length} caracteres`;

      UI.showSection(formatSection);
      UI.showToast('¡Texto escaneado exitosamente!', 'success');
    } else {
      UI.updateProgress(0, '❌ No se detectó texto en las imágenes');
      UI.showToast('No se detectó texto.', 'error');
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
