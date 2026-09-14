const XLSX = require("xlsx");
const path = require("path");

const filePath = path.join(__dirname, "..", "raw", "danjobetu.xls");
const wb = XLSX.readFile(filePath);

console.log("シート数:", wb.SheetNames.length);
console.log("シート名一覧:", wb.SheetNames);

const firstSheet = wb.SheetNames[0];
const ws = wb.Sheets[firstSheet];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
console.log(`\n--- シート「${firstSheet}」先頭30行 ---`);
rows.slice(0, 30).forEach((r, i) => console.log(i, JSON.stringify(r)));
console.log(`\n総行数: ${rows.length}`);
