// 境界データ(コード+名称)と国勢調査年別人口(現市町村名で集約済み)を突き合わせ、
// 1920年〜2020年の年次人口(観測値は国勢調査年、それ以外は線形補間)を生成する。
const fs = require("fs");
const path = require("path");
const polylabel = require("polylabel").default;

// 簡易シューレース公式によるリング面積(比較用途のみ、単位は度^2で十分)
function ringArea(ring) {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum / 2);
}

// MultiPolygon/Polygonのうち最も面積の大きいポリゴンを選び、その中に収まる
// ラベル配置点(pole of inaccessibility)を1点だけ求める。
// (飛び地や岬が別リングになっているケースで、同名ラベルが複数出るのを防ぐ)
function computeLabelPoint(geometry) {
  const polygons = geometry.type === "MultiPolygon" ? geometry.coordinates : [geometry.coordinates];
  let best = null;
  let bestArea = -1;
  for (const rings of polygons) {
    const area = ringArea(rings[0]);
    if (area > bestArea) {
      bestArea = area;
      best = rings;
    }
  }
  return polylabel(best, 0.001);
}

const OUT_DIR = path.join(__dirname, "..", "output");
const PUBLIC_DIR = path.join(__dirname, "..", "..", "public", "data");

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function main() {
  const geo = loadJson(path.join(OUT_DIR, "municipalities.geojson"));
  const byYear = loadJson(path.join(OUT_DIR, "population_by_current_name.json"));

  const nameToCode = new Map();
  for (const f of geo.features) {
    nameToCode.set(f.properties.name, f.properties.code);
  }

  const censusYears = Object.keys(byYear).map(Number).sort((a, b) => a - b);

  // code -> { year -> population } (観測値のみ、この時点では補間前)
  const observedByCode = new Map();
  for (const f of geo.features) observedByCode.set(f.properties.code, new Map());

  for (const year of censusYears) {
    const entries = byYear[year];
    for (const [name, rec] of Object.entries(entries)) {
      const code = nameToCode.get(name);
      if (!code) {
        console.warn(`警告: ${year}年 の「${name}」に対応する市町村コードが見つかりません`);
        continue;
      }
      observedByCode.get(code).set(year, rec.total);
    }
  }

  // 各市町村の「観測がある年」の範囲内だけを線形補間する。
  // 観測開始年より前は、当時その市町村がまだ独立した自治体として
  // 存在しなかった(村の分立前等)ケースが含まれるため、data無しとして扱う。
  const firstYear = censusYears[0];
  const lastYear = censusYears[censusYears.length - 1];
  const allYears = [];
  for (let y = firstYear; y <= lastYear; y++) allYears.push(y);

  const municipalities = {};
  let globalMin = Infinity;
  let globalMax = -Infinity;

  for (const f of geo.features) {
    const code = f.properties.code;
    const name = f.properties.name;
    const observed = observedByCode.get(code);
    const availableYears = censusYears.filter((y) => observed.has(y));
    if (availableYears.length === 0) {
      console.warn(`警告: ${name}(${code}) は観測値が1件もありません`);
      continue;
    }
    const startYear = availableYears[0];
    const endYear = availableYears[availableYears.length - 1];

    const series = {};
    for (const y of allYears) {
      if (y < startYear || y > endYear) continue; // 自治体成立前/データ範囲外

      if (observed.has(y)) {
        const v = observed.get(y);
        series[y] = { v, t: "o" }; // observed
        globalMin = Math.min(globalMin, v);
        globalMax = Math.max(globalMax, v);
        continue;
      }

      // 前後の観測年を探して線形補間
      let prevY = null;
      let nextY = null;
      for (const ay of availableYears) {
        if (ay <= y) prevY = ay;
        if (ay >= y && nextY === null) nextY = ay;
      }
      if (prevY === null || nextY === null || prevY === nextY) continue;
      const prevV = observed.get(prevY);
      const nextV = observed.get(nextY);
      const ratio = (y - prevY) / (nextY - prevY);
      const v = prevV + (nextV - prevV) * ratio;
      series[y] = { v: Math.round(v), t: "i" }; // interpolated
      globalMin = Math.min(globalMin, v);
      globalMax = Math.max(globalMax, v);
    }

    const maxPop = Math.max(...availableYears.map((y) => observed.get(y)));
    const peakYear = availableYears.find((y) => observed.get(y) === maxPop);
    municipalities[code] = { name, series, maxPop, peakYear };
  }

  // 地図上に常時ラベルを出す市町村(人口上位20)。それ以外はホバー/クリックで表示。
  const LABEL_COUNT = 20;
  const labelCodes = new Set(
    Object.entries(municipalities)
      .sort((a, b) => b[1].maxPop - a[1].maxPop)
      .slice(0, LABEL_COUNT)
      .map(([code]) => code)
  );

  const dataset = {
    meta: {
      years: allYears,
      censusYears,
      minPopulation: Math.round(globalMin),
      maxPopulation: Math.round(globalMax),
      source: "北海道庁「北海道現住人口」大正9年〜令和2年、国勢調査(総数)。現在の市町村単位に組み替え済みの原資料に基づく。",
      note: "国勢調査実施年以外は前後の観測値による線形補間値。市町村がまだ分立していない期間はデータなし。",
    },
    municipalities,
  };

  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  fs.writeFileSync(path.join(PUBLIC_DIR, "population.json"), JSON.stringify(dataset));

  // 境界データをpublicへコピー。MapLibreのfeature-state機能を使うため
  // 各featureのトップレベルに数値idを付与する(id=市町村コードの数値化)。
  const geoOut = {
    type: "FeatureCollection",
    features: geo.features.map((f) => ({
      ...f,
      id: Number(f.properties.code),
      properties: {
        ...f.properties,
        labelCandidate: labelCodes.has(f.properties.code),
      },
    })),
  };
  fs.writeFileSync(path.join(PUBLIC_DIR, "municipalities.geojson"), JSON.stringify(geoOut));
  fs.copyFileSync(
    path.join(OUT_DIR, "no_data_area.geojson"),
    path.join(PUBLIC_DIR, "no_data_area.geojson")
  );

  // ラベル用の代表点(市町村ごとに1点)を生成
  const labelPoints = {
    type: "FeatureCollection",
    features: geoOut.features
      .filter((f) => f.properties.labelCandidate)
      .map((f) => ({
        type: "Feature",
        id: f.id,
        properties: { code: f.properties.code, name: f.properties.name },
        geometry: { type: "Point", coordinates: computeLabelPoint(f.geometry) },
      })),
  };
  fs.writeFileSync(path.join(PUBLIC_DIR, "label_points.geojson"), JSON.stringify(labelPoints));

  console.log("市町村数:", Object.keys(municipalities).length);
  console.log("年範囲:", firstYear, "-", lastYear);
  console.log("人口レンジ:", dataset.meta.minPopulation, "-", dataset.meta.maxPopulation);
  console.log("出力:", path.join(PUBLIC_DIR, "population.json"));
}

main();
