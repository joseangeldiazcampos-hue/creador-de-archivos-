/* =============================================
   ScanForge — Módulo de utilidades de interfaz
   ============================================= */

const UI = {

  /**
   * Muestra una sección con animación de deslizamiento hacia arriba.
   * @param {HTMLElement} sectionEl - Elemento de la sección a mostrar.
   */
  showSection(sectionEl) {
    if (!sectionEl) return;
    sectionEl.classList.remove('hidden');
    sectionEl.classList.add('visible');
    // Forzar reflow para reiniciar la animación
    void sectionEl.offsetHeight;
    sectionEl.style.animation = 'none';
    requestAnimationFrame(() => {
      sectionEl.style.animation = '';
    });
  },

  /**
   * Oculta una sección.
   * @param {HTMLElement} sectionEl - Elemento de la sección a ocultar.
   */
  hideSection(sectionEl) {
    if (!sectionEl) return;
    sectionEl.classList.add('hidden');
    sectionEl.classList.remove('visible');
  },

  /**
   * Muestra una notificación toast.
   * @param {string} message - Mensaje a mostrar.
   * @param {'info'|'success'|'error'} type - Tipo de notificación.
   */
  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.setAttribute('role', 'alert');

    // Icono según el tipo
    const icons = {
      success: '✅',
      error: '❌',
      info: 'ℹ️'
    };

    toast.innerHTML = `<span>${icons[type] || icons.info}</span><span>${message}</span>`;
    container.appendChild(toast);

    // Auto-eliminar después de 3.5 segundos
    setTimeout(() => {
      toast.classList.add('toast--exit');
      toast.addEventListener('animationend', () => {
        toast.remove();
      });
    }, 3500);
  },

  /**
   * Actualiza la barra de progreso y su texto.
   * @param {number} percent - Porcentaje de progreso (0–100).
   * @param {string} text - Texto descriptivo del estado.
   */
  updateProgress(percent, text) {
    const fill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');

    if (fill) {
      fill.style.width = `${Math.min(100, Math.max(0, percent))}%`;
    }
    if (progressText && text) {
      progressText.textContent = text;
    }
  },

  /**
   * Establece el estado de carga de un botón.
   * @param {HTMLButtonElement} btn - Botón a modificar.
   * @param {boolean} loading - Si está cargando o no.
   */
  setButtonLoading(btn, loading) {
    if (!btn) return;

    if (loading) {
      btn._originalText = btn.innerHTML;
      btn.disabled = true;
      btn.classList.add('loading');
      btn.innerHTML = `<span class="spinner"></span> Generando...`;
    } else {
      btn.disabled = false;
      btn.classList.remove('loading');
      btn.innerHTML = btn._originalText || '⬇️ Generar y Descargar';
    }
  },

  /**
   * Muestra la sección de éxito con animaciones y partículas.
   */
  showSuccess() {
    const successSection = document.getElementById('success-section');
    if (!successSection) return;

    // Ocultar otras secciones
    this.hideSection(document.getElementById('ocr-section'));
    this.hideSection(document.getElementById('format-section'));
    this.hideSection(document.getElementById('upload-section'));

    // Mostrar sección de éxito
    this.showSection(successSection);

    // Crear partículas de celebración
    this.createParticles(successSection);
  },

  /**
   * Reinicia todas las secciones al estado inicial.
   */
  resetAll() {
    // Mostrar sección de subida
    const uploadSection = document.getElementById('upload-section');
    const ocrSection = document.getElementById('ocr-section');
    const formatSection = document.getElementById('format-section');
    const successSection = document.getElementById('success-section');
    const imagePreview = document.getElementById('image-preview');
    const dropZone = document.getElementById('drop-zone');
    const previewImage = document.getElementById('preview-image');
    const extractedText = document.getElementById('extracted-text');
    const fileInput = document.getElementById('file-input');
    const cameraInput = document.getElementById('camera-input');
    const btnConvert = document.getElementById('btn-convert');

    // Ocultar secciones
    this.hideSection(ocrSection);
    this.hideSection(formatSection);
    this.hideSection(successSection);

    // Mostrar sección de subida
    this.showSection(uploadSection);

    // Restablecer vista previa
    if (imagePreview) imagePreview.classList.add('hidden');
    if (dropZone) dropZone.classList.remove('hidden');
    if (previewImage) previewImage.src = '';

    // Limpiar textarea
    if (extractedText) extractedText.value = '';

    // Limpiar inputs de archivo
    if (fileInput) fileInput.value = '';
    if (cameraInput) cameraInput.value = '';

    // Reiniciar progreso
    this.updateProgress(0, 'Escaneando...');

    // Reiniciar selección de formato
    document.querySelectorAll('.format-card').forEach(card => {
      card.classList.remove('selected');
    });

    // Desactivar botón de conversión
    if (btnConvert) {
      btnConvert.disabled = true;
      this.setButtonLoading(btnConvert, false);
    }

    // Reiniciar estadísticas
    const statConfidence = document.getElementById('stat-confidence');
    const statChars = document.getElementById('stat-chars');
    if (statConfidence) statConfidence.textContent = '🎯 Confianza: —';
    if (statChars) statChars.textContent = '📝 0 caracteres';

    // Limpiar partículas
    document.querySelectorAll('.confetti-particle').forEach(p => p.remove());
  },

  /**
   * Crea partículas decorativas de celebración (confetti CSS).
   * @param {HTMLElement} container - Contenedor donde añadir las partículas.
   */
  createParticles(container) {
    if (!container) return;

    const colors = ['#7c3aed', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#2563eb'];
    const particleCount = 20;

    for (let i = 0; i < particleCount; i++) {
      const particle = document.createElement('span');
      particle.className = 'confetti-particle';

      const color = colors[Math.floor(Math.random() * colors.length)];
      const size = Math.random() * 8 + 4;
      const left = Math.random() * 100;
      const delay = Math.random() * 0.8;
      const duration = Math.random() * 1.5 + 1;

      Object.assign(particle.style, {
        position: 'absolute',
        width: `${size}px`,
        height: `${size}px`,
        backgroundColor: color,
        borderRadius: Math.random() > 0.5 ? '50%' : '2px',
        left: `${left}%`,
        top: '40%',
        opacity: '0',
        pointerEvents: 'none',
        zIndex: '5',
        animation: `confettiFall ${duration}s ease-out ${delay}s forwards`
      });

      container.appendChild(particle);

      // Eliminar después de la animación
      setTimeout(() => {
        particle.remove();
      }, (duration + delay) * 1000 + 200);
    }

    // Inyectar keyframes de confetti si no existen
    if (!document.getElementById('confetti-keyframes')) {
      const style = document.createElement('style');
      style.id = 'confetti-keyframes';
      style.textContent = `
        @keyframes confettiFall {
          0% {
            transform: translateY(0) rotate(0deg) scale(0);
            opacity: 0;
          }
          15% {
            opacity: 1;
            transform: translateY(-30px) rotate(90deg) scale(1);
          }
          100% {
            transform: translateY(120px) rotate(720deg) scale(0.3);
            opacity: 0;
          }
        }
      `;
      document.head.appendChild(style);
    }
  }
};
