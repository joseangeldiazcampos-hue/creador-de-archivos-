/**
 * ScanForge - Rutas de Conversión
 * 
 * Este módulo contiene el endpoint POST /api/convert que recibe
 * texto escaneado y lo convierte al formato solicitado:
 *   - xlsx (Excel)
 *   - docx (Word)
 *   - pdf
 *   - txt
 */

const express = require('express');
const ExcelJS = require('exceljs');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, BorderStyle } = require('docx');
const PDFDocument = require('pdfkit');

const router = express.Router();

/**
 * POST /api/convert
 * 
 * Convierte texto plano al formato de archivo especificado.
 * 
 * Body esperado (JSON):
 *   - text: string     → Texto escaneado a convertir
 *   - format: string   → Formato destino: 'xlsx', 'docx', 'pdf' o 'txt'
 *   - filename: string → Nombre del archivo de salida (sin extensión)
 */
router.post('/api/convert', async (req, res) => {
  try {
    const { text, format, filename } = req.body;

    // --- Validación de parámetros ---
    if (!text || typeof text !== 'string') {
      return res.status(400).json({
        error: 'Texto requerido',
        mensaje: 'Debe proporcionar el texto escaneado para la conversión.',
      });
    }

    if (!format || !['xlsx', 'docx', 'pdf', 'txt'].includes(format)) {
      return res.status(400).json({
        error: 'Formato no válido',
        mensaje: 'Los formatos aceptados son: xlsx, docx, pdf, txt.',
      });
    }

    // Nombre de archivo por defecto si no se proporciona
    const nombreArchivo = filename || 'scanforge_documento';

    // --- Seleccionar el generador según el formato ---
    switch (format) {
      case 'xlsx':
        await generarExcel(text, nombreArchivo, res);
        break;
      case 'docx':
        await generarWord(text, nombreArchivo, res);
        break;
      case 'pdf':
        await generarPDF(text, nombreArchivo, res);
        break;
      case 'txt':
        generarTexto(text, nombreArchivo, res);
        break;
      default:
        // Este caso no debería alcanzarse gracias a la validación anterior
        res.status(400).json({ error: 'Formato no soportado' });
    }
  } catch (error) {
    console.error('❌ Error en la conversión:', error.message);
    res.status(500).json({
      error: 'Error de conversión',
      mensaje: 'No se pudo generar el archivo. Intente nuevamente.',
    });
  }
});

// ═══════════════════════════════════════════════════════════
// Generadores de archivos
// ═══════════════════════════════════════════════════════════

/**
 * Genera un archivo Excel (.xlsx) con el texto escaneado.
 * Cada línea del texto se convierte en una fila con número de línea y contenido.
 * 
 * @param {string} texto - Texto escaneado
 * @param {string} nombreArchivo - Nombre del archivo sin extensión
 * @param {object} res - Objeto de respuesta Express
 */
async function generarExcel(texto, nombreArchivo, res) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ScanForge';
  workbook.created = new Date();

  // Crear hoja de trabajo
  const hoja = workbook.addWorksheet('Texto Escaneado');

  // Definir columnas con encabezados
  hoja.columns = [
    { header: 'Línea', key: 'linea', width: 10 },
    { header: 'Contenido', key: 'contenido', width: 80 },
  ];

  // --- Estilizar la fila de encabezado ---
  const filaEncabezado = hoja.getRow(1);
  filaEncabezado.eachCell((celda) => {
    // Fondo azul oscuro con texto blanco en negrita
    celda.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E3A5F' },
    };
    celda.font = {
      bold: true,
      color: { argb: 'FFFFFFFF' },
      size: 12,
    };
    celda.alignment = {
      vertical: 'middle',
      horizontal: 'center',
    };
    celda.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    };
  });

  // --- Agregar las líneas del texto como filas ---
  const lineas = texto.split('\n');
  lineas.forEach((linea, indice) => {
    const fila = hoja.addRow({
      linea: indice + 1,
      contenido: linea,
    });

    // Agregar bordes a cada celda de la fila
    fila.eachCell((celda) => {
      celda.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
      celda.alignment = { vertical: 'top', wrapText: true };
    });
  });

  // --- Auto-ajustar el ancho de columnas según el contenido ---
  hoja.columns.forEach((columna) => {
    let anchoMaximo = columna.header.length;
    columna.eachCell({ includeEmpty: true }, (celda) => {
      const valor = celda.value ? celda.value.toString() : '';
      // Limitar el ancho máximo a 100 caracteres para evitar columnas excesivas
      anchoMaximo = Math.max(anchoMaximo, Math.min(valor.length, 100));
    });
    columna.width = anchoMaximo + 4; // Agregar margen adicional
  });

  // --- Enviar el archivo como respuesta ---
  const contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}.xlsx"`);

  await workbook.xlsx.write(res);
  res.end();
}

