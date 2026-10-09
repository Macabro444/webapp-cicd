const express = require("express");
const path = require("path");
const fs = require("fs");
const { db, DB_PATH } = require("./db");

const app = express();
app.use(express.json());

// Todas las rutas viven en un Router que se monta en /api (URL pública:
// http://<IP_EC2>/api/...) y también en / para no romper las prácticas anteriores.
const router = express.Router();

// Mensaje de bienvenida. En la demo en vivo se cambia ESTA línea, se hace
// git push y el pipeline la publica sola en la EC2.
const MENSAJE_BIENVENIDA = "API de productos estamos en vivo bebe";
const APP_VERSION = process.env.APP_VERSION || require("./package.json").version;
const GIT_SHA = process.env.GIT_SHA || "local";

const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, "backups");
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

function send(res, statusCode, data) {
  res.status(statusCode).json({ statusCode, data });
}

// ---------- Helpers de validación ----------
function parseId(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    send(res, 400, { error: "id inválido: debe ser un entero positivo" });
    return null;
  }
  return id;
}

function validarProducto(body, parcial = false) {
  const { nombre, descripcion, precio, stock, categoria_id } = body;

  if (!parcial || nombre !== undefined) {
    if (typeof nombre !== "string" || nombre.trim() === "")
      return "nombre es requerido y no puede estar vacío";
  }
  if (descripcion !== undefined && descripcion !== null && typeof descripcion !== "string")
    return "descripcion debe ser texto";
  if (precio !== undefined && precio !== null) {
    if (typeof precio !== "number" || !Number.isFinite(precio) || precio < 0)
      return "precio debe ser un número mayor o igual a 0";
  }
  if (stock !== undefined && stock !== null) {
    if (!Number.isInteger(stock) || stock < 0)
      return "stock debe ser un entero mayor o igual a 0";
  }
  if (categoria_id !== undefined && categoria_id !== null) {
    if (!Number.isInteger(categoria_id)) return "categoria_id debe ser un entero";
    const cat = db.prepare("SELECT id FROM categorias WHERE id = ?").get(categoria_id);
    if (!cat) return "La categoría indicada no existe";
  }
  return null;
}

const SELECT_PRODUCTO = `SELECT p.*, c.nombre AS categoria
  FROM productos p LEFT JOIN categorias c ON p.categoria_id = c.id`;

// ---------- 0. GET / (info y versión desplegada) ----------
router.get("/", (req, res) => {
  send(res, 200, { mensaje: MENSAJE_BIENVENIDA, version: APP_VERSION, commit: GIT_SHA });
});

// ---------- 1. GET /health ----------
router.get("/health", (req, res) => {
  send(res, 200, { status: "ok" });
});

// ---------- 2. GET /categorias ----------
router.get("/categorias", (req, res) => {
  send(res, 200, db.prepare("SELECT * FROM categorias").all());
});

// ---------- 3. POST /categorias ----------
router.post("/categorias", (req, res) => {
  const { nombre } = req.body;
  if (typeof nombre !== "string" || nombre.trim() === "")
    return send(res, 400, { error: "nombre es requerido y no puede estar vacío" });

  const limpio = nombre.trim();
  const duplicada = db.prepare("SELECT id FROM categorias WHERE nombre = ?").get(limpio);
  if (duplicada) return send(res, 400, { error: "Ya existe una categoría con ese nombre" });

  const info = db.prepare("INSERT INTO categorias (nombre) VALUES (?)").run(limpio);
  send(res, 201, db.prepare("SELECT * FROM categorias WHERE id = ?").get(info.lastInsertRowid));
});

// ---------- 4. GET /productos (filtro opcional ?nombre=) ----------
router.get("/productos", (req, res) => {
  const { nombre } = req.query;
  const rows = nombre
    ? db.prepare(`${SELECT_PRODUCTO} WHERE p.nombre LIKE ?`).all(`%${nombre}%`)
    : db.prepare(SELECT_PRODUCTO).all();
  send(res, 200, rows);
});

