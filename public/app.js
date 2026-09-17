// 北海道 市町村別人口推移 WebGIS (デモ)
// データ: ./data/municipalities.geojson, ./data/no_data_area.geojson, ./data/population.json

const POP_COLOR_STOPS = [
  [700, "#ffffcc"],
  [2000, "#ffeda0"],
  [6000, "#fed976"],
  [18000, "#feb24c"],
  [55000, "#fd8d3c"],
  [170000, "#fc4e2a"],
  [500000, "#e31a1c"],
  [2000000, "#b10026"],
];

const DIFF_COLOR_STOPS = [
  [-20000, "#08306b"],
  [-3000, "#4292c6"],
  [-200, "#c6dbef"],
  [0, "#f0f0f0"],
  [200, "#fcbba1"],
  [3000, "#ef3b2c"],
  [20000, "#67000d"],
];

// ピーク比(その市町村自身の過去最大人口を100とした現在の残存率)。
// 都市規模に関係なく「どれだけ空洞化したか」を示すための指標。
const PEAK_RATIO_COLOR_STOPS = [
  [0, "#3a0000"],
  [15, "#7a1414"],
  [30, "#c0392b"],
  [50, "#e07b39"],
  [70, "#e8d06a"],
  [85, "#bcdca0"],
  [100, "#7fbf8f"],
];

const NO_DATA_COLOR = "#3a4048";

// 北海道の人口推移を特徴づける時代区分(道全体の歴史に基づく大まかな目安)。
// 年境界・呼称は目安であり、市町村ごとの実態とは前後する。
// speedMul は「おすすめ」再生モードでの速度倍率。人口減少ストーリー上の重要度が高く
// じっくり見てほしい年代(炭鉱閉山が始まるエネルギー革命期、都市集中が進む時期、
// バブル崩壊以降の反転・常態化)は遅く、それ以外の変化の乏しい年代は速く進める。
const ERAS = [
  { start: 1920, end: 1944, label: "戦前期", color: "#3b4a5a", speedMul: 3.0 },
  { start: 1945, end: 1949, label: "戦後引揚げ・ベビーブーム", color: "#4d6a8a", speedMul: 0.9 },
  { start: 1950, end: 1964, label: "高度成長前期", color: "#3d8a6b", speedMul: 1.3 },
  { start: 1965, end: 1974, label: "エネルギー革命・産業構造転換", color: "#b08a2e", speedMul: 0.6 },
  { start: 1975, end: 1985, label: "札幌一極集中の本格化", color: "#c06a2e", speedMul: 0.8 },
  { start: 1986, end: 1991, label: "バブル経済期", color: "#c23b3b", speedMul: 1.2 },
  { start: 1992, end: 1999, label: "バブル崩壊・拓銀破綻", color: "#7a3b8a", speedMul: 0.6 },
  { start: 2000, end: 2006, label: "平成の大合併", color: "#4b4b8a", speedMul: 1.0 },
  { start: 2007, end: 2020, label: "人口減少・少子高齢化の常態化", color: "#2f3a4a", speedMul: 0.7 },
];

// year は表示中の整数年(floor済み)を渡す想定
function eraAt(year) {
  return ERAS.find((e) => year >= e.start && year <= e.end) || null;
}

function buildFillColorExpression(stops, feedKey) {
  const expr = ["interpolate", ["linear"], ["feature-state", feedKey]];
  for (const [v, c] of stops) {
    expr.push(v, c);
  }
  return [
    "case",
    ["==", ["feature-state", "hasData"], false], NO_DATA_COLOR,
    expr,
  ];
}

function formatNumber(n) {
  return n.toLocaleString("ja-JP");
}

// Catmull-Rom スプラインでなめらかな折れ線パスを作る
function smoothPath(points) {
  if (points.length < 2) return "";
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
  }
  return d;
}