/**
 * Genera un archivo Word (.docx) con el texto escaneado.
 * Incluye un título con estilo y cada línea como un párrafo individual.
 * 
 * @param {string} texto - Texto escaneado
 * @param {string} nombreArchivo - Nombre del archivo sin extensión
 * @param {object} res - Objeto de respuesta Express
 */
async function generarWord(texto, nombreArchivo, res) {
  const lineas = texto.split('\n');

  // Construir los párrafos del documento
  const parrafos = [
    // Título del documento
    new Paragraph({
      children: [
        new TextRun({
          text: 'Texto Escaneado - ScanForge',
          bold: true,
          size: 36, // 18pt en half-points
          font: 'Calibri',
          color: '1E3A5F',
        }),
      ],
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 200 },
    }),

    // Línea separadora horizontal
    new Paragraph({
      border: {
        bottom: {
          color: '1E3A5F',
          space: 1,
          style: BorderStyle.SINGLE,
          size: 6,
        },
      },
      spacing: { after: 300 },
    }),

    // Cada línea del texto como un párrafo independiente
    ...lineas.map(
      (linea) =>
        new Paragraph({
          children: [
            new TextRun({
              text: linea || ' ', // Usar espacio para líneas vacías
              size: 24, // 12pt en half-points
              font: 'Calibri',
            }),
          ],
          spacing: { after: 120 },
        })
    ),
  ];

  // Crear el documento Word
  const documento = new Document({
    creator: 'ScanForge',
    title: 'Texto Escaneado - ScanForge',
    description: 'Documento generado por ScanForge a partir de texto escaneado con OCR',
    sections: [
      {
        properties: {},
        children: parrafos,
      },
    ],
  });

  // Generar el buffer del documento
  const buffer = await Packer.toBuffer(documento);

  // --- Enviar el archivo como respuesta ---
  const contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}.docx"`);
  res.send(buffer);
}

/**
 * Genera un archivo PDF con el texto escaneado.
 * Incluye título, separador y contenido con saltos de página automáticos.
 * 
 * @param {string} texto - Texto escaneado
 * @param {string} nombreArchivo - Nombre del archivo sin extensión
 * @param {object} res - Objeto de respuesta Express
 */
async function generarPDF(texto, nombreArchivo, res) {
  return new Promise((resolve, reject) => {
    // Crear el documento PDF con márgenes
    const doc = new PDFDocument({
      margins: {
        top: 60,
        bottom: 60,
        left: 60,
        right: 60,
      },
      size: 'LETTER',
      bufferPages: true,
      info: {
        Title: 'Texto Escaneado - ScanForge',
        Author: 'ScanForge',
        Creator: 'ScanForge',
      },
    });

    // --- Configurar los headers de respuesta ---
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}.pdf"`);

    // Enviar el PDF directamente al stream de respuesta
    doc.pipe(res);

    // --- Título del documento ---
    doc
      .font('Helvetica-Bold')
      .fontSize(18)
      .fillColor('#1E3A5F')
      .text('Texto Escaneado', { align: 'left' });

    // --- Línea separadora ---
    doc.moveDown(0.5);
    const anchoLinea = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    doc
      .strokeColor('#1E3A5F')
      .lineWidth(1.5)
      .moveTo(doc.page.margins.left, doc.y)
      .lineTo(doc.page.margins.left + anchoLinea, doc.y)
      .stroke();

    doc.moveDown(1);

    // --- Contenido del texto ---
    doc
      .font('Helvetica')
      .fontSize(12)
      .fillColor('#333333')
      .text(texto, {
        align: 'left',
        lineGap: 4,
        paragraphGap: 6,
      });

    // Finalizar el documento PDF
    doc.end();

    // Resolver cuando el stream termine
    doc.on('end', resolve);
    doc.on('error', reject);
  });
}

/**
 * Genera un archivo de texto plano (.txt).
 * Simplemente retorna el texto tal cual con codificación UTF-8.
 * 
 * @param {string} texto - Texto escaneado
 * @param {string} nombreArchivo - Nombre del archivo sin extensión
 * @param {object} res - Objeto de respuesta Express
 */
function generarTexto(texto, nombreArchivo, res) {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}.txt"`);
  res.send(texto);
}

module.exports = router;
