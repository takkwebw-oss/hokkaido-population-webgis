// N03(国土数値情報 行政区域データ)から北海道の「現在の市町村」単位の境界を作るための前処理。
// - 札幌市の10区(01101〜01110)は1つの「札幌市」(コード01100)に統合する。
// - 北方領土関連の6コード(01695〜01700: 色丹村、国後郡泊村・留夜別村、択捉郡留別村、紗那郡紗那村、蘂取郡蘂取村)は
//   現在も日本の行政が及んでおらず人口統計が存在しないため、人口レイヤーとは別の「データなし」領域として分離出力する。
const fs = require("fs");
const path = require("path");

const SAPPORO_WARD_CODES = new Set([
  "01101", "01102", "01103", "01104", "01105",
  "01106", "01107", "01108", "01109", "01110",
]);
const SAPPORO_CODE = "01100";
const SAPPORO_NAME = "札幌市";

const NO_DATA_CODES = new Set(["01695", "01696", "01697", "01698", "01699", "01700"]);

const inPath = path.join(__dirname, "..", "raw", "N03-2024.geojson");
const outMainPath = path.join(__dirname, "..", "output", "prepped_municipalities.geojson");
const outNoDataPath = path.join(__dirname, "..", "output", "prepped_no_data_area.geojson");

const gj = JSON.parse(fs.readFileSync(inPath, "utf8"));

const mainFeatures = [];
const noDataFeatures = [];

for (const f of gj.features) {
  const p = f.properties;
  const rawCode = p.N03_007;
  if (!rawCode) continue;

  if (NO_DATA_CODES.has(rawCode)) {
    noDataFeatures.push({
      type: "Feature",
      properties: { code: rawCode, name: p.N03_004 || p.N03_003 || "" },
      geometry: f.geometry,
    });
    continue;
  }

  let code = rawCode;
  let name = p.N03_004;
  if (SAPPORO_WARD_CODES.has(rawCode)) {
    code = SAPPORO_CODE;
    name = SAPPORO_NAME;
  }

  mainFeatures.push({
    type: "Feature",
    properties: { code, name },
    geometry: f.geometry,
  });
}

fs.writeFileSync(outMainPath, JSON.stringify({ type: "FeatureCollection", features: mainFeatures }));
fs.writeFileSync(outNoDataPath, JSON.stringify({ type: "FeatureCollection", features: noDataFeatures }));

console.log("main features:", mainFeatures.length);
console.log("no-data (北方領土) features:", noDataFeatures.length);
