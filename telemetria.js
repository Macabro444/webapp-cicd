// ─────────────────────────────────────────────────────────────
// Telemetría de la aplicación: métricas por endpoint, logs
// estructurados y trazas de SQLite. Usa la API de OpenTelemetry:
// si el SDK no está activo (local / pruebas) todo es "no-op".
// ─────────────────────────────────────────────────────────────
const { metrics, logs, trace, SpanKind, SpanStatusCode } = require("@opentelemetry/api");

const meter = metrics.getMeter("webapp-inventario");
const logger = logs.getLogger("webapp-inventario");
const tracer = trace.getTracer("webapp-sqlite");

// Severidades OTLP (SeverityNumber del estándar)
const SEVERIDAD = { INFO: 9, WARN: 13, ERROR: 17 };

const peticiones = meter.createCounter("http_peticiones_total", {
  description: "Número de peticiones HTTP recibidas por endpoint",
});
const errores = meter.createCounter("http_errores_total", {
  description: "Peticiones HTTP que terminaron con status 4xx o 5xx",
});
const latencia = meter.createHistogram("http_latencia_ms", {
  description: "Tiempo de respuesta de cada endpoint en milisegundos",
  unit: "ms",
  advice: { explicitBucketBoundaries: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000] },
});

function rutaDe(req, res) {
  if (req.route) return `${req.baseUrl || ""}${req.route.path}`;
  if (res.statusCode === 404) return "ruta_no_encontrada";
  return "frontend_estatico";
}

// Middleware: mide cada petición y emite un log estructurado al terminar
function middlewareTelemetria(req, res, next) {
  const inicio = process.hrtime.bigint();
  res.on("finish", () => {
    const duracionMs = Number(process.hrtime.bigint() - inicio) / 1e6;
    const ruta = rutaDe(req, res);
    const atributos = {
      "http.request.method": req.method,
      "http.route": ruta,
      "http.response.status_code": res.statusCode,
    };
    peticiones.add(1, atributos);
    latencia.record(duracionMs, atributos);
    if (res.statusCode >= 400) {
      errores.add(1, { ...atributos, "error.type": res.statusCode >= 500 ? "5xx" : "4xx" });
    }

    if (ruta === "/api/health" || ruta === "/health") return; // healthcheck: sin log
    const nivel = res.statusCode >= 500 ? "ERROR" : res.statusCode >= 400 ? "WARN" : "INFO";
    const span = trace.getActiveSpan();
    logger.emit({
      severityNumber: SEVERIDAD[nivel],
      severityText: nivel,
      body: `${req.method} ${req.originalUrl} → ${res.statusCode} (${duracionMs.toFixed(1)} ms)`,
      attributes: {
        tipo: "peticion_http",
        metodo: req.method,
        ruta,
        url: req.originalUrl,
        status_code: res.statusCode,
        duracion_ms: Math.round(duracionMs * 100) / 100,
        timestamp: new Date().toISOString(),
        cliente_ip: req.ip,
        user_agent: req.get("user-agent") || "",
        ...(span ? { trace_id: span.spanContext().traceId } : {}),
      },
    });
  });
  next();
}

// Log de excepción (lo usa el manejador de errores de app.js)
function registrarExcepcion(err, req) {
  const span = trace.getActiveSpan();
  if (span) {
    span.recordException(err);
    span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
  }
  logger.emit({
    severityNumber: SEVERIDAD.ERROR,
    severityText: "ERROR",
    body: `Excepción en ${req.method} ${req.originalUrl}: ${err.message}`,
    attributes: {
      tipo: "excepcion",
      "exception.type": err.name || "Error",
      "exception.message": err.message,
      "exception.stacktrace": err.stack || "",
      metodo: req.method,
      url: req.originalUrl,
      timestamp: new Date().toISOString(),
    },
  });
  console.error(err);
}

// Trazas de base de datos: envuelve db.prepare() para que cada
// consulta (run/get/all) genere un span "SQLite <OPERACIÓN>".
function instrumentarSqlite(db) {
  const prepareOriginal = db.prepare.bind(db);
  db.prepare = (sql) => {
    const stmt = prepareOriginal(sql);
    const operacion = sql.trim().split(/\s+/)[0].toUpperCase();
    const tabla = (sql.match(/\b(?:FROM|INTO|UPDATE)\s+(\w+)/i) || [])[1] || "";
    for (const metodo of ["run", "get", "all"]) {
      const original = stmt[metodo].bind(stmt);
      stmt[metodo] = (...args) =>
        tracer.startActiveSpan(
          `SQLite ${operacion}${tabla ? " " + tabla : ""}`,
          {
            kind: SpanKind.CLIENT,
            attributes: {
              "db.system.name": "sqlite",
              "db.operation.name": operacion,
              "db.collection.name": tabla,
              "db.query.text": sql.replace(/\s+/g, " ").trim(),
            },
          },
          (span) => {
            try {
              const r = original(...args);
              if (metodo === "run") span.setAttribute("db.response.affected_rows", r.changes);
              if (metodo === "all") span.setAttribute("db.response.returned_rows", r.length);
              return r;
            } catch (e) {
              span.recordException(e);
              span.setStatus({ code: SpanStatusCode.ERROR, message: e.message });
              throw e;
            } finally {
              span.end();
            }
          }
        );
    }
    return stmt;
  };
  return db;
}

module.exports = { middlewareTelemetria, registrarExcepcion, instrumentarSqlite };
