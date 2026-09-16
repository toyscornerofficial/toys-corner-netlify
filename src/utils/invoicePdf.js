import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatDateIST } from './dateHelpers';

/**
 * jsPDF's built-in fonts (Helvetica) have no glyph for ₹ (U+20B9) — it
 * renders as a garbled/superscript artifact. Using "Rs." here instead;
 * the ₹ symbol is still used everywhere on the actual web pages, since
 * browsers render it correctly.
 */
function formatCurrencyPdf(amount) {
  const n = Number(amount) || 0;
  return `Rs. ${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

/** PDF-safe version of formatDiscountLabel — shows "10% (Rs. 100)" or "Rs. 100". */
function formatDiscountLabelPdf(sale) {
  if (sale.discount_type === 'percent') {
    return `${sale.discount_value}% (${formatCurrencyPdf(sale.discount)})`;
  }
  return formatCurrencyPdf(sale.discount);
}

/**
 * Generates a unique, easily identifiable filename for an invoice PDF.
 * Pattern: Invoice_<InvoiceNo>_<CustomerNameOrWalkin>_<DDMonYYYY>.pdf
 * e.g. Invoice_INV000123_RahulSharma_31Jul2026.pdf
 *
 * This is unique per sale (invoice_no is DB-unique) and human-scannable
 * in a downloads folder — no need to open the file to know what it is.
 */
function buildInvoiceFilename(sale) {
  const customerPart = (sale.customers?.name || 'WalkIn').replace(/[^a-zA-Z0-9]/g, '');
  const datePart = formatDateIST(sale.date, 'DDMMMYYYY');
  return `Invoice_${sale.invoice_no}_${customerPart}_${datePart}.pdf`;
}

export function generateInvoicePdf({ sale, items }, settings = {}) {
  const doc = new jsPDF({ unit: 'pt', format: 'a5' });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header
  doc.setFontSize(16);
  doc.setFont(undefined, 'bold');
  doc.text(settings?.business_name || 'Toys Corner', pageWidth / 2, 40, { align: 'center' });

  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  doc.text('Invoice', pageWidth / 2, 56, { align: 'center' });

  let headerY = 56;
  doc.setFontSize(8);
  doc.setTextColor(120);
  if (settings?.show_address_on_print !== false && settings?.business_address) {
    headerY += 12;
    doc.text(settings.business_address, pageWidth / 2, headerY, { align: 'center' });
  }
  if (settings?.show_phone_on_print !== false && settings?.business_phone) {
    headerY += 12;
    doc.text(`Ph: ${settings.business_phone}`, pageWidth / 2, headerY, { align: 'center' });
  }
  if (settings?.show_whatsapp_on_print !== false && settings?.whatsapp_number) {
    headerY += 12;
    doc.text(`WhatsApp: ${settings.whatsapp_number}`, pageWidth / 2, headerY, { align: 'center' });
  }
  if (settings?.show_gst_on_print !== false && settings?.gst) {
    headerY += 12;
    doc.text(`GSTIN: ${settings.gst}`, pageWidth / 2, headerY, { align: 'center' });
  }
  doc.setTextColor(0);

  // Invoice meta — shifted down if address/phone took extra lines
  const metaY = headerY + 24;
  doc.setFontSize(9);
  doc.text(`Invoice No: ${sale.invoice_no}`, 32, metaY);
  doc.text(`Date: ${formatDateIST(sale.date)}`, 32, metaY + 14);

  const customerName = sale.customers?.name ?? 'Walk-in Customer';
  doc.text(customerName, pageWidth - 32, metaY, { align: 'right' });
  if (sale.customers?.phone) {
    doc.text(sale.customers.phone, pageWidth - 32, metaY + 14, { align: 'right' });
  }
  if (sale.customers?.unique_customer_id) {
    doc.text(sale.customers.unique_customer_id, pageWidth - 32, metaY + 28, { align: 'right' });
  }

  // Line items table
  autoTable(doc, {
    startY: metaY + 40,
    margin: { left: 32, right: 32 },
    head: [['Item', 'Qty', 'Price', 'Discount', 'Total']],
    body: items.map((item) => [
      item.products?.product_name ?? '—',
      String(item.qty),
      formatCurrencyPdf(item.price),
      formatCurrencyPdf(item.discount),
      formatCurrencyPdf(item.total),
    ]),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [79, 70, 229] }, // #4F46E5
  });

  const finalY = doc.lastAutoTable.finalY + 16;
  const labelX = pageWidth - 170; // widened from -140 so "10% (Rs. 1,234)" style labels have room before the right-aligned value
  const valueX = pageWidth - 32;

  doc.setFontSize(9);
  doc.text('Subtotal', labelX, finalY);
  doc.text(formatCurrencyPdf(sale.subtotal), valueX, finalY, { align: 'right' });

  doc.text('Discount', labelX, finalY + 14);
  doc.text(`-${formatDiscountLabelPdf(sale)}`, valueX, finalY + 14, { align: 'right' });

  doc.setFont(undefined, 'bold');
  doc.setFontSize(12);
  doc.text('Grand Total', labelX, finalY + 34);
  doc.text(formatCurrencyPdf(sale.grand_total), valueX, finalY + 34, { align: 'right' });

  doc.setFont(undefined, 'normal');
  doc.setFontSize(9);
  doc.text(`Payment Method: ${sale.payment_method}`, 32, finalY + 52);

  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(`Thank you for shopping at ${settings?.business_name || 'Toys Corner'}!`, pageWidth / 2, finalY + 76, { align: 'center' });

  doc.setFontSize(7);
  doc.setTextColor(160);
  doc.text('Powered by Abronix Technologies', pageWidth / 2, finalY + 88, { align: 'center' });

  doc.save(buildInvoiceFilename(sale));
}
