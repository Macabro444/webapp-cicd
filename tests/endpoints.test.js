/**
 * Pruebas unitarias de la API webapp-contenedor
 * Herramientas: Jest + Supertest
 * Cada prueba corre contra una base SQLite temporal (no toca data/ ni backups/ reales).
 */
const path = require("path");
const fs = require("fs");
const os = require("os");

// --- Base de datos y carpeta de backups aisladas para pruebas ---
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "webapp-test-"));
process.env.DB_PATH = path.join(TMP_DIR, "test.db");
process.env.BACKUP_DIR = path.join(TMP_DIR, "backups");

const request = require("supertest");
const app = require("../app");
const { db } = require("../db");

// --- Helpers ---
async function crearCategoria(nombre = "Electrónica") {
  const res = await request(app).post("/categorias").send({ nombre });
  return res.body.data;
}

async function crearProducto(datos = {}) {
  const res = await request(app)
    .post("/productos")
    .send({ nombre: "Laptop", descripcion: "14 pulgadas", precio: 15000, stock: 5, ...datos });
  return res.body.data;
}

function binaryParser(res, callback) {
  const chunks = [];
  res.on("data", (chunk) => chunks.push(chunk));
  res.on("end", () => callback(null, Buffer.concat(chunks)));
}

beforeEach(() => {
  db.exec("DELETE FROM productos; DELETE FROM categorias;");
});

