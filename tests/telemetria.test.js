// Pruebas de la instrumentación OpenTelemetry (RF-04):
// verifica que se generen trazas de SQLite, métricas por endpoint
// y logs estructurados, usando exportadores en memoria.
const path = require("path");
const fs = require("fs");
const os = require("os");
const { trace, metrics, logs, context } = require("@opentelemetry/api");
const { AsyncLocalStorageContextManager } = require("@opentelemetry/context-async-hooks");
const { TracerProvider, SimpleSpanProcessor, InMemorySpanExporter } = require("@opentelemetry/sdk-trace");
const { MeterProvider, MetricReader } = require("@opentelemetry/sdk-metrics");
const { LoggerProvider, SimpleLogRecordProcessor, InMemoryLogRecordExporter } = require("@opentelemetry/sdk-logs");

// Lector de métricas manual (bajo demanda)
class LectorManual extends MetricReader {
  async onForceFlush() {}
  async onShutdown() {}
}

const spans = new InMemorySpanExporter();
const registros = new InMemoryLogRecordExporter();
const lector = new LectorManual();

context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
trace.setGlobalTracerProvider(new TracerProvider({ spanProcessors: [new SimpleSpanProcessor({ exporter: spans })] }));
metrics.setGlobalMeterProvider(new MeterProvider({ readers: [lector] }));
logs.setGlobalLoggerProvider(new LoggerProvider({ processors: [new SimpleLogRecordProcessor({ exporter: registros })] }));

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "webapp-otel-"));
process.env.DB_PATH = path.join(TMP_DIR, "test.db");
process.env.BACKUP_DIR = path.join(TMP_DIR, "backups");

const request = require("supertest");
const app = require("../app");
const { db } = require("../db");

async function metricasPorNombre() {
  const { resourceMetrics } = await lector.collect();
  const todas = resourceMetrics.scopeMetrics.flatMap((s) => s.metrics);
  return Object.fromEntries(todas.map((m) => [m.descriptor.name, m]));
}

beforeEach(() => {
  spans.reset();
  registros.reset();
});

afterAll(() => {
  db.close();
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

describe("OpenTelemetry - trazas de base de datos", () => {
  test("OTEL-1: un SELECT genera un span 'SQLite SELECT' con la consulta", async () => {
    await request(app).get("/api/productos");
    const span = spans.getFinishedSpans().find((s) => s.name.startsWith("SQLite SELECT"));
    expect(span).toBeDefined();
    expect(span.attributes["db.system.name"]).toBe("sqlite");
    expect(span.attributes["db.query.text"]).toContain("FROM productos");
    expect(span.attributes["db.response.returned_rows"]).toBeGreaterThanOrEqual(0);
  });

  test("OTEL-2: un INSERT registra las filas afectadas", async () => {
    await request(app).post("/api/productos").send({ nombre: "Traza" });
    const span = spans.getFinishedSpans().find((s) => s.name === "SQLite INSERT productos");
    expect(span.attributes["db.response.affected_rows"]).toBe(1);
  });

  test("OTEL-3: un error de SQLite queda marcado en el span", () => {
    db.prepare("INSERT INTO categorias (nombre) VALUES (?)").run("Duplicada");
    expect(() => db.prepare("INSERT INTO categorias (nombre) VALUES (?)").run("Duplicada")).toThrow();
    const fallido = spans.getFinishedSpans().filter((s) => s.name === "SQLite INSERT categorias").pop();
    expect(fallido.status.code).toBe(2); // SpanStatusCode.ERROR
    expect(fallido.events[0].name).toBe("exception");
  });
});

describe("OpenTelemetry - métricas por endpoint", () => {
  test("OTEL-4: cuenta peticiones, latencia y errores con ruta y statusCode", async () => {
    await request(app).get("/api/categorias");
    await request(app).get("/api/productos/999999");
    const m = await metricasPorNombre();

    const puntos = m.http_peticiones_total.dataPoints;
    const ok = puntos.find((p) => p.attributes["http.route"] === "/api/categorias");
    expect(ok.attributes["http.response.status_code"]).toBe(200);
    expect(ok.value).toBeGreaterThanOrEqual(1);

    expect(m.http_latencia_ms.dataPoints.length).toBeGreaterThan(0);
    const err = m.http_errores_total.dataPoints.find((p) => p.attributes["http.route"] === "/api/productos/:id");
    expect(err.attributes["error.type"]).toBe("4xx");
  });
});

describe("OpenTelemetry - logs estructurados y excepciones", () => {
  test("OTEL-5: cada petición emite un log con método, ruta, status y duración", async () => {
    await request(app).get("/api/categorias");
    const log = registros.getFinishedLogRecords().find((r) => r.attributes.tipo === "peticion_http");
    expect(log.severityText).toBe("INFO");
    expect(log.attributes).toMatchObject({ metodo: "GET", ruta: "/api/categorias", status_code: 200 });
    expect(log.attributes.duracion_ms).toBeGreaterThanOrEqual(0);
    expect(log.attributes.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test("OTEL-6: /api/simular-error responde 500 y registra la excepción", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    const res = await request(app).get("/api/simular-error");
    spy.mockRestore();
    expect(res.statusCode).toBe(500);
    const exc = registros.getFinishedLogRecords().find((r) => r.attributes.tipo === "excepcion");
    expect(exc.severityText).toBe("ERROR");
    expect(exc.attributes["exception.message"]).toContain("Error simulado");
    const http = registros.getFinishedLogRecords().find((r) => r.attributes.tipo === "peticion_http");
    expect(http.severityText).toBe("ERROR");
  });

  test("OTEL-7: /api/simular-lento respeta el tiempo pedido", async () => {
    const res = await request(app).get("/api/simular-lento?ms=50");
    expect(res.body.data.esperado_ms).toBe(50);
  });

  test("OTEL-8: un 404 se registra como WARN y el healthcheck no genera log", async () => {
    await request(app).get("/api/no-existe");
    await request(app).get("/api/health");
    const recs = registros.getFinishedLogRecords();
    expect(recs).toHaveLength(1);
    expect(recs[0].severityText).toBe("WARN");
    expect(recs[0].attributes.ruta).toBe("ruta_no_encontrada");
  });
});
