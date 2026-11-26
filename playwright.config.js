// Configuración de Playwright: pruebas E2E del frontend y del API.
// Levanta el servidor real (node server.js) con una base de datos temporal,
// así las pruebas nunca tocan los datos de producción.
const { defineConfig, devices } = require("@playwright/test");
const os = require("os");
const path = require("path");

const PORT = Number(process.env.E2E_PORT) || 3100;
const DB_PATH = path.join(os.tmpdir(), `webapp-e2e-${Date.now()}.db`);

module.exports = defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // comparten la misma BD: se ejecutan en orden
  workers: 1,
  retries: 0,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
    ["json", { outputFile: "playwright-report/resultados.json" }],
  ],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Permite usar un Chrome ya instalado (opcional, solo local)
        launchOptions: process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {},
      },
    },
  ],
  webServer: {
    command: "node server.js",
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      PORT: String(PORT),
      SOCKET_PORT: String(PORT + 1),
      DB_PATH,
      GIT_SHA: process.env.GITHUB_SHA || "e2e-local",
    },
  },
});
