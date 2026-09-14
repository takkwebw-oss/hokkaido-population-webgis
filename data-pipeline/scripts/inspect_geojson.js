const fs = require("fs");
const path = require("path");

const filePath = path.join(__dirname, "..", "raw", "N03-2024.geojson");
const raw = fs.readFileSync(filePath, "utf8");
const gj = JSON.parse(raw);

console.log("feature数:", gj.features.length);
console.log("\n--- 最初の5件のproperties ---");
gj.features.slice(0, 5).forEach((f, i) => console.log(i, JSON.stringify(f.properties)));

const codeSet = new Map();
for (const f of gj.features) {
  const p = f.properties;
  const code = p.N03_007;
  const name = (p.N03_004 || "") + (p.N03_003 || "") ; // 郡名+市町村名 etc.
  if (!codeSet.has(code)) codeSet.set(code, new Set());
  codeSet.get(code).add(JSON.stringify(p));
}
console.log("\nユニーク市町村コード数:", codeSet.size);

// 札幌市の区一覧確認
const sapporoRows = gj.features.filter(f => f.properties.N03_003 === "札幌市");
const uniqueSapporo = new Set(sapporoRows.map(f => JSON.stringify(f.properties)));
console.log("\n札幌市関連のユニークproperties件数:", uniqueSapporo.size);
[...uniqueSapporo].slice(0, 15).forEach(s => console.log(s));
