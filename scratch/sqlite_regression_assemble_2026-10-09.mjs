// Inserta la tabla por pregunta en el reporte final.
import fs from 'fs';
const rep = 'C:/AIV2/reports/testing_sqlite_2026-10-09.md';
const table = fs.readFileSync('C:/AIV2/scratch/sqlite_regression_table_2026-10-09.md', 'utf8');
const txt = fs.readFileSync(rep, 'utf8');
if (!txt.includes('<!--TABLA-->')) throw new Error('marcador no encontrado');
fs.writeFileSync(rep, txt.replace('<!--TABLA-->', table), 'utf8');
console.log('ok', table.split('\n').length - 3, 'filas');
