import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { formatDateIST } from './dateHelpers';

/** Same reasoning as invoicePdf.js — jsPDF's default font has no ₹ glyph. */
export function formatCurrencyPdf(amount) {
  const n = Number(amount) || 0;
  return `Rs. ${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

/**
 * Builds a unique, identifiable filename for any report export.
 * Pattern: <ReportType>_Report_<StartDate>_to_<EndDate>.<ext>
 * e.g. Sales_Report_01Jul2026_to_31Jul2026.pdf
 */
export function buildReportFilename(reportType, start, end, ext) {
  const startPart = formatDateIST(start, 'DDMMMYYYY');
  const endPart = formatDateIST(end, 'DDMMMYYYY');
  return `${reportType}_Report_${startPart}_to_${endPart}.${ext}`;
}

/**
 * Exports any tabular report to PDF. columns: [{ header, key }], rows: array of objects.
 */
export function exportReportToPdf({ title, dateRangeLabel, columns, rows, filename, extraFooterTable, grandTotalLine }) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFontSize(16);
  doc.setFont(undefined, 'bold');
  doc.text('Toys Corner', pageWidth / 2, 40, { align: 'center' });

  doc.setFontSize(11);
  doc.setFont(undefined, 'normal');
  doc.text(title, pageWidth / 2, 58, { align: 'center' });

  if (dateRangeLabel) {
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(dateRangeLabel, pageWidth / 2, 72, { align: 'center' });
    doc.setTextColor(0);
  }

  autoTable(doc, {
    startY: 88,
    margin: { left: 32, right: 32 },
    head: [columns.map((c) => c.header)],
    body: rows.map((row) => columns.map((c) => row[c.key] ?? '—')),
    styles: { fontSize: 8, cellPadding: 5 },
    headStyles: { fillColor: [79, 70, 229] },
  });

  let cursorY = doc.lastAutoTable.finalY + 20;

  // Right-aligned Grand Total line, same visual weight as the invoice PDF
  if (grandTotalLine) {
    doc.setFont(undefined, 'bold');
    doc.setFontSize(11);
    doc.text(`Grand Total: ${grandTotalLine}`, pageWidth - 32, cursorY, { align: 'right' });
    doc.setFont(undefined, 'normal');
    cursorY += 24;
  }

  // Payment method breakdown as a proper aligned mini-table, color-coded
  // per method (matching the on-screen cards) and bold, so cashiers/admin
  // can scan it at a glance rather than reading text carefully.
  const METHOD_COLORS = {
    Cash: [34, 197, 94],   // #22C55E green
    UPI: [79, 70, 229],    // #4F46E5 indigo
    Card: [245, 158, 11],  // #F59E0B orange
  };
  const METHOD_LIGHT_FILLS = {
    Cash: [220, 252, 231],  // pale green
    UPI: [224, 231, 255],   // pale indigo
    Card: [254, 243, 199],  // pale orange
  };

  if (extraFooterTable && extraFooterTable.rows.length > 0) {
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(0);
    doc.text(extraFooterTable.title, 32, cursorY);

    autoTable(doc, {
      startY: cursorY + 8,
      margin: { left: 32, right: 32 },
      head: [extraFooterTable.columns],
      body: extraFooterTable.rows,
      styles: { fontSize: 9, cellPadding: 6, fontStyle: 'bold' },
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255] }, // dark slate header
      tableWidth: 320,
      didParseCell: (data) => {
        if (data.section !== 'body') return;
        const method = data.row.raw[0];
        if (METHOD_COLORS[method]) {
          data.cell.styles.textColor = METHOD_COLORS[method];
          data.cell.styles.fillColor = METHOD_LIGHT_FILLS[method];
        }
      },
    });
  }

  // Footer on every page (autoTable can span multiple pages)
  const pageCount = doc.internal.getNumberOfPages();
  const pageHeight = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(160);
    doc.text('Powered by Abronix Technologies', pageWidth / 2, pageHeight - 20, { align: 'center' });
  }

  doc.save(filename);
}

/**
 * Exports any tabular report to Excel (.xlsx). columns: [{ header, key }], rows: array of objects.
 * totalsRow, if given, is appended as one extra row at the bottom (e.g. a
 * "Final Total" row summing a specific column) — keyed by column header,
 * same as each data row.
 */
export function exportReportToExcel({ sheetName, columns, rows, filename, totalsRow, extraRows }) {
  const sheetData = rows.map((row) => {
    const obj = {};
    for (const c of columns) obj[c.header] = row[c.key] ?? '';
    return obj;
  });

  if (totalsRow) {
    const totalsObj = {};
    for (const c of columns) totalsObj[c.header] = totalsRow[c.header] ?? '';
    sheetData.push(totalsObj);
  }

  // Extra summary rows appended after the totals row (e.g. Cash/UPI/Card
  // breakdown) — each keyed by column header same as a normal data row,
  // so partially-filled rows (most cells blank) render fine in Excel.
  if (extraRows && extraRows.length > 0) {
    for (const row of extraRows) {
      const obj = {};
      for (const c of columns) obj[c.header] = row[c.header] ?? '';
      sheetData.push(obj);
    }
  }

  const worksheet = XLSX.utils.json_to_sheet(sheetData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31)); // Excel sheet name limit
  XLSX.writeFile(workbook, filename);
}
