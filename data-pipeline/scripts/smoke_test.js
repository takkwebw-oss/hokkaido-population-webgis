const { chromium } = require("playwright");
const path = require("path");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push("pageerror: " + err.message));

  await page.goto("http://localhost:5175", { waitUntil: "networkidle" });
  await page.waitForSelector("#year-number");
  await page.waitForTimeout(2000); // マップタイル・データ読み込み待ち

  const screenshotDir = path.join(__dirname, "..", "output", "screenshots");
  require("fs").mkdirSync(screenshotDir, { recursive: true });
  await page.screenshot({ path: path.join(screenshotDir, "01_initial.png") });

  const yearBefore = await page.textContent("#year-number");
  console.log("初期年:", yearBefore);

  // 市町村をクリックしてinfo-panel表示を確認 (地図中央付近をクリック)
  await page.mouse.click(640, 420);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(screenshotDir, "02_click.png") });
  const openPanelCount = await page.locator(".info-panel").count();
  console.log("クリック後に開いているパネル数:", openPanelCount);
  const infoNames = await page.locator(".info-panel .info-name").allTextContents();
  console.log("開いているパネルの市町村名一覧:", infoNames);

  // スライダーを1970年あたりに動かす
  await page.evaluate(() => {
    const slider = document.getElementById("year-slider");
    slider.value = 1970;
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(screenshotDir, "03_slider_1970.png") });
  const year1970 = await page.textContent("#year-number");
  console.log("スライダー操作後の年:", year1970);
  const info1970 = await page.locator(".info-panel .info-population").first().textContent().catch(() => null);
  console.log("1970年の(1つ目のパネルの)人口表示:", info1970);

  // 再生ボタンを押して数秒待つ
  await page.click("#play-btn");
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(screenshotDir, "04_playing.png") });
  const yearAfterPlay = await page.textContent("#year-number");
  console.log("再生3秒後の年:", yearAfterPlay);

  console.log("\nコンソールエラー件数:", errors.length);
  errors.forEach((e) => console.log("ERROR:", e));

  await browser.close();
})();
