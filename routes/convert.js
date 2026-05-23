/**
 * ScanForge - Rutas de Conversión (Mejorado)
 * 
 * Convierte texto escaneado a Excel, Word, PDF o TXT
 * con formato inteligente: detecta títulos, secciones,
 * listas y organiza el contenido automáticamente.
 */

const express = require('express');
const ExcelJS = require('exceljs');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, BorderStyle, AlignmentType, TabStopType, TabStopPosition } = require('docx');
const PDFDocument = require('pdfkit');

const router = express.Router();

// ═══════════════════════════════════════════════════════════
// Utilidad: Analizar estructura del texto
// ═══════════════════════════════════════════════════════════

/**
 * Analiza el texto y detecta títulos, secciones, listas, etc.
 * Retorna un array de objetos { type, text }
 * type: 'title' | 'heading' | 'subheading' | 'list' | 'paragraph' | 'empty'
 */
function parseTextStructure(text) {
  const lines = text.split('\n');
  const parsed = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      parsed.push({ type: 'empty', text: '' });
      continue;
    }

    // Detectar títulos (todo mayúsculas, mínimo 3 caracteres)
    const upperRatio = (trimmed.match(/[A-ZÁÉÍÓÚÑ]/g) || []).length / trimmed.replace(/\s/g, '').length;
    if (upperRatio > 0.7 && trimmed.length >= 3 && trimmed.length <= 80 && !trimmed.match(/^\d/)) {
      // Si es corto y mayúsculas, es título
      if (trimmed.length <= 40) {
        parsed.push({ type: 'title', text: trimmed });
      } else {
        parsed.push({ type: 'heading', text: trimmed });
      }
      continue;
    }

    // Detectar encabezados (línea corta seguida de línea larga = posible subtítulo)
    if (trimmed.length <= 50 && i + 1 < lines.length) {
      const nextLine = lines[i + 1]?.trim() || '';
      if (nextLine.length > trimmed.length * 1.5 && trimmed.endsWith(':')) {
        parsed.push({ type: 'heading', text: trimmed });
        continue;
      }
    }

    // Detectar listas (empieza con -, *, •, número., etc.)
    if (/^[-*•●►▸]\s/.test(trimmed) || /^\d+[.)]\s/.test(trimmed)) {
      parsed.push({ type: 'list', text: trimmed });
      continue;
    }

    // Párrafo normal
    parsed.push({ type: 'paragraph', text: trimmed });
  }

  return parsed;
}

// ═══════════════════════════════════════════════════════════
// POST /api/convert
// ═══════════════════════════════════════════════════════════

router.post('/api/convert', async (req, res) => {
  try {
    const { text, format, filename } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Texto requerido' });
    }

    if (!format || !['xlsx', 'docx', 'pdf', 'txt'].includes(format)) {
      return res.status(400).json({ error: 'Formato no válido' });
    }

    const nombreArchivo = filename || 'scanforge_documento';

    switch (format) {
      case 'xlsx': await generarExcel(text, nombreArchivo, res); break;
      case 'docx': await generarWord(text, nombreArchivo, res); break;
      case 'pdf':  await generarPDF(text, nombreArchivo, res); break;
      case 'txt':  generarTexto(text, nombreArchivo, res); break;
    }
  } catch (error) {
    console.error('❌ Error en la conversión:', error.message);
    res.status(500).json({ error: 'Error de conversión', mensaje: error.message });
  }
});

// ═══════════════════════════════════════════════════════════
// EXCEL — Organizado por secciones con colores
// ═══════════════════════════════════════════════════════════

async function generarExcel(texto, nombreArchivo, res) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ScanForge';
  workbook.created = new Date();

  const hoja = workbook.addWorksheet('Texto Escaneado');
  const estructura = parseTextStructure(texto);

  // Definir columna única ancha
  hoja.columns = [
    { header: 'Contenido', key: 'contenido', width: 100 },
  ];

  // Estilo del encabezado
  const filaEnc = hoja.getRow(1);
  filaEnc.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 14, name: 'Calibri' };
    c.alignment = { vertical: 'middle', horizontal: 'center' };
    c.border = { top: { style: 'thin' }, bottom: { style: 'medium', color: { argb: 'FF7C3AED' } } };
  });
  filaEnc.height = 30;

  let filaNum = 2;

  for (const item of estructura) {
    if (item.type === 'empty') {
      filaNum++;
      continue;
    }

    const fila = hoja.getRow(filaNum);
    fila.getCell(1).value = item.text;

    if (item.type === 'title') {
      fila.getCell(1).font = { bold: true, size: 16, name: 'Calibri', color: { argb: 'FF1E3A5F' } };
      fila.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EDF5' } };
      fila.height = 28;
    } else if (item.type === 'heading') {
      fila.getCell(1).font = { bold: true, size: 13, name: 'Calibri', color: { argb: 'FF7C3AED' } };
      fila.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F0FF' } };
      fila.height = 24;
    } else if (item.type === 'list') {
      fila.getCell(1).font = { size: 11, name: 'Calibri' };
      fila.getCell(1).alignment = { indent: 2, wrapText: true };
    } else {
      fila.getCell(1).font = { size: 11, name: 'Calibri' };
      fila.getCell(1).alignment = { wrapText: true };
    }

    // Bordes sutiles
    fila.getCell(1).border = {
      bottom: { style: 'hair', color: { argb: 'FFE0E0E0' } },
    };

    filaNum++;
  }

  // Enviar
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
}

// ═══════════════════════════════════════════════════════════
// WORD — Con títulos, subtítulos y formato profesional
// ═══════════════════════════════════════════════════════════

