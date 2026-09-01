import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export interface PDFExportOptions {
  fileName?: string;
  quality?: number;
  scale?: number;
}

export class PDFService {
  /**
   * Opens the browser's native print / vector PDF dialog with exact 210mm x 297mm A4 layout.
   */
  static printNative(): void {
    window.print();
  }

  /**
   * Exports all A4 pages to a multi-page high-resolution PDF document (300 DPI+).
   * Ensures styles, colors, fonts, and images are preserved accurately.
   */
  static async exportToPDF(
    pageContainerSelector: string = '.a4-page-container',
    options: PDFExportOptions = {}
  ): Promise<{ success: boolean; blob?: Blob; message?: string }> {
    document.body.classList.add('pdf-export-mode');

    try {
      if (document.fonts) {
        await document.fonts.ready;
      }

      await new Promise((resolve) => setTimeout(resolve, 200));

      const pageElements = document.querySelectorAll(pageContainerSelector);
      if (!pageElements || pageElements.length === 0) {
        throw new Error('No A4 pages found for PDF export.');
      }

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true
      });

      const pdfWidth = 210;
      const pdfHeight = 297;
      const scale = options.scale || 3; // 300 DPI+ ultra high resolution

      for (let i = 0; i < pageElements.length; i++) {
        const pageEl = pageElements[i] as HTMLElement;

        if (i > 0) {
          pdf.addPage('a4', 'portrait');
        }

        // Scroll to element to ensure viewport visibility for rendering
        pageEl.scrollIntoView();
        await new Promise((resolve) => setTimeout(resolve, 80));

        const canvas = await html2canvas(pageEl, {
          scale: scale,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
          width: 794,
          height: 1123,
          scrollX: 0,
          scrollY: 0,
          windowWidth: 794,
          windowHeight: 1123,
          imageTimeout: 15000,
          onclone: (clonedDoc) => {
            clonedDoc.body.classList.add('pdf-export-mode');
            const buttons = clonedDoc.querySelectorAll('button, .no-print, [data-editor-action]');
            buttons.forEach((btn) => ((btn as HTMLElement).style.display = 'none'));
          }
        });

        const imgData = canvas.toDataURL('image/jpeg', options.quality || 0.98);
        pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'SLOW');
      }

      const fileName = options.fileName || `PRESYS_Catalog_${new Date().toISOString().slice(0, 10)}.pdf`;
      pdf.save(fileName);

      const blob = pdf.output('blob');
      return { success: true, blob };
    } catch (err: any) {
      console.error('Error generating PDF:', err);
      return { success: false, message: err.message || 'Failed to generate PDF.' };
    } finally {
      document.body.classList.remove('pdf-export-mode');
    }
  }
}
