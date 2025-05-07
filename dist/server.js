"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const playwright_extra_1 = require("playwright-extra");
const uuid_1 = require("uuid");
const cors_1 = __importDefault(require("cors"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
// ✅ Setup Express
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3004;
const SERVER_URL = process.env.SERVER_URL || `http://localhost:${PORT}`;
const railway_url = "https://backend-automation-production-badd.up.railway.app";
// ✅ Middleware
const allowedOrigins = [
    "http://localhost:3001",
    "https://automation-tools-drab.vercel.app",
];
app.use(express_1.default.json());
app.use((0, cors_1.default)({
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
}));
// ✅ Folder screenshot
const SCREENSHOT_DIR = path_1.default.join(process.cwd(), "public/screenshots");
if (!fs_1.default.existsSync(SCREENSHOT_DIR)) {
    fs_1.default.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}
app.use("/screenshots", express_1.default.static(SCREENSHOT_DIR));
console.log(`🖼️ Static files served from: ${SCREENSHOT_DIR}`);
// ✅ API endpoint utama
app.post("/api/run-automation", async (req, res) => {
    try {
        const { url, steps, headless } = req.body;
        if (!url || !steps) {
            return res.status(400).json({ status: "error", message: "Missing parameters" });
        }
        const sessionId = (0, uuid_1.v4)();
        const folderPath = path_1.default.join(SCREENSHOT_DIR, sessionId);
        fs_1.default.mkdirSync(folderPath, { recursive: true });
        const browser = await playwright_extra_1.chromium.launch({
            headless,
            args: [
                '--no-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage',
            ],
        });
        const context = await browser.newContext({
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36",
            viewport: { width: 1366, height: 768 },
            timezoneId: "Asia/Jakarta",
            locale: "en-US",
        });
        const page = await context.newPage();
        // ✅ Manual stealth anti-fingerprint
        await page.addInitScript(() => {
            window.chrome = { runtime: {} };
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
            Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
            const getContext = HTMLCanvasElement.prototype.getContext;
            HTMLCanvasElement.prototype.getContext = function (...args) {
                const context = getContext.apply(this, args);
                if (args[0] === '2d' && context) {
                    context.getImageData = function () {
                        throw new Error('Blocked for anti-fingerprint');
                    };
                }
                return context;
            };
        });
        const stepResults = [];
        try {
            await page.goto(url, { timeout: 30000 });
            await page.waitForTimeout(5000);
            for (let i = 0; i < steps.length; i++) {
                const { action, xpath, value } = steps[i];
                try {
                    switch (action) {
                        case "click":
                            await page.locator(`xpath=${xpath}`).click();
                            break;
                        case "fill":
                            await page.locator(`xpath=${xpath}`).fill(value || "");
                            break;
                        case "wait":
                            await page.waitForSelector(`xpath=${xpath}`, { timeout: parseInt(value || "5000") });
                            break;
                        case "validate":
                            await page.locator(`xpath=${xpath}`).textContent();
                            break;
                        case "assert-url":
                            await page.waitForURL(value || "");
                            break;
                        case "select":
                            await page.locator(`xpath=${xpath}`).selectOption({ label: value || "" });
                            break;
                        case "scroll":
                            await page.locator(`xpath=${xpath}`).scrollIntoViewIfNeeded();
                            break;
                        default:
                            throw new Error(`Unknown action: ${action}`);
                    }
                    const screenshotPath = path_1.default.join(folderPath, `step-${i + 1}.png`);
                    await page.screenshot({ path: screenshotPath });
                    stepResults.push({
                        action,
                        xpath,
                        value,
                        status: "sukses",
                        screenshotUrl: `${railway_url}/screenshots/${sessionId}/step-${i + 1}.png`,
                    });
                }
                catch (stepError) {
                    const errorMessage = stepError?.message || "Unknown error";
                    const screenshotPath = path_1.default.join(folderPath, `step-${i + 1}-error.png`);
                    await page.screenshot({ path: screenshotPath });
                    stepResults.push({
                        action,
                        xpath,
                        value,
                        status: "gagal",
                        error: errorMessage,
                        screenshotUrl: `${railway_url}/screenshots/${sessionId}/step-${i + 1}-error.png`,
                    });
                }
            }
            const resultHtml = `
        <html>
          <body>
            <h1>Automation Report</h1>
            <p>URL: ${url}</p>
            ${stepResults
                .map((step, index) => `
                <div>
                  <p><strong>Step ${index + 1}:</strong> ${step.action} - ${step.xpath} - 
                  <span style="color: ${step.status === "sukses" ? "green" : "red"};">${step.status}</span></p>
                  ${step.error ? `<p style="color: red;">Error: ${step.error}</p>` : ""}
                  <img src="${step.screenshotUrl}" width="300" />
                </div>
              `)
                .join("")}
          </body>
        </html>
      `;
            fs_1.default.writeFileSync(path_1.default.join(folderPath, "result.html"), resultHtml);
            res.json({
                status: "success",
                message: "Automation completed!",
                reportUrl: `${railway_url}/screenshots/${sessionId}/result.html`,
                stepResults,
            });
        }
        finally {
            await browser.close();
        }
    }
    catch (err) {
        res.status(500).json({ status: "error", message: err.message });
    }
});
// ✅ Run server
app.listen(PORT, () => {
    console.log(`🚀 Server running at ${SERVER_URL}`);
});