async function generarWord(texto, nombreArchivo, res) {
  const estructura = parseTextStructure(texto);

  const children = [
    // Título del documento
    new Paragraph({
      children: [
        new TextRun({
          text: nombreArchivo.replace(/_/g, ' '),
          bold: true,
          size: 40, // 20pt
          font: 'Calibri',
          color: '1E3A5F',
        }),
      ],
      heading: HeadingLevel.TITLE,
      spacing: { after: 100 },
    }),

    // Subtítulo con fecha
    new Paragraph({
      children: [
        new TextRun({
          text: `Generado por ScanForge — ${new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}`,
          size: 20,
          font: 'Calibri',
          color: '888888',
          italics: true,
        }),
      ],
      spacing: { after: 200 },
    }),

    // Separador
    new Paragraph({
      border: { bottom: { color: '7C3AED', space: 1, style: BorderStyle.SINGLE, size: 8 } },
      spacing: { after: 300 },
    }),
  ];

  // Agregar contenido con formato inteligente
  for (const item of estructura) {
    if (item.type === 'empty') {
      children.push(new Paragraph({ spacing: { after: 100 } }));
      continue;
    }

    if (item.type === 'title') {
      children.push(new Paragraph({
        children: [new TextRun({
          text: item.text,
          bold: true,
          size: 32, // 16pt
          font: 'Calibri',
          color: '1E3A5F',
        })],
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 300, after: 150 },
      }));
    } else if (item.type === 'heading') {
      children.push(new Paragraph({
        children: [new TextRun({
          text: item.text,
          bold: true,
          size: 26, // 13pt
          font: 'Calibri',
          color: '7C3AED',
        })],
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 100 },
      }));
    } else if (item.type === 'list') {
      children.push(new Paragraph({
        children: [new TextRun({
          text: '    ' + item.text,
          size: 22,
          font: 'Calibri',
        })],
        spacing: { after: 60 },
      }));
    } else {
      children.push(new Paragraph({
        children: [new TextRun({
          text: item.text,
          size: 22, // 11pt
          font: 'Calibri',
        })],
        spacing: { after: 100 },
      }));
    }
  }

  const documento = new Document({
    creator: 'ScanForge',
    title: nombreArchivo,
    sections: [{ properties: {}, children }],
  });

  const buffer = await Packer.toBuffer(documento);

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}.docx"`);
  res.send(buffer);
}

// ═══════════════════════════════════════════════════════════
// PDF — Profesional con secciones coloreadas
// ═══════════════════════════════════════════════════════════

async function generarPDF(texto, nombreArchivo, res) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margins: { top: 50, bottom: 50, left: 55, right: 55 },
      size: 'LETTER',
      bufferPages: true,
      info: {
        Title: nombreArchivo,
        Author: 'ScanForge',
      },
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}.pdf"`);
    doc.pipe(res);

    const estructura = parseTextStructure(texto);
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    // Título del documento
    doc
      .font('Helvetica-Bold')
      .fontSize(22)
      .fillColor('#1E3A5F')
      .text(nombreArchivo.replace(/_/g, ' '), { align: 'left' });

    // Fecha
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#888888')
      .text(`Generado por ScanForge — ${new Date().toLocaleDateString('es-MX')}`, { align: 'left' });

    // Separador
    doc.moveDown(0.5);
    doc
      .strokeColor('#7C3AED')
      .lineWidth(2)
      .moveTo(doc.page.margins.left, doc.y)
      .lineTo(doc.page.margins.left + pageWidth, doc.y)
      .stroke();
    doc.moveDown(0.8);

    // Contenido
    for (const item of estructura) {
      // Verificar si necesita nueva página
      if (doc.y > doc.page.height - 80) {
        doc.addPage();
      }

      if (item.type === 'empty') {
        doc.moveDown(0.4);
        continue;
      }

      if (item.type === 'title') {
        doc.moveDown(0.3);
        // Fondo sutil para títulos
        doc
          .rect(doc.page.margins.left - 5, doc.y - 3, pageWidth + 10, 22)
          .fill('#E8EDF5');
        doc
          .font('Helvetica-Bold')
          .fontSize(15)
          .fillColor('#1E3A5F')
          .text(item.text, doc.page.margins.left, doc.y - 17, { width: pageWidth });
        doc.moveDown(0.3);
      } else if (item.type === 'heading') {
        doc.moveDown(0.2);
        doc
          .font('Helvetica-Bold')
          .fontSize(12)
          .fillColor('#7C3AED')
          .text(item.text, { width: pageWidth });
        doc.moveDown(0.15);
      } else if (item.type === 'list') {
        doc
          .font('Helvetica')
          .fontSize(10.5)
          .fillColor('#333333')
          .text('    ' + item.text, { width: pageWidth, lineGap: 2 });
      } else {
        doc
          .font('Helvetica')
          .fontSize(10.5)
          .fillColor('#333333')
          .text(item.text, { width: pageWidth, lineGap: 3, paragraphGap: 2 });
      }
    }

    // Pie de página
    const totalPages = doc.bufferedPageRange().count;
    for (let i = 0; i < totalPages; i++) {
      doc.switchToPage(i);
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#AAAAAA')
        .text(
          `ScanForge — Página ${i + 1} de ${totalPages}`,
          doc.page.margins.left,
          doc.page.height - 35,
          { width: pageWidth, align: 'center' }
        );
    }

    doc.end();
    doc.on('end', resolve);
    doc.on('error', reject);
  });
}

// ═══════════════════════════════════════════════════════════
// TXT — Texto limpio
// ═══════════════════════════════════════════════════════════

function generarTexto(texto, nombreArchivo, res) {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}.txt"`);
  res.send(texto);
}

module.exports = router;