// ---------- 5. GET /productos/:id ----------
router.get("/productos/:id", (req, res) => {
  const id = parseId(req, res);
  if (id === null) return;
  const row = db.prepare(`${SELECT_PRODUCTO} WHERE p.id = ?`).get(id);
  if (!row) return send(res, 404, { error: "Producto no encontrado" });
  send(res, 200, row);
});

// ---------- 6. POST /productos ----------
router.post("/productos", (req, res) => {
  const error = validarProducto(req.body);
  if (error) return send(res, 400, { error });

  const { nombre, descripcion, precio, stock, categoria_id } = req.body;
  const info = db
    .prepare(
      `INSERT INTO productos (nombre, descripcion, precio, stock, categoria_id)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(nombre.trim(), descripcion ?? null, precio ?? 0, stock ?? 0, categoria_id ?? null);
  send(res, 201, db.prepare("SELECT * FROM productos WHERE id = ?").get(info.lastInsertRowid));
});

// ---------- 7. PUT /productos/:id ----------
router.put("/productos/:id", (req, res) => {
  const id = parseId(req, res);
  if (id === null) return;

  const existente = db.prepare("SELECT * FROM productos WHERE id = ?").get(id);
  if (!existente) return send(res, 404, { error: "Producto no encontrado" });

  const campos = ["nombre", "descripcion", "precio", "stock", "categoria_id"];
  if (!campos.some((c) => req.body[c] !== undefined))
    return send(res, 400, { error: "No se enviaron campos para actualizar" });

  const error = validarProducto(req.body, true);
  if (error) return send(res, 400, { error });

  const nombre = req.body.nombre !== undefined ? req.body.nombre.trim() : existente.nombre;
  const descripcion = req.body.descripcion ?? existente.descripcion;
  const precio = req.body.precio ?? existente.precio;
  const stock = req.body.stock ?? existente.stock;
  const categoria_id = req.body.categoria_id ?? existente.categoria_id;

  db.prepare(
    `UPDATE productos SET nombre=?, descripcion=?, precio=?, stock=?, categoria_id=? WHERE id=?`
  ).run(nombre, descripcion, precio, stock, categoria_id, id);

  send(res, 200, db.prepare("SELECT * FROM productos WHERE id = ?").get(id));
});

// ---------- 8. DELETE /productos/:id ----------
router.delete("/productos/:id", (req, res) => {
  const id = parseId(req, res);
  if (id === null) return;
  const info = db.prepare("DELETE FROM productos WHERE id = ?").run(id);
  if (info.changes === 0) return send(res, 404, { error: "Producto no encontrado" });
  send(res, 200, { deleted: id });
});

// ---------- 9. DELETE /productos (vaciar tabla) ----------
router.delete("/productos", (req, res) => {
  const info = db.prepare("DELETE FROM productos").run();
  send(res, 200, { message: "Tabla productos vaciada", eliminados: info.changes });
});

// ---------- 10. GET /backup ----------
router.get("/backup", (req, res) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(BACKUP_DIR, `webapp-backup-${timestamp}.db`);
  try {
    fs.copyFileSync(DB_PATH, backupPath);
  } catch (err) {
    return send(res, 500, { error: "No se pudo generar el backup" });
  }
  res.download(backupPath, path.basename(backupPath), (err) => {
    if (err && !res.headersSent) send(res, 500, { error: "No se pudo enviar el backup" });
  });
});

app.use("/api", router);
app.use("/", router);

// ---------- Ruta inexistente ----------
app.use((req, res) => send(res, 404, { error: "Ruta no encontrada" }));

// ---------- Manejo de errores (JSON mal formado, etc.) ----------
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed")
    return send(res, 400, { error: "El cuerpo de la petición no es un JSON válido" });
  send(res, 500, { error: "Error interno del servidor" });
});

module.exports = app;