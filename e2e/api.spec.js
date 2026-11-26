// Pruebas E2E del BACKEND: peticiones HTTP reales al API con Playwright.
const { test, expect } = require("@playwright/test");

test.describe.configure({ mode: "serial" });

let categoriaId;
let productoId;

test("API-01: GET /api responde mensaje, versión y commit", async ({ request }) => {
  const res = await request.get("/api");
  expect(res.status()).toBe(200);
  const { data } = await res.json();
  expect(data).toHaveProperty("mensaje");
  expect(data).toHaveProperty("version");
  expect(data).toHaveProperty("commit");
});

test("API-02: GET /api/health responde ok", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ statusCode: 200, data: { status: "ok" } });
});

test("API-03: POST /api/categorias crea una categoría", async ({ request }) => {
  const res = await request.post("/api/categorias", { data: { nombre: `Cómputo-${Date.now()}` } });
  expect(res.status()).toBe(201);
  categoriaId = (await res.json()).data.id;
  expect(categoriaId).toBeGreaterThan(0);
});

test("API-04: GET /api/categorias lista las categorías", async ({ request }) => {
  const res = await request.get("/api/categorias");
  expect(res.status()).toBe(200);
  const { data } = await res.json();
  expect(data.some((c) => c.id === categoriaId)).toBe(true);
});

test("API-05: POST /api/productos crea un producto", async ({ request }) => {
  const res = await request.post("/api/productos", {
    data: { nombre: "Monitor 24", precio: 2899.9, stock: 5, categoria_id: categoriaId },
  });
  expect(res.status()).toBe(201);
  const { data } = await res.json();
  productoId = data.id;
  expect(data.nombre).toBe("Monitor 24");
});

test("API-06: GET /api/productos/:id devuelve el producto con su categoría", async ({ request }) => {
  const res = await request.get(`/api/productos/${productoId}`);
  expect(res.status()).toBe(200);
  const { data } = await res.json();
  expect(data.id).toBe(productoId);
  expect(data.categoria).toContain("Cómputo");
});

test("API-07: GET /api/productos?nombre= filtra por nombre", async ({ request }) => {
  const res = await request.get("/api/productos?nombre=Monitor");
  const { data } = await res.json();
  expect(data.length).toBeGreaterThan(0);
  expect(data.every((p) => p.nombre.includes("Monitor"))).toBe(true);
});

test("API-08: PUT /api/productos/:id actualiza el stock", async ({ request }) => {
  const res = await request.put(`/api/productos/${productoId}`, { data: { stock: 50 } });
  expect(res.status()).toBe(200);
  expect((await res.json()).data.stock).toBe(50);
});

test("API-09: DELETE /api/productos/:id elimina el producto", async ({ request }) => {
  const res = await request.delete(`/api/productos/${productoId}`);
  expect(res.status()).toBe(200);
  expect((await res.json()).data.deleted).toBe(productoId);
});

test("API-10 (error usuario): producto eliminado ya no existe (404)", async ({ request }) => {
  const res = await request.get(`/api/productos/${productoId}`);
  expect(res.status()).toBe(404);
});

test("API-11 (error usuario): id no numérico responde 400", async ({ request }) => {
  const res = await request.get("/api/productos/abc");
  expect(res.status()).toBe(400);
});

test("API-12 (error usuario): producto sin nombre responde 400", async ({ request }) => {
  const res = await request.post("/api/productos", { data: { precio: 10 } });
  expect(res.status()).toBe(400);
});

test("API-13 (error usuario): stock decimal responde 400", async ({ request }) => {
  const res = await request.post("/api/productos", { data: { nombre: "X", stock: 1.5 } });
  expect(res.status()).toBe(400);
});

test("API-14 (error usuario): categoría inexistente responde 400", async ({ request }) => {
  const res = await request.post("/api/productos", { data: { nombre: "X", categoria_id: 99999 } });
  expect(res.status()).toBe(400);
});

test("API-15 (error usuario): JSON mal formado responde 400", async ({ request }) => {
  const res = await request.post("/api/productos", {
    headers: { "Content-Type": "application/json" },
    data: "{ nombre: ",
  });
  expect(res.status()).toBe(400);
});

test("API-16 (error usuario): ruta inexistente responde 404", async ({ request }) => {
  const res = await request.get("/api/no-existe");
  expect(res.status()).toBe(404);
});

test("API-17: GET /api/backup descarga la base de datos", async ({ request }) => {
  const res = await request.get("/api/backup");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-disposition"]).toContain("webapp-backup-");
});
