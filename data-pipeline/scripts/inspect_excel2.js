const XLSX = require("xlsx");
const path = require("path");

const filePath = path.join(__dirname, "..", "raw", "danjobetu.xls");
const wb = XLSX.readFile(filePath);

for (const name of ["S45", "H12", "H27", "R2"]) {
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  console.log(`\n=== シート「${name}」 総行数:${rows.length} ===`);
  rows.slice(0, 12).forEach((r, i) => console.log(i, JSON.stringify(r)));
}
