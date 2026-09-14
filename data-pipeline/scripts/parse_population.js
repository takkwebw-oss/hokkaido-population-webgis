// 北海道庁公表の「男女別人口・世帯数」(danjobetu.xls)から、大正9年〜令和2年の
// 国勢調査年ごとの市町村別人口を抽出する。
//
// シート構成: T9,T14,S5,S10,S15,S22,S25,S30,S35,S40,S45,S50,S55,S60,H2,H7,H12,H17,H22,H27,R2
// 各シートは 支庁/振興局 > 市部・郡部 or 市計・町村計 > 市町村 の階層。
// 列: [0]支庁計等 [1]市部計/郡部計等 [2]市町村名(この列が埋まっている行が実データ行) [3]区名(区がある場合のみ)
//     [4]総数 [5]男 [6]女 [7]世帯数 [8]読み仮名 [9]現在の地名(あれば。無いシートは名称=現在の地名とみなす)
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

const SHEET_YEAR = {
  T9: 1920, T14: 1925, S5: 1930, S10: 1935, S15: 1940,
  S22: 1947, S25: 1950, S30: 1955, S35: 1960, S40: 1965,
  S45: 1970, S50: 1975, S55: 1980, S60: 1985, H2: 1990,
  H7: 1995, H12: 2000, H17: 2005, H22: 2010, H27: 2015, R2: 2020,
};

// 「現在の地名」欄はカンマ区切りではなく読点区切りで複数市町村にまたがる場合がある
// (例: 「札幌市豊平区、南区、清田区」「福山町」→「松前町」等)。
// 区表記が混ざっている場合は、最初に現れる 市/町/村 で区切って市町村名だけを取り出す。
// 半角・全角の空白をすべて除去して比較用に正規化する
// (「泊　村」のように旧市町村名の表記ゆれに全角スペースが挟まる箇所があるため)
function normalizeName(s) {
  return (s || "").replace(/[\s　]+/g, "");
}

function extractCurrentName(raw, fallback) {
  const s = normalizeName(raw);
  if (!s) return normalizeName(fallback);
  const first = s.split("、")[0];
  // 区名(〜区)が続く場合に備え、最後に現れる市/町/村までを市町村名とみなす
  // (例: 「札幌市豊平区」→「札幌市」。「余市町」のように市区町村種別の文字を
  //  途中に含む名称でも、最後の出現位置で切ることで正しく末尾まで拾える)
  const m = first.match(/^(.+[市町村])/);
  return m ? m[1] : first;
}

// 北方領土・千島列島関連で、現在の179市町村に対応先が無いもの。
// 「現在の地名」欄が空欄、または（国後島）（択捉島）（色丹島）のような
// 括弧書きの地域見出しになっている行がこれに該当する。人口レイヤーの
// 集計対象からは除外し、地図では別途「データなし」領域として表示する。
const NO_MAPPING_OLD_NAMES = new Set(["占守郡", "得撫郡", "新知郡"]);

function isTerritorialRow(oldName, currentNameRaw) {
  if (NO_MAPPING_OLD_NAMES.has(oldName)) return true;
  const raw = (currentNameRaw || "").trim();
  if (raw.startsWith("（") || raw.startsWith("(")) return true;
  return false;
}

function parseSheet(wb, sheetName) {
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  const records = [];

  for (const row of rows) {
    const oldName = (row[2] || "").toString().trim();
    if (!oldName) continue; // 支庁計・市部計・郡部計・区の内訳行等はスキップ
    if (oldName.endsWith("計")) continue; // 「町村計」等、階層の深い集計行のスキップ漏れ対策

    const total = row[4];
    if (typeof total !== "number") continue;

    const currentNameRaw = row[9];
    if (isTerritorialRow(oldName, currentNameRaw)) continue; // 北方領土・千島列島は対象外

    const currentName = extractCurrentName(currentNameRaw, oldName);

    records.push({
      oldName,
      currentName,
      total,
      male: typeof row[5] === "number" ? row[5] : null,
      female: typeof row[6] === "number" ? row[6] : null,
      households: typeof row[7] === "number" ? row[7] : null,
    });
  }
  return records;
}

function main() {
  const filePath = path.join(__dirname, "..", "raw", "danjobetu.xls");
  const wb = XLSX.readFile(filePath);

  const byYear = {};
  const allCurrentNames = new Set();

  for (const [sheetName, year] of Object.entries(SHEET_YEAR)) {
    const records = parseSheet(wb, sheetName);
    const byCurrentName = new Map();

    for (const r of records) {
      allCurrentNames.add(r.currentName);
      const acc = byCurrentName.get(r.currentName) || { total: 0, contributors: [] };
      acc.total += r.total;
      acc.contributors.push({ oldName: r.oldName, total: r.total });
      byCurrentName.set(r.currentName, acc);
    }

    byYear[year] = Object.fromEntries(byCurrentName);
    console.log(`${sheetName} (${year}年): 旧レコード${records.length}件 -> 現市町村${byCurrentName.size}件`);
  }

  const outPath = path.join(__dirname, "..", "output", "population_by_current_name.json");
  fs.writeFileSync(outPath, JSON.stringify(byYear, null, 0));
  console.log("\n出力:", outPath);
  console.log("現市町村名ユニーク数(全期間通算):", allCurrentNames.size);

  const namesOutPath = path.join(__dirname, "..", "output", "current_names_all.json");
  fs.writeFileSync(namesOutPath, JSON.stringify([...allCurrentNames].sort(), null, 2));
}

main();
