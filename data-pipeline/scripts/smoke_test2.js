const { chromium } = require("playwright");
const path = require("path");

(async () => {
  const browser = await chromium.launch();
  const dir = path.join(__dirname, "..", "output", "screenshots");

  // 増減モード + 北方領土クリック (PC幅)
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto("http://localhost:5175", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await page.selectOption("#mode-select", "peakRatio");
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(dir, "06_diffmode.png") });

    console.log("diffmode errors:", errors.length, errors);
    await page.close();
  }

  // スマホ幅
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto("http://localhost:5175", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(dir, "08_mobile.png") });
    console.log("mobile errors:", errors.length, errors);
    await page.close();
  }

  await browser.close();
})();
