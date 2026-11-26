// ─────────────────────────────────────────────────────────────
// Instrumentación OpenTelemetry (OTLP) → OpenObserve
//   · Trazas:  cada petición HTTP (Express) + consultas a SQLite
//   · Métricas: latencia, volumen y errores por endpoint (ver app.js)
//   · Logs:    eventos estructurados de operación y excepciones
//
// Se activa solo si existe OTEL_EXPORTER_OTLP_ENDPOINT (en la EC2).
// En local y en las pruebas no hace nada.
//   OTEL_EXPORTER_OTLP_ENDPOINT = http://openobserve:5080/api/default
//   OPENOBSERVE_AUTH            = credenciales Basic en base64
// Debe cargarse ANTES que express (primera línea de server.js).
// ─────────────────────────────────────────────────────────────
const ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

if (ENDPOINT) {
  const { NodeSDK } = require("@opentelemetry/sdk-node");
  const { resourceFromAttributes } = require("@opentelemetry/resources");
  const { OTLPTraceExporter } = require("@opentelemetry/exporter-trace-otlp-http");
  const { OTLPMetricExporter } = require("@opentelemetry/exporter-metrics-otlp-http");
  const { OTLPLogExporter } = require("@opentelemetry/exporter-logs-otlp-http");
  const { PeriodicExportingMetricReader } = require("@opentelemetry/sdk-metrics");
  const { BatchLogRecordProcessor } = require("@opentelemetry/sdk-logs");
  const { HttpInstrumentation } = require("@opentelemetry/instrumentation-http");
  const { ExpressInstrumentation } = require("@opentelemetry/instrumentation-express");

  const base = ENDPOINT.replace(/\/$/, "");
  const headers = process.env.OPENOBSERVE_AUTH
    ? { Authorization: `Basic ${process.env.OPENOBSERVE_AUTH}` }
    : {};

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      "service.name": process.env.OTEL_SERVICE_NAME || "webapp-inventario",
      "service.version": process.env.APP_VERSION || "1.0.0",
      "deployment.environment.name": process.env.NODE_ENV || "production",
      "vcs.ref.head.revision": process.env.GIT_SHA || "local",
    }),
    traceExporter: new OTLPTraceExporter({ url: `${base}/v1/traces`, headers }),
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({ url: `${base}/v1/metrics`, headers }),
        exportIntervalMillis: 15000,
      }),
    ],
    logRecordProcessors: [
      new BatchLogRecordProcessor({
        exporter: new OTLPLogExporter({ url: `${base}/v1/logs`, headers: { ...headers, "stream-name": "webapp" } }),
      }),
    ],
    instrumentations: [
      new HttpInstrumentation({
        // El healthcheck de Docker pega cada 30 s: no ensuciar las trazas
        ignoreIncomingRequestHook: (req) => (req.url || "").startsWith("/api/health"),
      }),
      new ExpressInstrumentation(),
    ],
  });

  sdk.start();
  console.log(`OpenTelemetry activo → ${base}`);

  const cerrar = () => sdk.shutdown().catch(() => {});
  process.on("SIGTERM", cerrar);
  process.on("SIGINT", cerrar);
}
