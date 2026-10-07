import ExcelJS from 'exceljs';
import type { AnalysisRecord } from './analysis-record';

// Loaded on demand by Export Excel; no image data is uploaded.
export async function channelWorkbook(records: AnalysisRecord[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'KidneyQuant';
  for (const record of records) {
    const channel = record.analysis.signalChannel;
    const sheet = workbook.addWorksheet(channel[0].toUpperCase() + channel.slice(1));
    sheet.columns = [{ width: 42 }, { width: 48 }, { width: 80 }];
    sheet.views = [{ state: 'frozen', ySplit: 4 }];
    sheet.addRow([`${channel.toUpperCase()} channel measurements`]);
    sheet.addRow(['Sample', record.sampleId]);
    sheet.addRow(['Stain / marker', record.analysis.stain]);
    sheet.addRow(['Measurement', 'Value', 'Definition / units']);
    for (const [key, value] of Object.entries(record.metrics)) {
      sheet.addRow([key, value, record.metricDefinitions[key as keyof typeof record.metricDefinitions]]);
    }
    sheet.addRow([]);
    sheet.addRow(['Analysis settings and source provenance']);
    const addFields = (prefix: string, value: unknown) => {
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        for (const [key, child] of Object.entries(value)) addFields(prefix ? `${prefix}.${key}` : key, child);
      } else sheet.addRow([prefix, Array.isArray(value) ? JSON.stringify(value) : value]);
    };
    const { metrics: _metrics, metricDefinitions: _definitions, ...metadata } = record;
    void _metrics; void _definitions;
    addFields('', metadata);
    sheet.eachRow(row => {
      row.alignment = { vertical: 'top', wrapText: true };
      row.eachCell(cell => { if (typeof cell.value === 'number') cell.numFmt = '0.####'; });
    });
    for (const rowNumber of [1, 4]) {
      const row = sheet.getRow(rowNumber);
      row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E6B4D' } };
      row.height = 26;
    }
  }
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
