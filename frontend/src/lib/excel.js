// Exportar a Excel (.xlsx) en el navegador. SheetJS se carga solo al exportar,
// para no aumentar el peso de la app.
// sheets: [{ name, rows: [{ Columna: valor, ... }] }]
export async function exportXlsx(filename, sheets) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const { name, rows } of sheets) {
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ '': 'Sin datos' }]);
    // Ancho de columna según el contenido más largo
    const cols = Object.keys(rows[0] || { '': '' });
    ws['!cols'] = cols.map((c) => ({
      wch: Math.min(48, Math.max(c.length, ...rows.map((r) => String(r[c] ?? '').length)) + 2),
    }));
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  }
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : filename + '.xlsx');
}
