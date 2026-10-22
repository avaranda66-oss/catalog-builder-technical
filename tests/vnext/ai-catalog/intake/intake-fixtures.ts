import ExcelJS from 'exceljs';

/** Shared by the FR-64 intake tests. */
export const fileOf = (data: BlobPart, name: string) => new File([data], name);
export async function workbookBytes(build: (book: ExcelJS.Workbook) => void): Promise<ArrayBuffer> {
  const book = new ExcelJS.Workbook();
  build(book);
  const view = new Uint8Array(await book.xlsx.writeBuffer() as ArrayBuffer);
  return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
}
export const png = (width: number, height: number) => {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(bytes.buffer); view.setUint32(16, width); view.setUint32(20, height);
  return bytes;
};

/** PCON-MASTER-like workbook: the sensors sheet with two price columns, an access log and a hidden original. */
export async function masterWorkbook(): Promise<ArrayBuffer> {
  return workbookBytes((book) => {
    const sensors = book.addWorksheet('DB_SENSORS');
    sensors.addRow(['SENSORS DATABASE']);
    sensors.addRow([]);
    sensors.addRow(['Revisão 2026']);
    sensors.addRow(['Code', 'Range (1)', 'Range (2)', 'Range (3)', 'Gauge Type', 'Accuracy', 'Precision', 'Description', 'Price', 'Family(ies)', 'Price Y18-HP', 'Notes']);
    for (let row = 0; row < 69; row++) {
      sensors.addRow([`0D${100 + row}`, `± ${row + 1}00 Pa`, `0,${row + 40} inH2O`, `±${row + 1} mbar`, 'Differential', 0.025, 'Standard Precision',
        `Sensor ${row + 1}`, 1200 + row, 'Y17, Y18-LP', 1500 + row, '']);
    }
    sensors.getColumn(6).numFmt = '0.000';
    const logs = book.addWorksheet('AccessLogs');
    logs.addRow(['User', 'Email', 'When']);
    logs.addRow(['ana', 'ana@presys.com.br', '2026-01-01']);
    const original = book.addWorksheet('ORIGINAL_Y17', { state: 'hidden' });
    original.addRow(['Code', 'Old']);
    original.addRow(['X1', 'Y']);
    const old = book.addWorksheet('DB_OLD', { state: 'hidden' });
    old.addRow(['Code', 'Range']);
    old.addRow(['0A100', '± 1 bar']);
  });
}