afterAll(() => {
  db.close();
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

// ═══════════════════════════════════════════════════════
// EP1 — GET /health
// ═══════════════════════════════════════════════════════
describe("EP1 - GET /health", () => {
  test("EP1-1: Retorna 200 y status ok", async () => {
    const res = await request(app).get("/health");
    expect(res.statusCode).toBe(200);
    expect(res.body.data.status).toBe("ok");
  });

  test("EP1-2: Respeta el schema normalizado {statusCode, data}", async () => {
    const res = await request(app).get("/health");
    expect(res.body).toEqual({ statusCode: 200, data: { status: "ok" } });
  });

  test("EP1-3 (error usuario): Ruta mal escrita retorna 404 con schema", async () => {
    const res = await request(app).get("/helth");
    expect(res.statusCode).toBe(404);
    expect(res.body.statusCode).toBe(404);
    expect(res.body.data.error).toBe("Ruta no encontrada");
  });
});

// ═══════════════════════════════════════════════════════
// EP2 — GET /categorias
// ═══════════════════════════════════════════════════════
describe("EP2 - GET /categorias", () => {
  test("EP2-1: Retorna 200 y arreglo vacío si no hay categorías", async () => {
    const res = await request(app).get("/categorias");
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  test("EP2-2: Retorna las categorías creadas", async () => {
    await crearCategoria("Libros");
    await crearCategoria("Ropa");
    const res = await request(app).get("/categorias");
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data.map((c) => c.nombre)).toEqual(["Libros", "Ropa"]);
  });

  test("EP2-3: Cada categoría tiene id y nombre", async () => {
    await crearCategoria("Hogar");
    const res = await request(app).get("/categorias");
    expect(res.body.data[0]).toHaveProperty("id");
    expect(res.body.data[0]).toHaveProperty("nombre", "Hogar");
  });
});

// ═══════════════════════════════════════════════════════
// EP3 — POST /categorias
// ═══════════════════════════════════════════════════════
describe("EP3 - POST /categorias", () => {
  test("EP3-1: Crea categoría y retorna 201", async () => {
    const res = await request(app).post("/categorias").send({ nombre: "Juguetes" });
    expect(res.statusCode).toBe(201);
    expect(res.body.data.nombre).toBe("Juguetes");
    expect(res.body.data.id).toBeDefined();
  });

  test("EP3-2 (error usuario): Body sin nombre retorna 400", async () => {
    const res = await request(app).post("/categorias").send({});
    expect(res.statusCode).toBe(400);
  });

  test("EP3-3 (error usuario): Nombre vacío o solo espacios retorna 400", async () => {
    const vacio = await request(app).post("/categorias").send({ nombre: "" });
    const espacios = await request(app).post("/categorias").send({ nombre: "    " });
    expect(vacio.statusCode).toBe(400);
    expect(espacios.statusCode).toBe(400);
  });

  test("EP3-4 (error usuario): Nombre duplicado retorna 400", async () => {
    await crearCategoria("Deportes");
    const res = await request(app).post("/categorias").send({ nombre: "Deportes" });
    expect(res.statusCode).toBe(400);
    expect(res.body.data.error).toMatch(/existe/i);
  });

  test("EP3-5 (error usuario): Nombre de tipo número retorna 400", async () => {
    const res = await request(app).post("/categorias").send({ nombre: 123 });
    expect(res.statusCode).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════
// EP4 — GET /productos
// ═══════════════════════════════════════════════════════
describe("EP4 - GET /productos", () => {
  test("EP4-1: Retorna 200 y arreglo vacío si no hay productos", async () => {
    const res = await request(app).get("/productos");
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  test("EP4-2: Incluye el nombre de la categoría (JOIN)", async () => {
    const cat = await crearCategoria("Cómputo");
    await crearProducto({ categoria_id: cat.id });
    const res = await request(app).get("/productos");
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].categoria).toBe("Cómputo");
  });

  test("EP4-3: Filtro ?nombre= retorna solo coincidencias", async () => {
    await crearProducto({ nombre: "Mouse inalámbrico" });
    await crearProducto({ nombre: "Teclado" });
    const res = await request(app).get("/productos?nombre=mouse");
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].nombre).toBe("Mouse inalámbrico");
  });

  test("EP4-4 (error usuario): Filtro sin coincidencias retorna arreglo vacío, no error", async () => {
    await crearProducto({ nombre: "Monitor" });
    const res = await request(app).get("/productos?nombre=zzzz");
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════
// EP5 — GET /productos/:id
// ═══════════════════════════════════════════════════════
describe("EP5 - GET /productos/:id", () => {
  test("EP5-1: Retorna el producto correcto", async () => {
    const creado = await crearProducto({ nombre: "Monitor" });
    const res = await request(app).get(`/productos/${creado.id}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.nombre).toBe("Monitor");
  });

  test("EP5-2 (error usuario): Id inexistente retorna 404", async () => {
    const res = await request(app).get("/productos/9999");
    expect(res.statusCode).toBe(404);
    expect(res.body.data.error).toBe("Producto no encontrado");
  });

  test("EP5-3 (error usuario): Id no numérico retorna 400", async () => {
    const res = await request(app).get("/productos/abc");
    expect(res.statusCode).toBe(400);
  });

  test("EP5-4 (error usuario): Id negativo o cero retorna 400", async () => {
    const negativo = await request(app).get("/productos/-1");
    const cero = await request(app).get("/productos/0");
    expect(negativo.statusCode).toBe(400);
    expect(cero.statusCode).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════
// EP6 — POST /productos
// ═══════════════════════════════════════════════════════
describe("EP6 - POST /productos", () => {
  test("EP6-1: Crea producto con todos los campos y retorna 201", async () => {
    const cat = await crearCategoria("Audio");
    const res = await request(app)
      .post("/productos")
      .send({ nombre: "Bocina", descripcion: "Bluetooth", precio: 1200, stock: 3, categoria_id: cat.id });
    expect(res.statusCode).toBe(201);
    expect(res.body.data).toMatchObject({ nombre: "Bocina", precio: 1200, stock: 3, categoria_id: cat.id });
  });

  test("EP6-2: Solo con nombre aplica valores por defecto (precio 0, stock 0)", async () => {
    const res = await request(app).post("/productos").send({ nombre: "Cable" });
    expect(res.statusCode).toBe(201);
    expect(res.body.data.precio).toBe(0);
    expect(res.body.data.stock).toBe(0);
  });

  test("EP6-3 (error usuario): Falta el nombre retorna 400", async () => {
    const res = await request(app).post("/productos").send({ precio: 500 });
    expect(res.statusCode).toBe(400);
  });

  test("EP6-4 (error usuario): Precio negativo retorna 400", async () => {
    const res = await request(app).post("/productos").send({ nombre: "Tablet", precio: -100 });
    expect(res.statusCode).toBe(400);
    expect(res.body.data.error).toMatch(/precio/);
  });

  test("EP6-5 (error usuario): Precio como texto retorna 400", async () => {
    const res = await request(app).post("/productos").send({ nombre: "Tablet", precio: "mil" });
    expect(res.statusCode).toBe(400);
  });

  test("EP6-6 (error usuario): Stock decimal o negativo retorna 400", async () => {
    const decimal = await request(app).post("/productos").send({ nombre: "USB", stock: 2.5 });
    const negativo = await request(app).post("/productos").send({ nombre: "USB", stock: -3 });
    expect(decimal.statusCode).toBe(400);
    expect(negativo.statusCode).toBe(400);
  });

  test("EP6-7 (error usuario): categoria_id inexistente retorna 400", async () => {
    const res = await request(app).post("/productos").send({ nombre: "Silla", categoria_id: 9999 });
    expect(res.statusCode).toBe(400);
    expect(res.body.data.error).toMatch(/categor/i);
  });

  test("EP6-8 (error usuario): JSON mal formado retorna 400 con schema", async () => {
    const res = await request(app)
      .post("/productos")
      .set("Content-Type", "application/json")
      .send('{"nombre": "Laptop", "precio": }');
    expect(res.statusCode).toBe(400);
    expect(res.body.statusCode).toBe(400);
    expect(res.body.data.error).toMatch(/JSON/);
  });
});

// ═══════════════════════════════════════════════════════
// EP7 — PUT /productos/:id
// ═══════════════════════════════════════════════════════
describe("EP7 - PUT /productos/:id", () => {
  test("EP7-1: Actualiza varios campos y retorna 200", async () => {
    const creado = await crearProducto();
    const res = await request(app)
      .put(`/productos/${creado.id}`)
      .send({ nombre: "Laptop Gamer", precio: 25000 });
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toMatchObject({ nombre: "Laptop Gamer", precio: 25000 });
  });

  test("EP7-2: Actualización parcial conserva los campos no enviados", async () => {
    const creado = await crearProducto({ nombre: "Impresora", stock: 7 });
    const res = await request(app).put(`/productos/${creado.id}`).send({ precio: 3500 });
    expect(res.body.data.nombre).toBe("Impresora");
    expect(res.body.data.stock).toBe(7);
    expect(res.body.data.precio).toBe(3500);
  });

  test("EP7-3: El cambio persiste al consultar con GET", async () => {
    const creado = await crearProducto();
    await request(app).put(`/productos/${creado.id}`).send({ stock: 99 });
    const res = await request(app).get(`/productos/${creado.id}`);
    expect(res.body.data.stock).toBe(99);
  });

  test("EP7-4 (error usuario): Id inexistente retorna 404", async () => {
    const res = await request(app).put("/productos/9999").send({ precio: 10 });
    expect(res.statusCode).toBe(404);
  });

  test("EP7-5 (error usuario): Id no numérico retorna 400", async () => {
    const res = await request(app).put("/productos/abc").send({ precio: 10 });
    expect(res.statusCode).toBe(400);
  });

  test("EP7-6 (error usuario): Body vacío retorna 400", async () => {
    const creado = await crearProducto();
    const res = await request(app).put(`/productos/${creado.id}`).send({});
    expect(res.statusCode).toBe(400);
  });

  test("EP7-7 (error usuario): Nombre vacío o precio negativo retorna 400 y no modifica", async () => {
    const creado = await crearProducto({ nombre: "Router", precio: 900 });
    const r1 = await request(app).put(`/productos/${creado.id}`).send({ nombre: "" });
    const r2 = await request(app).put(`/productos/${creado.id}`).send({ precio: -50 });
    expect(r1.statusCode).toBe(400);
    expect(r2.statusCode).toBe(400);
    const res = await request(app).get(`/productos/${creado.id}`);
    expect(res.body.data).toMatchObject({ nombre: "Router", precio: 900 });
  });
});

// ═══════════════════════════════════════════════════════
// EP8 — DELETE /productos/:id
// ═══════════════════════════════════════════════════════
describe("EP8 - DELETE /productos/:id", () => {
  test("EP8-1: Elimina y retorna 200 con el id eliminado", async () => {
    const creado = await crearProducto();
    const res = await request(app).delete(`/productos/${creado.id}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.deleted).toBe(creado.id);
  });

  test("EP8-2: El producto ya no existe tras eliminarlo", async () => {
    const creado = await crearProducto();
    await request(app).delete(`/productos/${creado.id}`);
    const res = await request(app).get(`/productos/${creado.id}`);
    expect(res.statusCode).toBe(404);
  });

  test("EP8-3 (error usuario): Eliminar dos veces el mismo id retorna 404 la segunda vez", async () => {
    const creado = await crearProducto();
    await request(app).delete(`/productos/${creado.id}`);
    const res = await request(app).delete(`/productos/${creado.id}`);
    expect(res.statusCode).toBe(404);
  });

  test("EP8-4 (error usuario): Id no numérico retorna 400", async () => {
    const res = await request(app).delete("/productos/abc");
    expect(res.statusCode).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════
// EP9 — DELETE /productos (vaciar)
// ═══════════════════════════════════════════════════════
describe("EP9 - DELETE /productos (vaciar)", () => {
  test("EP9-1: Vacía la tabla y reporta cuántos eliminó", async () => {
    await crearProducto({ nombre: "A" });
    await crearProducto({ nombre: "B" });
    const res = await request(app).delete("/productos");
    expect(res.statusCode).toBe(200);
    expect(res.body.data.eliminados).toBe(2);
    const lista = await request(app).get("/productos");
    expect(lista.body.data).toHaveLength(0);
  });

  test("EP9-2: Vaciar una tabla ya vacía no falla (retorna 200)", async () => {
    const res = await request(app).delete("/productos");
    expect(res.statusCode).toBe(200);
    expect(res.body.data.eliminados).toBe(0);
  });

  test("EP9-3: Las categorías se conservan al vaciar productos", async () => {
    await crearCategoria("Oficina");
    await crearProducto();
    await request(app).delete("/productos");
    const res = await request(app).get("/categorias");
    expect(res.body.data).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════
// EP10 — GET /backup
// ═══════════════════════════════════════════════════════
describe("EP10 - GET /backup", () => {
  test("EP10-1: Retorna 200 como archivo adjunto .db", async () => {
    const res = await request(app).get("/backup").buffer(true).parse(binaryParser);
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-disposition"]).toMatch(/attachment; filename="webapp-backup-.*\.db"/);
  });

  test("EP10-2: El archivo descargado es una base SQLite válida", async () => {
    await crearProducto();
    const res = await request(app).get("/backup").buffer(true).parse(binaryParser);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.subarray(0, 15).toString()).toBe("SQLite format 3");
  });

  test("EP10-3: Se guarda una copia en la carpeta de backups", async () => {
    const antes = fs.existsSync(process.env.BACKUP_DIR) ? fs.readdirSync(process.env.BACKUP_DIR).length : 0;
    await request(app).get("/backup").buffer(true).parse(binaryParser);
    const despues = fs.readdirSync(process.env.BACKUP_DIR).length;
    expect(despues).toBe(antes + 1);
  });

  test("EP10-4 (error usuario): Método incorrecto (POST /backup) retorna 404", async () => {
    const res = await request(app).post("/backup");
    expect(res.statusCode).toBe(404);
  });
});