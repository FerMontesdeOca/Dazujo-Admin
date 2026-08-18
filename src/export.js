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

async function enviarXLSX(res, filename, hoja, columnas, filas) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(hoja);
  sheet.columns = columnas.map((c) => ({ header: c.header, key: c.key, width: c.width || 20 }));
  sheet.getRow(1).font = { bold: true };
  filas.forEach((fila) => sheet.addRow(fila));

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
}

module.exports = { enviarCSV, enviarXLSX };
