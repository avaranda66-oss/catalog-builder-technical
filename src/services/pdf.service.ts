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
   * Ensures all image elements within a root container are fully loaded.
   */
  private static async preloadImages(container: Element): Promise<void> {
    const images = Array.from(container.querySelectorAll('img'));
    const promises = images.map((img) => {
      if (img.complete && img.naturalWidth !== 0) return Promise.resolve();
      return new Promise<void>((resolve) => {
        img.onload = () => resolve();
        img.onerror = () => resolve(); // Don't block export on failed image
        setTimeout(resolve, 3000); // 3s timeout per image
      });
    });
    await Promise.all(promises);
  }

  /**
   * Exports all A4 pages to a multi-page high-resolution PDF document (300 DPI+).
   * Ensures styles, colors, fonts, and images are preserved accurately without deformation.
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

      const pageElements = document.querySelectorAll(pageContainerSelector);
      if (!pageElements || pageElements.length === 0) {
        throw new Error('Nenhuma página A4 encontrada para exportar o PDF.');
      }

      // Preload images across all pages
      for (const pageEl of Array.from(pageElements)) {
        await this.preloadImages(pageEl);
      }

      await new Promise((resolve) => setTimeout(resolve, 250));

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true
      });

      const pdfWidth = 210;
      const pdfHeight = 297;
      const scale = options.scale || 3.5; // 350+ DPI Ultra High Definition lossless rendering

      for (let i = 0; i < pageElements.length; i++) {
        const pageEl = pageElements[i] as HTMLElement;

        if (i > 0) {
          pdf.addPage('a4', 'portrait');
        }

        const canvas = await html2canvas(pageEl, {
          scale: scale,
          useCORS: true,
          allowTaint: true,
          logging: false,
          backgroundColor: '#ffffff',
          width: 794,
          height: 1123,
          windowWidth: 794,
          windowHeight: 1123,
          imageTimeout: 20000,
          onclone: (clonedDoc, clonedElement) => {
            clonedDoc.body.classList.add('pdf-export-mode');

            // Hide editor elements, guidelines and buttons
            const buttons = clonedDoc.querySelectorAll('button, .no-print, [data-editor-action], .a4-limit-guideline, .divergence-badge, .editor-only');
            buttons.forEach((btn) => ((btn as HTMLElement).style.display = 'none'));

            if (clonedElement) {
              clonedElement.style.width = '794px';
              clonedElement.style.minWidth = '794px';
              clonedElement.style.maxWidth = '794px';
              clonedElement.style.height = '1123px';
              clonedElement.style.minHeight = '1123px';
              clonedElement.style.maxHeight = '1123px';
              clonedElement.style.boxSizing = 'border-box';
              clonedElement.style.overflow = 'hidden';
              clonedElement.style.margin = '0';
              clonedElement.style.boxShadow = 'none';

              // Remove all active selection rings and focus states in cloned element
              const selectedEls = clonedElement.querySelectorAll('[class*="ring-"], [class*="bg-blue-500/10"]');
              selectedEls.forEach((el) => {
                el.classList.remove('ring-1', 'ring-2', 'ring-blue-400', 'ring-blue-500', 'ring-blue-600', 'bg-blue-500/10');
                (el as HTMLElement).style.boxShadow = 'none';
              });

              // Convert any img with object-cover / object-contain to background-image for faithful html2canvas rendering
              const imgs = clonedElement.querySelectorAll('img');
              imgs.forEach((img) => {
                const src = img.getAttribute('src');
                if (!src) return;

                const isCover = img.classList.contains('object-cover') || img.style.objectFit === 'cover';
                const isContain = img.classList.contains('object-contain') || img.style.objectFit === 'contain';

                if (isCover || isContain) {
                  const bgDiv = clonedDoc.createElement('div');
                  bgDiv.className = img.className;
                  bgDiv.style.cssText = img.style.cssText;
                  bgDiv.style.backgroundImage = `url("${src}")`;
                  bgDiv.style.backgroundSize = isCover ? 'cover' : 'contain';
                  bgDiv.style.backgroundPosition = 'center center';
                  bgDiv.style.backgroundRepeat = 'no-repeat';
                  img.parentNode?.replaceChild(bgDiv, img);
                }
              });
            }
          }
        });

        const imgData = canvas.toDataURL('image/png');
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
      }

      const fileName = options.fileName || `PRESYS_Catalog_${new Date().toISOString().slice(0, 10)}.pdf`;
      pdf.save(fileName);

      const blob = pdf.output('blob');
      return { success: true, blob };
    } catch (err: any) {
      console.error('Error generating PDF:', err);
      return { success: false, message: err.message || 'Falha ao gerar o arquivo PDF.' };
    } finally {
      document.body.classList.remove('pdf-export-mode');
    }
  }
}
