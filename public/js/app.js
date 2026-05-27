/* =============================================
   ScanForge — Lógica principal de la aplicación
   ============================================= */

document.addEventListener('DOMContentLoaded', () => {

  /* ---------- Estado ---------- */
  let selectedFormat = null;
  let extractedText = '';

  /* ---------- DOM ---------- */
  const dropZone        = document.getElementById('drop-zone');
  const fileInput       = document.getElementById('file-input');
  const cameraInput     = document.getElementById('camera-input');
  const btnUpload       = document.getElementById('btn-upload');
  const btnCamera       = document.getElementById('btn-camera');
  const imagePreviewGrid = document.getElementById('image-preview-grid');
  const previewActions  = document.getElementById('preview-actions');
  const btnRemove       = document.getElementById('btn-remove');
  const btnProcessAll   = document.getElementById('btn-process-all');
  let selectedFiles     = [];
  const extractedTextArea = document.getElementById('extracted-text');
  const formatCards     = document.querySelectorAll('.format-card');
  const filenameInput   = document.getElementById('filename');
  const btnConvert      = document.getElementById('btn-convert');
  const ocrSection      = document.getElementById('ocr-section');
  const formatSection   = document.getElementById('format-section');
  const btnScanAnother  = document.getElementById('btn-scan-another');

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
    if (imagePreviewGrid) { imagePreviewGrid.innerHTML = ''; imagePreviewGrid.classList.add('hidden'); }
    if (previewActions) previewActions.classList.add('hidden');
    dropZone.classList.remove('hidden');
  });

  if (btnProcessAll) btnProcessAll.addEventListener('click', processAllImages);

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

  btnConvert.addEventListener('click', handleConvert);

  if (btnScanAnother) {
    btnScanAnother.addEventListener('click', () => {
      UI.resetAll();
      selectedFormat = null;
      extractedText = '';
    });
  }

  /* ========================================
     Selección de imágenes
     ======================================== */
  function handleFilesSelection(filesList) {
    const files = Array.from(filesList).filter(f => f.type.startsWith('image/'));
    if (files.length === 0) { UI.showToast('Selecciona imágenes válidas', 'error'); return; }

    files.forEach(f => { if (f.size <= 20 * 1024 * 1024) selectedFiles.push(f); });
    if (selectedFiles.length === 0) { UI.showToast('Las imágenes superan 20MB', 'error'); return; }

    dropZone.classList.add('hidden');
    imagePreviewGrid.classList.remove('hidden');
    previewActions.classList.remove('hidden');
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

  /* ========================================
     Procesar Imágenes (con 3 opciones)
     ======================================== */
  async function processAllImages() {
    UI.showSection(ocrSection);
    UI.updateProgress(0, 'Iniciando análisis...');
    previewActions.classList.add('hidden');

    // Ocultar el área de texto y las opciones mientras procesa
    extractedTextArea.classList.add('hidden');
    const existingOptions = document.getElementById('ocr-options-container');
    if (existingOptions) existingOptions.remove();

    let allOptions = [];

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      UI.updateProgress(
        Math.round((i / selectedFiles.length) * 70),
        `Escaneando imagen ${i + 1} de ${selectedFiles.length} en 3 variantes...`
      );

      try {
        const result = await OCR.scanImage(file, (p) => {
          UI.updateProgress(
            Math.round((i / selectedFiles.length) * 70 + p.progress * 25),
            p.status
          );
        });

        if (result && result.options) {
          // Combinar texto de múltiples imágenes por variante
          result.options.forEach((opt, idx) => {
            if (!allOptions[idx]) {
              allOptions[idx] = { ...opt, text: '' };
            }
            if (selectedFiles.length > 1) {
              allOptions[idx].text += `\n\n--- Página ${i + 1} ---\n\n${opt.text}`;
            } else {
              allOptions[idx].text = opt.text;
            }
            allOptions[idx].confidence = Math.round((allOptions[idx].confidence + opt.confidence) / (i === 0 ? 1 : 2));
          });
        }
      } catch (err) {
        console.error(`Error escaneando imagen ${i + 1}:`, err);
      }
    }

    UI.updateProgress(100, '✅ ¡Análisis completado!');

    if (allOptions.length > 0 && allOptions[0].text.trim().length > 0) {
      // Mostrar las 3 opciones para que el usuario elija
      showOCROptions(allOptions);
      UI.showToast('¡Elige la mejor versión del texto!', 'success');
    } else {
      UI.updateProgress(0, '❌ No se detectó texto');
      UI.showToast('No se detectó texto en las imágenes.', 'error');
    }
  }

  /* ========================================
     Mostrar las 3 opciones de texto
     ======================================== */
  function showOCROptions(options) {
    const container = document.createElement('div');
    container.id = 'ocr-options-container';
    container.innerHTML = `
      <p class="ocr-options-title">📋 Elige la versión del texto que se ve mejor:</p>
      <div class="ocr-options-grid">
        ${options.map((opt, i) => `
          <div class="ocr-option-card" data-index="${i}" id="ocr-option-${i}" tabindex="0" role="button">
            <div class="ocr-option-header">
              <span class="ocr-option-badge">Opción ${i + 1}</span>
              <span class="ocr-option-label">${opt.label}</span>
              <span class="ocr-option-confidence">${opt.confidence}% confianza</span>
            </div>
            <pre class="ocr-option-preview">${escapeHtml(opt.text.substring(0, 220))}${opt.text.length > 220 ? '...' : ''}</pre>
          </div>
        `).join('')}
      </div>
    `;

    // Insertar las opciones después del progress bar
    const progressContainer = document.getElementById('progress-container');
    progressContainer.insertAdjacentElement('afterend', container);

    // Seleccionar la primera opción (la de mayor confianza) por defecto
    selectOption(0, options);

    // Agregar eventos a las tarjetas
    options.forEach((opt, i) => {
      const card = document.getElementById(`ocr-option-${i}`);
      card.addEventListener('click', () => selectOption(i, options));
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') selectOption(i, options); });
    });

    // Mostrar el textarea con el texto de la opción seleccionada
    extractedTextArea.classList.remove('hidden');
  }

  function selectOption(index, options) {
    // Quitar selección de todas las tarjetas
    document.querySelectorAll('.ocr-option-card').forEach(c => c.classList.remove('selected'));
    // Seleccionar la tarjeta elegida
    const card = document.getElementById(`ocr-option-${index}`);
    if (card) card.classList.add('selected');

    // Actualizar el texto y las estadísticas
    extractedText = options[index].text.trim();
    extractedTextArea.value = extractedText;

    const statConfidence = document.getElementById('stat-confidence');
    const statChars = document.getElementById('stat-chars');
    if (statConfidence) statConfidence.textContent = `🎯 Confianza: ${options[index].confidence}%`;
    if (statChars) statChars.textContent = `📝 ${extractedText.length} caracteres`;

    // Mostrar la sección de formato
    UI.showSection(formatSection);
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
