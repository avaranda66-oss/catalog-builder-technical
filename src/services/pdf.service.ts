import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export interface PDFExportOptions {
  fileName?: string;
  quality?: number;
}

export class PDFService {
  /**
   * Exporta os elementos de página A4 do DOM para um documento PDF multi-páginas de alta resolução.
   */
  static async exportToPDF(
    pageContainerSelector: string = '.a4-page-container',
    options: PDFExportOptions = {}
  ): Promise<{ success: boolean; blob?: Blob; message?: string }> {
    try {
      const pageElements = document.querySelectorAll(pageContainerSelector);
      if (!pageElements || pageElements.length === 0) {
        throw new Error('Nenhuma página A4 encontrada para exportação.');
      }

      // Inicializa jsPDF em formato A4 Retrato (210mm x 297mm)
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true
      });

      const pdfWidth = 210;
      const pdfHeight = 297;

      for (let i = 0; i < pageElements.length; i++) {
        const pageEl = pageElements[i] as HTMLElement;

        // Se não for a primeira página, adiciona nova folha no PDF
        if (i > 0) {
          pdf.addPage('a4', 'portrait');
        }

        // Renderiza o DOM da página para Canvas com alta densidade (escala 2x para nitidez)
        const canvas = await html2canvas(pageEl, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
          windowWidth: 794,
          windowHeight: 1123
        });

        const imgData = canvas.toDataURL('image/jpeg', options.quality || 0.95);
        pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
      }

      const fileName = options.fileName || `Catalogo_${new Date().toISOString().slice(0, 10)}.pdf`;
      pdf.save(fileName);

      const blob = pdf.output('blob');
      return { success: true, blob };
    } catch (err: any) {
      console.error('Erro na geração do PDF:', err);
      return { success: false, message: err.message || 'Falha ao gerar PDF.' };
    }
  }
}
