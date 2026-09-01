import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export interface PDFExportOptions {
  fileName?: string;
  quality?: number;
  scale?: number;
}

export class PDFService {
  /**
   * Exporta os elementos de página A4 do DOM para um documento PDF multi-páginas de alta resolução (300 DPI+).
   * Oculta automaticamente todos os botões de edição, lixeiras, badges e réguas durante a exportação.
   */
  static async exportToPDF(
    pageContainerSelector: string = '.a4-page-container',
    options: PDFExportOptions = {}
  ): Promise<{ success: boolean; blob?: Blob; message?: string }> {
    // Ativa o modo de exportação no body para ocultar instantaneamente botões e controles de edição
    document.body.classList.add('pdf-export-mode');

    try {
      // Garante que todas as fontes estejam 100% carregadas e renderizadas
      if (document.fonts) {
        await document.fonts.ready;
      }

      // Pequena pausa para garantir que os layouts recalculem sem os botões
      await new Promise((resolve) => setTimeout(resolve, 150));

      const pageElements = document.querySelectorAll(pageContainerSelector);
      if (!pageElements || pageElements.length === 0) {
        throw new Error('Nenhuma página A4 encontrada para exportação.');
      }

      // Inicializa jsPDF em formato A4 Retrato (210mm x 297mm) com alta precisão
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true
      });

      const pdfWidth = 210;
      const pdfHeight = 297;
      const scale = options.scale || 3; // Escala 3x para nitidez de 300 DPI

      for (let i = 0; i < pageElements.length; i++) {
        const pageEl = pageElements[i] as HTMLElement;

        if (i > 0) {
          pdf.addPage('a4', 'portrait');
        }

        // Renderiza o DOM da página para Canvas com alta densidade e antialiasing
        const canvas = await html2canvas(pageEl, {
          scale: scale,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
          windowWidth: 794,
          windowHeight: 1123,
          imageTimeout: 15000,
          onclone: (clonedDoc) => {
            // Garante que o documento clonado também oculte qualquer botão ou ação
            clonedDoc.body.classList.add('pdf-export-mode');
            const buttons = clonedDoc.querySelectorAll('button, .no-print, [data-editor-action]');
            buttons.forEach((btn) => ((btn as HTMLElement).style.display = 'none'));
          }
        });

        const imgData = canvas.toDataURL('image/jpeg', options.quality || 0.98);
        pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
      }

      const fileName = options.fileName || `PRESYS_Catalogo_${new Date().toISOString().slice(0, 10)}.pdf`;
      pdf.save(fileName);

      const blob = pdf.output('blob');
      return { success: true, blob };
    } catch (err: any) {
      console.error('Erro na geração do PDF:', err);
      return { success: false, message: err.message || 'Falha ao gerar PDF.' };
    } finally {
      // Remove o modo de exportação para restaurar a interface de edição
      document.body.classList.remove('pdf-export-mode');
    }
  }
}
