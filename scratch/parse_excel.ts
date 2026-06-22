import * as fs from 'node:fs';
import * as path from 'node:path';
import ExcelJS from 'exceljs';

async function analyzeExcelFile(filePath: string): Promise<string> {
  let output = '';
  output += `==================================================\n`;
  output += `FILE: ${path.basename(filePath)}\n`;
  output += `==================================================\n`;

  if (!fs.existsSync(filePath)) {
    return `File not found: ${filePath}\n`;
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  workbook.eachSheet((sheet) => {
    output += `\n--- Sheet: ${sheet.name} (Total rows: ${sheet.rowCount}) ---\n`;
    if (sheet.rowCount === 0) return;

    // Get headers
    const headerRow = sheet.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell({ includeEmpty: true }, (cell) => {
      headers.push(cell.text ? cell.text.trim() : '');
    });
    output += `Columns: ${headers.join(' | ')}\n\n`;

    // Print sample data (rows 2 to 5)
    const maxRows = Math.min(sheet.rowCount, 4);
    for (let i = 2; i <= maxRows; i++) {
      const row = sheet.getRow(i);
      const rowValues: string[] = [];

      // Map columns to values
      for (let colIdx = 1; colIdx <= headers.length; colIdx++) {
        const cell = row.getCell(colIdx);
        let text = '';
        if (cell.value !== null && cell.value !== undefined) {
          if (typeof cell.value === 'object') {
            if ('richText' in cell.value) {
              // biome-ignore lint/suspicious/noExplicitAny: scratch script
              text = (cell.value as any).richText.map((rt: any) => rt.text || '').join('');
            } else if ('text' in cell.value) {
              // biome-ignore lint/suspicious/noExplicitAny: scratch script
              text = (cell.value as any).text || '';
            } else if ('result' in cell.value) {
              // biome-ignore lint/suspicious/noExplicitAny: scratch script
              text = String((cell.value as any).result || '');
            } else {
              text = JSON.stringify(cell.value);
            }
          } else {
            text = String(cell.value);
          }
        }
        text = text.trim().replace(/\s+/g, ' ');
        if (text.length > 80) {
          text = `${text.substring(0, 80)}...`;
        }
        rowValues.push(`${headers[colIdx - 1] || `Col${colIdx}`}: ${text}`);
      }
      output += `Row ${i}:\n  - ${rowValues.join('\n  - ')}\n`;
    }
  });
  return output;
}

async function main() {
  const mockDataDir = path.resolve(__dirname, '../mock-data');
  const file1 = path.join(mockDataDir, '03_ta_hire_request_jd_generation.xlsx');
  const file2 = path.join(mockDataDir, '04_ta_cv_screening.xlsx');

  let fullReport = '';
  fullReport += await analyzeExcelFile(file1);
  fullReport += '\n\n';
  fullReport += await analyzeExcelFile(file2);

  const reportPath = path.join(__dirname, 'excel_analysis_report.txt');
  fs.writeFileSync(reportPath, fullReport, 'utf8');
  console.log(`\nAnalysis report written to: ${reportPath}`);

  // Also print a truncated version of the sheets structure to the console
  console.log(fullReport.substring(0, 5000));
  if (fullReport.length > 5000) {
    console.log('\n... (truncated in console, view full file for details) ...');
  }
}

main().catch(console.error);