// {year: value} の系列から、SVG折れ線グラフ(曲線)と現在地マーカー用の
// 座標変換関数を作る。全体推移の中での「いまの位置」を見せるための簡易チャート。
function buildSparkline(seriesByYear, { width = 240, height = 52, padTop = 6, padBottom = 6 }) {
  const years = Object.keys(seriesByYear).map(Number).sort((a, b) => a - b);
  if (years.length < 2) return null;
  const values = years.map((y) => seriesByYear[y]);
  const minYear = years[0];
  const maxYear = years[years.length - 1];
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const spanV = maxV - minV || 1;

  const xScale = (year) => ((year - minYear) / (maxYear - minYear)) * width;
  const yScale = (v) => height - padBottom - ((v - minV) / spanV) * (height - padTop - padBottom);

  const pts = years.map((y) => [xScale(y), yScale(seriesByYear[y])]);
  const lineD = smoothPath(pts);
  const areaD = `${lineD} L${xScale(maxYear)},${height} L${xScale(minYear)},${height} Z`;

  return { lineD, areaD, xScale, yScale, minYear, maxYear, height, years, seriesByYear };
}

// rootEl は .spark-line 等を子孫に持つ要素(svg本体、またはそれを含むパネル)。
// 総人口グラフ・各市町村の詳細パネル(複数存在しうる)のどちらからも同じ関数を使い回す。
function renderSparkline(rootEl, spark) {
  const line = rootEl.querySelector(".spark-line");
  if (!spark) {
    line.setAttribute("d", "");
    return;
  }
  line.setAttribute("d", spark.lineD);
}

function renderPlainArea(rootEl, spark) {
  const area = rootEl.querySelector(".spark-area");
  area.setAttribute("d", spark ? spark.areaD : "");
}

// 時代区分ごとに色分けしたエリアを塗る(北海道総人口グラフ専用)。
// 区間の境界年を共有点として含めることで、隣接する帯同士に隙間ができないようにする。
function renderEraAreas(rootEl, spark) {
  const g = rootEl.querySelector(".spark-era-areas");
  g.innerHTML = "";
  if (!spark) return;
  const years = spark.years;
  for (const era of ERAS) {
    const idxInRange = [];
    years.forEach((y, i) => { if (y >= era.start && y <= era.end) idxInRange.push(i); });
    if (idxInRange.length === 0) continue;
    const startIdx = idxInRange[0];
    const endIdx = Math.min(idxInRange[idxInRange.length - 1] + 1, years.length - 1); // 次の年を1点含めて継ぎ目をなくす
    const segYears = years.slice(startIdx, endIdx + 1);
    if (segYears.length < 2) continue;
    const pts = segYears.map((y) => [spark.xScale(y), spark.yScale(spark.seriesByYear[y])]);
    let d = `M${pts[0][0]},${spark.height} `;
    d += pts.map((p) => `L${p[0]},${p[1]}`).join(" ");
    d += ` L${pts[pts.length - 1][0]},${spark.height} Z`;
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    path.setAttribute("fill", era.color);
    path.setAttribute("fill-opacity", "0.45");
    g.appendChild(path);
  }
}

function updateSparkCursor(rootEl, spark, year, value, visible = true) {
  const cursor = rootEl.querySelector(".spark-cursor");
  const dot = rootEl.querySelector(".spark-dot");
  if (!spark || !visible) {
    cursor.style.opacity = 0;
    dot.style.opacity = 0;
    return;
  }
  const x = spark.xScale(Math.min(spark.maxYear, Math.max(spark.minYear, year)));
  cursor.setAttribute("x1", x);
  cursor.setAttribute("x2", x);
  cursor.style.opacity = 1;
  dot.setAttribute("cx", x);
  dot.setAttribute("cy", spark.yScale(value));
  dot.style.opacity = 1;
}

