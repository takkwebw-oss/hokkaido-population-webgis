const XLSX = require("xlsx");
const path = require("path");

const filePath = path.join(__dirname, "..", "raw", "danjobetu.xls");
const wb = XLSX.readFile(filePath);

for (const name of ["S5", "S22", "S25", "H7", "H17", "H22"]) {
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  console.log(`\n=== シート「${name}」 総行数:${rows.length} 列数(header):${rows[2] ? rows[2].length : "?"} ===`);
  rows.slice(0, 10).forEach((r, i) => console.log(i, JSON.stringify(r)));
}
