const path = require("path");
const fs = require("fs");
const os = require("os");

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "webapp-api-"));
process.env.DB_PATH = path.join(TMP_DIR, "test.db");
process.env.BACKUP_DIR = path.join(TMP_DIR, "backups");
process.env.GIT_SHA = "abc1234";

const request = require("supertest");
const app = require("../app");
const { db } = require("../db");

beforeEach(() => db.exec("DELETE FROM productos; DELETE FROM categorias;"));
afterAll(() => {
  db.close();
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

describe("API - prefijo /api", () => {
  test("API-1: GET /api devuelve mensaje, versión y commit desplegado", async () => {
    const res = await request(app).get("/api");
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveProperty("mensaje");
    expect(res.body.data).toHaveProperty("version");
    expect(res.body.data.commit).toBe("abc1234");
  });

  test("API-2: GET /api/health responde 200", async () => {
    const res = await request(app).get("/api/health");
    expect(res.body).toEqual({ statusCode: 200, data: { status: "ok" } });
  });

  test("API-3: CRUD completo bajo /api/productos", async () => {
    const cat = await request(app).post("/api/categorias").send({ nombre: "Cómputo" });
    const creado = await request(app)
      .post("/api/productos")
      .send({ nombre: "SSD", precio: 999.5, stock: 4, categoria_id: cat.body.data.id });
    expect(creado.statusCode).toBe(201);

    const id = creado.body.data.id;
    const upd = await request(app).put(`/api/productos/${id}`).send({ stock: 10 });
    expect(upd.body.data.stock).toBe(10);

    const get = await request(app).get(`/api/productos/${id}`);
    expect(get.body.data.categoria).toBe("Cómputo");

    const del = await request(app).delete(`/api/productos/${id}`);
    expect(del.body.data.deleted).toBe(id);
  });

  test("API-4 (error usuario): ruta inexistente bajo /api retorna 404", async () => {
    const res = await request(app).get("/api/usuarios");
    expect(res.statusCode).toBe(404);
    expect(res.body.data.error).toBe("Ruta no encontrada");
  });

  test("API-5 (error usuario): descripcion no textual retorna 400", async () => {
    const res = await request(app).post("/api/productos").send({ nombre: "X", descripcion: 5 });
    expect(res.statusCode).toBe(400);
  });

  test("API-6 (error usuario): categoria_id no entero retorna 400", async () => {
    const res = await request(app).post("/api/productos").send({ nombre: "X", categoria_id: "uno" });
    expect(res.statusCode).toBe(400);
  });
});