async function main() {
  const [muniGeo, noDataGeo, labelGeo, population] = await Promise.all([
    fetch("data/municipalities.geojson").then((r) => r.json()),
    fetch("data/no_data_area.geojson").then((r) => r.json()),
    fetch("data/label_points.geojson").then((r) => r.json()),
    fetch("data/population.json").then((r) => r.json()),
  ]);

  const meta = population.meta;
  const municipalities = population.municipalities; // code(5桁文字列) -> {name, series, maxPop}

  const state = {
    year: meta.years[0], // 表示中の年(小数を含む連続値)
    minYear: meta.years[0],
    maxYear: meta.years[meta.years.length - 1],
    playing: false,
    rafId: null,
    lastTs: null,
    speedMode: "auto", // "auto" | 数値(年/秒)
    colorMode: "diff", // "population" | "diff" | "peakRatio"
    openPanels: new Map(), // code -> { el, spark }
  };

  function getYearRecord(code, year) {
    const m = municipalities[code];
    if (!m) return null;
    return m.series[year] || null;
  }

  // 北海道全体の年別合計(整数年ごと、静的)。折れ線チャートの背景カーブに使う。
  const totalSeriesByYear = {};
  for (let y = state.minYear; y <= state.maxYear; y++) {
    let sum = 0;
    for (const code in municipalities) {
      const rec = municipalities[code].series[y];
      if (rec) sum += rec.v;
    }
    totalSeriesByYear[y] = sum;
  }
  const totalSpark = buildSparkline(totalSeriesByYear, {});
  const totalSparkEl = document.getElementById("total-spark");
  renderSparkline(totalSparkEl, totalSpark);
  renderEraAreas(totalSparkEl, totalSpark);

  // 年代区分バー + キャプションの構築(区間ごとの帯・ラベル + 現在地マーカー)。
  // 年スライダーはこの上に透明で重ねて操作を一体化する(CSS側で position:absolute)。
  const eraBandEl = document.getElementById("era-band");
  const eraCaptionsEl = document.getElementById("era-captions");
  const totalSpan = state.maxYear - state.minYear;
  const eraSegmentEls = [];
  const eraCaptionEls = [];
  for (const era of ERAS) {
    const from = Math.max(era.start, state.minYear);
    const to = Math.min(era.end, state.maxYear);
    if (from > to) continue;
    const leftPct = ((from - state.minYear) / totalSpan) * 100;
    const widthPct = ((to - from + 1) / totalSpan) * 100;

    const seg = document.createElement("div");
    seg.className = "era-segment";
    seg.style.background = era.color;
    seg.style.flex = `${to - from + 1} 0 0`;
    seg.title = `${era.label}(${from}〜${to}年)`;
    eraBandEl.appendChild(seg);
    eraSegmentEls.push({ era, el: seg });

    const cap = document.createElement("div");
    cap.className = "era-caption";
    cap.style.left = `${leftPct}%`;
    cap.style.width = `${widthPct}%`;
    cap.textContent = era.label;
    cap.title = `${era.label}(${from}〜${to}年)`;
    eraCaptionsEl.appendChild(cap);
    eraCaptionEls.push({ era, el: cap });
  }
  const eraBandMarker = document.createElement("div");
  eraBandMarker.id = "era-band-marker";
  eraBandEl.appendChild(eraBandMarker);

  let activeEra = null;
  function updateEraDisplay(year) {
    const displayYear = Math.floor(year);
    const era = eraAt(displayYear);
    if (era !== activeEra) {
      activeEra = era;
      for (const { era: e, el } of eraSegmentEls) el.classList.toggle("active", e === era);
      for (const { era: e, el } of eraCaptionEls) el.classList.toggle("active", e === era);
    }
    const ratio = (year - state.minYear) / totalSpan;
    eraBandMarker.style.left = `${Math.min(100, Math.max(0, ratio * 100))}%`;
  }

  // 「今まさに人が少なく、しかも減り続けている」市町村をワーストN表示する。
  // ピーク比だけだと「元々大きかった町の凋落」ばかりが浮き彫りになり、
  // 元々小規模で過疎が進む村が埋もれてしまうため、
  //   ・現在の絶対人口が少ない順の順位
  //   ・直近LOOKBACK年の年平均人口変化率が低い(減少が速い)順の順位
  // を合算した複合スコア(小さいほど「ヤバい」)でランキングする。
  // 整数年が変わったときだけDOMを再構築する(毎フレーム再描画すると無駄が多いため)。
  const RANKING_COUNT = 15;
  const RANKING_LOOKBACK = 20;
  const RANKING_MIN_LOOKBACK = 15; // データ開始直後は十分な期間が取れないため対象外にする
  const rankingListEl = document.getElementById("ranking-list");
  let lastRankingYear = null;

  // 複合スコア(現在人口の少なさ順位 + 直近の減少ペース順位)で「ヤバさ」順に並べたリストを作る。
  function computeWorstList(displayYear) {
    const pastYear = Math.max(state.minYear, displayYear - RANKING_LOOKBACK);
    const actualLookback = displayYear - pastYear;

    const base = [];
    if (actualLookback >= RANKING_MIN_LOOKBACK) {
      for (const code in municipalities) {
        const cur = sampleValue(code, displayYear);
        const past = sampleValue(code, pastYear);
        if (!cur.hasData || !past.hasData || past.v <= 0) continue;
        const cagr = Math.pow(cur.v / past.v, 1 / actualLookback) - 1;
        if (cagr >= 0) continue; // 減少中の市町村のみ対象
        base.push({ code, name: municipalities[code].name, cur: cur.v, cagr });
      }
    }

    if (base.length > 0) {
      const bySmall = [...base].sort((a, b) => a.cur - b.cur);
      bySmall.forEach((r, i) => (r.rankSmall = i));
      const byDecline = [...base].sort((a, b) => a.cagr - b.cagr);
      byDecline.forEach((r, i) => (r.rankDecline = i));
      base.forEach((r) => (r.score = r.rankSmall + r.rankDecline));
      base.sort((a, b) => a.score - b.score);
    }
    return base;
  }

  // ランキングの入れ替わりが視覚的にわかるよう、FLIP法で並び替えをスライドアニメーションさせ、
  // 新規に入ってきた市町村は一瞬光らせる。整数年が変わったときだけ実行する。
  function renderRankingList(worst) {
    const oldRects = new Map();
    rankingListEl.querySelectorAll("li[data-code]").forEach((li) => {
      oldRects.set(li.dataset.code, li.getBoundingClientRect());
    });

    rankingListEl.innerHTML = "";
    if (worst.length === 0) {
      const li = document.createElement("li");
      li.className = "ranking-empty";
      li.textContent = "この年代はまだ大きな減少なし";
      rankingListEl.appendChild(li);
      return;
    }
    worst.forEach((entry, i) => {
      const li = document.createElement("li");
      li.dataset.code = entry.code;
      li.innerHTML = `<span class="rank-no">${i + 1}</span><span class="rank-name">${entry.name}</span><span class="rank-ratio">${formatNumber(entry.cur)}人</span>`;
      li.title = `${entry.name}: 現在${formatNumber(entry.cur)}人(直近${RANKING_LOOKBACK}年 年率${(entry.cagr * 100).toFixed(1)}%)`;
      if (state.openPanels.has(entry.code)) li.classList.add("rank-selected");
      li.addEventListener("click", () => togglePanel(entry.code));
      rankingListEl.appendChild(li);
    });

    requestAnimationFrame(() => {
      rankingListEl.querySelectorAll("li[data-code]").forEach((li) => {
        const code = li.dataset.code;
        if (oldRects.has(code)) {
          const oldRect = oldRects.get(code);
          const newRect = li.getBoundingClientRect();
          const deltaY = oldRect.top - newRect.top;
          if (deltaY) {
            li.style.transition = "none";
            li.style.transform = `translateY(${deltaY}px)`;
            li.getBoundingClientRect(); // 強制リフロー
            li.style.transition = "";
            li.style.transform = "";
          }
        } else {
          li.classList.add("rank-flash");
          setTimeout(() => li.classList.remove("rank-flash"), 900);
        }
      });
    });
  }

  function updateRanking(displayYear) {
    if (displayYear === lastRankingYear) return;
    lastRankingYear = displayYear;
    renderRankingList(computeWorstList(displayYear).slice(0, RANKING_COUNT));
  }

  function updateRankingSelectedHighlight() {
    rankingListEl.querySelectorAll("li[data-code]").forEach((li) => {
      li.classList.toggle("rank-selected", state.openPanels.has(li.dataset.code));
    });
  }

  // yearは小数可。前後の整数年の観測/補間値をさらに線形補間し、
  // アニメーション中も色・数値がなめらかに連続変化するようにする。
  function sampleValue(code, year) {
    const m = municipalities[code];
    if (!m) return { hasData: false, v: 0, t: null };
    const floorY = Math.floor(year);
    const ceilY = Math.min(floorY + 1, state.maxYear);
    const fRec = m.series[floorY];
    const cRec = m.series[ceilY];
    if (!fRec && !cRec) return { hasData: false, v: 0, t: null };
    if (!fRec) return { hasData: true, v: cRec.v, t: cRec.t };
    if (!cRec || floorY === ceilY) return { hasData: true, v: fRec.v, t: fRec.t };
    const frac = year - floorY;
    const v = fRec.v + (cRec.v - fRec.v) * frac;
    return { hasData: true, v, t: frac < 1e-6 ? fRec.t : "i" };
  }

  const map = new maplibregl.Map({
    container: "map",
    style: {
      version: 8,
      glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf",
      sources: {},
      layers: [
        { id: "bg", type: "background", paint: { "background-color": "#0b2740" } },
      ],
    },
    center: [142.8, 43.4],
    zoom: 5.9,
    minZoom: 4.5,
    maxZoom: 10,
    attributionControl: false,
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

  map.on("load", () => {
    map.addSource("muni", { type: "geojson", data: muniGeo, promoteId: undefined });
    map.addSource("nodata", { type: "geojson", data: noDataGeo });
    map.addSource("labels", { type: "geojson", data: labelGeo });

    map.addLayer({
      id: "nodata-fill",
      type: "fill",
      source: "nodata",
      paint: { "fill-color": NO_DATA_COLOR, "fill-opacity": 0.45 },
    });
    map.addLayer({
      id: "nodata-outline",
      type: "line",
      source: "nodata",
      paint: { "line-color": "#5a6270", "line-width": 0.6, "line-dasharray": [2, 2] },
    });

    map.addLayer({
      id: "muni-fill",
      type: "fill",
      source: "muni",
      paint: {
        "fill-color": buildFillColorExpression(POP_COLOR_STOPS, "population"),
        "fill-opacity": 0.92,
        "fill-color-transition": { duration: 80, delay: 0 },
      },
    });
    map.addLayer({
      id: "muni-outline",
      type: "line",
      source: "muni",
      paint: {
        "line-color": "#0b1116",
        "line-width": 0.6,
      },
    });
    map.addLayer({
      id: "muni-outline-hover",
      type: "line",
      source: "muni",
      paint: { "line-color": "#ffffff", "line-width": 2 },
      filter: ["==", ["get", "code"], "__none__"],
    });
    // 詳細パネルのグラフをクリックしたときに、その市町村だけを一瞬強調する専用レイヤー
    map.addLayer({
      id: "muni-spotlight",
      type: "line",
      source: "muni",
      paint: {
        "line-color": "#ffe082",
        "line-width": 4,
        "line-opacity": 0,
        "line-opacity-transition": { duration: 220 },
      },
      filter: ["==", ["get", "code"], "__none__"],
    });

    map.addLayer({
      id: "muni-labels",
      type: "symbol",
      source: "labels",
      layout: {
        "text-field": ["get", "name"],
        "text-size": 11,
        "text-font": ["Noto Sans Regular"],
        "text-variable-anchor": ["top"],
        "text-radial-offset": 0.2,
        "text-allow-overlap": false,
      },
      paint: {
        "text-color": "#ffffff",
        "text-halo-color": "#000000",
        "text-halo-width": 1.2,
      },
    });

    initInteraction();
    applyColorMode();
    // スマホでは詳細パネルが画面の大半を占めて地図が見えなくなるため、
    // 起動時の自動オープンはPC/タブレット幅のみに限定する(タップしての表示は可能なまま)。
    if (!window.matchMedia("(max-width: 640px)").matches) openDefaultPanels();
    updateYear(state.year);
  });

  function setFeatureStateForYear(year) {
    const prevYear = Math.max(state.minYear, year - 1);
    let total = 0;
    for (const f of muniGeo.features) {
      const code = f.properties.code;
      const cur = sampleValue(code, year);
      const prev = year - 1 < state.minYear ? { hasData: false } : sampleValue(code, prevYear);
      const diff = cur.hasData && prev.hasData ? cur.v - prev.v : 0;
      const maxPop = municipalities[code].maxPop;
      const peakRatio = cur.hasData && maxPop ? (cur.v / maxPop) * 100 : 0;
      if (cur.hasData) total += cur.v;
      map.setFeatureState(
        { source: "muni", id: f.id },
        {
          hasData: cur.hasData,
          population: cur.hasData ? cur.v : 0,
          diff,
          peakRatio,
          obsType: cur.t,
        }
      );
    }
    return total;
  }

  function updateYear(year) {
    year = Math.min(state.maxYear, Math.max(state.minYear, year));
    state.year = year;
    const displayYear = Math.floor(year);
    document.getElementById("year-number").textContent = displayYear;
    document.getElementById("total-year-number").textContent = displayYear;
    document.getElementById("year-slider").value = displayYear;

    const total = setFeatureStateForYear(year);
    document.getElementById("total-number").textContent = formatNumber(Math.round(total)) + " 人";
    updateSparkCursor(totalSparkEl, totalSpark, year, total);
    updateEraDisplay(year);
    updateRanking(displayYear);

    renderAllPanels();
  }

  const LEGEND_TITLES = {
    population: "人口(人・対数スケール)",
    diff: "前年比増減(人)",
    peakRatio: "ピーク比(その町の過去最大人口=100%)",
  };

  function renderLegend() {
    const el = document.getElementById("legend-scale");
    document.querySelector(".legend-title").textContent = LEGEND_TITLES[state.colorMode];
    const stops =
      state.colorMode === "diff" ? DIFF_COLOR_STOPS :
      state.colorMode === "peakRatio" ? PEAK_RATIO_COLOR_STOPS :
      POP_COLOR_STOPS;
    el.innerHTML = "";
    const rows =
      state.colorMode === "diff" ? stops.map(([v, c]) => [c, (v > 0 ? "+" : "") + formatNumber(v)]) :
      state.colorMode === "peakRatio" ? stops.map(([v, c]) => [c, v + "%"]) :
      stops.map(([v, c]) => [c, formatNumber(v) + "人〜"]);
    for (const [color, label] of rows) {
      const row = document.createElement("div");
      row.className = "legend-row";
      row.innerHTML = `<span class="legend-swatch" style="background:${color}"></span><span class="legend-label">${label}</span>`;
      el.appendChild(row);
    }
  }

  function applyColorMode() {
    const stops =
      state.colorMode === "diff" ? DIFF_COLOR_STOPS :
      state.colorMode === "peakRatio" ? PEAK_RATIO_COLOR_STOPS :
      POP_COLOR_STOPS;
    const feedKey = state.colorMode === "diff" ? "diff" : state.colorMode === "peakRatio" ? "peakRatio" : "population";
    map.setPaintProperty("muni-fill", "fill-color", buildFillColorExpression(stops, feedKey));
    renderLegend();
  }

  // 詳細パネルは複数同時に開ける。state.openPanels(code -> {el, spark})で管理し、
  // 地図クリック・ランキングクリックのいずれも「追加」であって「差し替え」ではない。
  const infoPanelsEl = document.getElementById("info-panels");
  const infoPanelTemplate = document.getElementById("info-panel-template");

  function updateSelectionOutline() {
    const codes = [...state.openPanels.keys()];
    map.setFilter(
      "muni-outline-hover",
      codes.length === 0 ? ["==", ["get", "code"], "__none__"] : ["in", ["get", "code"], ["literal", codes]]
    );
  }

  function getMuniBounds(code) {
    const feature = muniGeo.features.find((f) => f.properties.code === code);
    if (!feature) return null;
    const bounds = new maplibregl.LngLatBounds();
    const polygons = feature.geometry.type === "MultiPolygon" ? feature.geometry.coordinates : [feature.geometry.coordinates];
    for (const rings of polygons) {
      for (const ring of rings) {
        for (const [lng, lat] of ring) bounds.extend([lng, lat]);
      }
    }
    return bounds;
  }

  // 詳細パネルのグラフをクリックしたときに、その市町村へ地図を寄せつつ
  // 数回点滅させて「これがどこにあるか」を一目でわかるようにする。
  function locateMunicipality(code) {
    const bounds = getMuniBounds(code);
    if (!bounds) return;
    map.fitBounds(bounds, { padding: 90, maxZoom: 9, duration: 900 });

    map.setFilter("muni-spotlight", ["==", ["get", "code"], code]);
    let step = 0;
    const totalSteps = 6; // 点灯・消灯を3回繰り返す
    const iv = setInterval(() => {
      map.setPaintProperty("muni-spotlight", "line-opacity", step % 2 === 0 ? 1 : 0);
      step++;
      if (step >= totalSteps) {
        clearInterval(iv);
        map.setFilter("muni-spotlight", ["==", ["get", "code"], "__none__"]);
      }
    }, 300);
  }

  function openPanel(code) {
    if (state.openPanels.has(code)) return; // 既に開いている
    const m = municipalities[code];
    if (!m) return;

    const frag = infoPanelTemplate.content.cloneNode(true);
    const el = frag.querySelector(".info-panel");
    el.dataset.code = code;
    infoPanelsEl.appendChild(el);

    const seriesByYear = {};
    for (const y in m.series) seriesByYear[y] = m.series[y].v;
    const spark = buildSparkline(seriesByYear, {});
    const sparkRoot = el.querySelector(".spark");
    renderSparkline(sparkRoot, spark);
    renderPlainArea(sparkRoot, spark);

    state.openPanels.set(code, { el, spark });
    renderPanel(code);
    updateSelectionOutline();
    updateRankingSelectedHighlight();
  }

  function closePanel(code) {
    const entry = state.openPanels.get(code);
    if (!entry) return;
    entry.el.remove();
    state.openPanels.delete(code);
    updateSelectionOutline();
    updateRankingSelectedHighlight();
  }

  // 地図・ランキングからのクリックはトグル(開いていれば閉じる)。
  // 起動時のデフォルト表示は openPanel() を直接呼んでトグルさせない。
  function togglePanel(code) {
    if (state.openPanels.has(code)) closePanel(code);
    else openPanel(code);
  }

  function renderPanel(code) {
    const entry = state.openPanels.get(code);
    if (!entry) return;
    const m = municipalities[code];
    const el = entry.el;
    const sparkRoot = el.querySelector(".spark");

    const rec = sampleValue(code, state.year);
    const hasPrev = state.year - 1 >= state.minYear;
    const prevRec = hasPrev ? sampleValue(code, Math.max(state.minYear, state.year - 1)) : { hasData: false };

    el.querySelector(".info-name").textContent = m.name;

    if (!rec.hasData) {
      el.querySelector(".info-population").textContent = "データなし";
      const diffEl = el.querySelector(".info-diff");
      diffEl.textContent = "この年はまだ自治体として存在しません";
      diffEl.className = "info-diff";
      el.querySelector(".info-type").textContent = "-";
      el.querySelector(".info-peak").textContent = "-";
      updateSparkCursor(sparkRoot, entry.spark, state.year, 0, false);
      return;
    }

    el.querySelector(".info-population").textContent = formatNumber(Math.round(rec.v)) + " 人";

    const diffEl = el.querySelector(".info-diff");
    if (prevRec.hasData) {
      const diff = Math.round(rec.v - prevRec.v);
      const sign = diff > 0 ? "+" : "";
      diffEl.textContent = `前年比 ${sign}${formatNumber(diff)} 人`;
      diffEl.className = "info-diff " + (diff > 0 ? "up" : diff < 0 ? "down" : "");
    } else {
      diffEl.textContent = "前年データなし";
      diffEl.className = "info-diff";
    }

    el.querySelector(".info-type").textContent =
      rec.t === "o" ? "実測値(国勢調査)" : "推計値(線形補間)";

    const ratio = m.maxPop ? Math.round((rec.v / m.maxPop) * 100) : null;
    el.querySelector(".info-peak").textContent =
      ratio !== null
        ? `ピーク: ${m.peakYear}年 ${formatNumber(m.maxPop)}人(現在はピーク比 ${ratio}%)`
        : "-";

    updateSparkCursor(sparkRoot, entry.spark, state.year, rec.v, true);
  }

  function renderAllPanels() {
    for (const code of state.openPanels.keys()) renderPanel(code);
  }

  function openNoDataPanel() {
    if (infoPanelsEl.querySelector('.info-panel[data-nodata="1"]')) return; // 二重表示防止
    const frag = infoPanelTemplate.content.cloneNode(true);
    const el = frag.querySelector(".info-panel");
    el.dataset.nodata = "1";
    el.querySelector(".info-name").textContent = "北方領土等";
    el.querySelector(".info-population").textContent = "データなし";
    const diffEl = el.querySelector(".info-diff");
    diffEl.textContent = "現在も日本の行政が及んでおらず、国勢調査人口が存在しない区域です";
    diffEl.className = "info-diff";
    el.querySelector(".info-type").textContent = "-";
    el.querySelector(".info-peak").textContent = "-";
    el.querySelector(".spark").remove();
    infoPanelsEl.appendChild(el);
  }

  // 起動時に「特にヤバい」市町村の詳細パネルをあらかじめ開いておく
  // (2020年時点の複合スコアで判定。年代を戻しても閉じずにそのまま推移を追える)。
  const DEFAULT_OPEN_COUNT = 3;
  function openDefaultPanels() {
    const defaults = computeWorstList(state.maxYear).slice(0, DEFAULT_OPEN_COUNT);
    for (const entry of defaults) openPanel(entry.code);
  }

  function initInteraction() {
    infoPanelsEl.addEventListener("click", (e) => {
      const closeBtn = e.target.closest(".info-close");
      if (closeBtn) {
        const panelEl = closeBtn.closest(".info-panel");
        const code = panelEl.dataset.code;
        if (code && state.openPanels.has(code)) closePanel(code);
        else panelEl.remove();
        return;
      }
      const spark = e.target.closest(".spark");
      if (spark) {
        const panelEl = spark.closest(".info-panel");
        const code = panelEl.dataset.code;
        if (code) locateMunicipality(code);
      }
    });

    map.on("mousemove", "muni-fill", (e) => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "muni-fill", () => {
      map.getCanvas().style.cursor = "";
    });

    map.on("click", "muni-fill", (e) => {
      togglePanel(e.features[0].properties.code);
    });

    map.on("click", "nodata-fill", () => {
      openNoDataPanel();
    });
  }

  // --- 再生コントロール ---
  const playBtn = document.getElementById("play-btn");
  const slider = document.getElementById("year-slider");
  const speedSelect = document.getElementById("speed-select");
  const modeSelect = document.getElementById("mode-select");

  slider.min = state.minYear;
  slider.max = state.maxYear;
  slider.value = state.minYear;

  function stopPlaying() {
    state.playing = false;
    playBtn.textContent = "▶";
    playBtn.classList.remove("playing");
    if (state.rafId) {
      cancelAnimationFrame(state.rafId);
      state.rafId = null;
    }
    state.lastTs = null;
  }

  const AUTO_BASE_SPEED = 1.5; // 「おすすめ」モードの基準速度(年/秒)。年代ごとのspeedMulを掛ける。

  function currentSpeedYearsPerSec() {
    if (state.speedMode !== "auto") return state.speedMode;
    const era = eraAt(Math.floor(state.year));
    return AUTO_BASE_SPEED * (era ? era.speedMul : 1);
  }

  function tick(ts) {
    if (!state.playing) return;
    if (state.lastTs === null) state.lastTs = ts;
    const dt = (ts - state.lastTs) / 1000;
    state.lastTs = ts;

    const next = state.year + dt * currentSpeedYearsPerSec();
    if (next >= state.maxYear) {
      updateYear(state.maxYear);
      stopPlaying();
      return;
    }
    updateYear(next);
    state.rafId = requestAnimationFrame(tick);
  }

  function startPlaying() {
    state.playing = true;
    state.lastTs = null;
    playBtn.textContent = "❚❚";
    playBtn.classList.add("playing");
    state.rafId = requestAnimationFrame(tick);
  }

  playBtn.addEventListener("click", () => {
    if (state.playing) {
      stopPlaying();
    } else {
      if (state.year >= state.maxYear) updateYear(state.minYear);
      startPlaying();
    }
  });

  slider.addEventListener("input", (e) => {
    stopPlaying();
    updateYear(Number(e.target.value));
  });

  speedSelect.addEventListener("change", (e) => {
    state.speedMode = e.target.value === "auto" ? "auto" : Number(e.target.value);
  });

  modeSelect.addEventListener("change", (e) => {
    state.colorMode = e.target.value;
    applyColorMode();
  });
}

main().catch((err) => {
  console.error(err);
  document.body.innerHTML =
    '<div style="color:#fff;padding:20px;font-family:sans-serif">データの読み込みに失敗しました。コンソールを確認してください。<br>' +
    String(err) + "</div>";
});
