const ExcelJS = require('exceljs');

function enviarCSV(res, filename, columnas, filas) {
  const escapar = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const encabezado = columnas.map((c) => c.header).join(',');
  const cuerpo = filas.map((fila) => columnas.map((c) => escapar(fila[c.key])).join(','));
  const csv = [encabezado, ...cuerpo].join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
  res.send('﻿' + csv);
}

async function enviarXLSX(res, filename, hoja, columnas, filas, graficas = []) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(hoja);
  sheet.columns = columnas.map((c) => ({ header: c.header, key: c.key, width: c.width || 20 }));
  sheet.getRow(1).font = { bold: true };
  filas.forEach((fila) => sheet.addRow(fila));

  let filaActual = filas.length + 3;
  for (const grafica of graficas) {
    const match = /^data:image\/(png|jpeg);base64,/.exec(grafica.dataUrl || '');
    if (!match) continue;

    sheet.getCell(filaActual, 1).value = grafica.titulo || '';
    sheet.getCell(filaActual, 1).font = { bold: true };
    filaActual += 1;

    const imageId = workbook.addImage({ base64: grafica.dataUrl, extension: match[1] });
    sheet.addImage(imageId, { tl: { col: 0, row: filaActual }, ext: { width: 480, height: 260 } });
    filaActual += 16;
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
}

module.exports = { enviarCSV, enviarXLSX };
