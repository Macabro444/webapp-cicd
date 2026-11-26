// Pruebas E2E del FRONTEND: un navegador real usa la interfaz como un usuario.
const { test, expect } = require("@playwright/test");

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  await request.delete("/api/productos"); // empezar con la tabla vacía
});

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("FE-01: la página carga con título y formulario", async ({ page }) => {
  await expect(page).toHaveTitle("Inventario de Productos");
  await expect(page.getByTestId("titulo")).toHaveText("Inventario de Productos");
  await expect(page.getByTestId("form-producto")).toBeVisible();
  await expect(page.getByTestId("tabla-productos")).toBeVisible();
});

test("FE-02: muestra que el API está en línea", async ({ page }) => {
  await expect(page.getByTestId("estado-api")).toContainText("API en línea");
});

test("FE-03: con la tabla vacía aparece el mensaje de lista vacía", async ({ page }) => {
  await expect(page.getByTestId("total-productos")).toHaveText("0");
  await expect(page.getByTestId("lista-vacia")).toBeVisible();
});

test("FE-04: el selector de categorías trae la categoría 'General'", async ({ page }) => {
  await expect(page.getByTestId("select-categoria")).toContainText("General");
});

test("FE-05: agregar un producto desde el formulario", async ({ page }) => {
  await page.getByTestId("input-nombre").fill("Teclado mecánico");
  await page.getByTestId("input-descripcion").fill("Switches rojos");
  await page.getByTestId("input-precio").fill("899.50");
  await page.getByTestId("input-stock").fill("12");
  await page.getByTestId("btn-guardar").click();

  await expect(page.getByTestId("mensaje")).toHaveText("Producto agregado correctamente");
  const fila = page.getByTestId("fila-producto").filter({ hasText: "Teclado mecánico" });
  await expect(fila).toBeVisible();
  await expect(fila.getByTestId("celda-precio")).toHaveText("$899.50");
  await expect(fila.getByTestId("celda-stock")).toHaveText("12");
  await expect(page.getByTestId("total-productos")).toHaveText("1");
});

test("FE-06 (error usuario): no permite guardar sin nombre", async ({ page }) => {
  await page.getByTestId("input-precio").fill("10");
  await page.getByTestId("btn-guardar").click();
  await expect(page.getByTestId("mensaje")).toHaveText("nombre es requerido y no puede estar vacío");
  await expect(page.getByTestId("mensaje")).toHaveClass(/error/);
});

test("FE-07 (error usuario): rechaza precio negativo", async ({ page }) => {
  await page.getByTestId("input-nombre").fill("Producto inválido");
  await page.getByTestId("input-precio").fill("-5");
  await page.getByTestId("btn-guardar").click();
  await expect(page.getByTestId("mensaje")).toHaveText("precio debe ser un número mayor o igual a 0");
});

test("FE-08: editar un producto existente", async ({ page }) => {
  const fila = page.getByTestId("fila-producto").filter({ hasText: "Teclado mecánico" });
  await fila.getByTestId("btn-editar").click();

  await expect(page.getByTestId("titulo-form")).toContainText("Editando producto");
  await expect(page.getByTestId("input-nombre")).toHaveValue("Teclado mecánico");
  await page.getByTestId("input-stock").fill("30");
  await page.getByTestId("btn-guardar").click();

  await expect(page.getByTestId("mensaje")).toHaveText("Producto actualizado correctamente");
  await expect(fila.getByTestId("celda-stock")).toHaveText("30");
  await expect(page.getByTestId("titulo-form")).toHaveText("Nuevo producto");
});

test("FE-09: cancelar edición regresa el formulario a 'Nuevo producto'", async ({ page }) => {
  await page.getByTestId("btn-editar").first().click();
  await expect(page.getByTestId("btn-cancelar")).toBeVisible();
  await page.getByTestId("btn-cancelar").click();
  await expect(page.getByTestId("titulo-form")).toHaveText("Nuevo producto");
  await expect(page.getByTestId("input-nombre")).toHaveValue("");
});

test("FE-10: crear categoría y asignarla a un producto", async ({ page }) => {
  await page.getByTestId("input-categoria").fill("Periféricos");
  await page.getByTestId("btn-agregar-categoria").click();
  await expect(page.getByTestId("mensaje")).toHaveText('Categoría "Periféricos" creada');

  await page.getByTestId("input-nombre").fill("Mouse inalámbrico");
  await page.getByTestId("input-precio").fill("350");
  await page.getByTestId("input-stock").fill("8");
  await page.getByTestId("select-categoria").selectOption({ label: "Periféricos" });
  await page.getByTestId("btn-guardar").click();

  const fila = page.getByTestId("fila-producto").filter({ hasText: "Mouse inalámbrico" });
  await expect(fila.getByTestId("celda-categoria")).toHaveText("Periféricos");
});

test("FE-11 (error usuario): no permite categoría duplicada", async ({ page }) => {
  await page.getByTestId("input-categoria").fill("Periféricos");
  await page.getByTestId("btn-agregar-categoria").click();
  await expect(page.getByTestId("mensaje")).toHaveText("Ya existe una categoría con ese nombre");
});

test("FE-12: el buscador filtra por nombre", async ({ page }) => {
  await expect(page.getByTestId("fila-producto")).toHaveCount(2);
  await page.getByTestId("input-buscar").fill("Mouse");
  await expect(page.getByTestId("fila-producto")).toHaveCount(1);
  await expect(page.getByTestId("celda-nombre")).toHaveText("Mouse inalámbrico");
  await page.getByTestId("input-buscar").fill("no-existe");
  await expect(page.getByTestId("lista-vacia")).toBeVisible();
});

test("FE-13: eliminar un producto desde la tabla", async ({ page }) => {
  const fila = page.getByTestId("fila-producto").filter({ hasText: "Mouse inalámbrico" });
  await fila.getByTestId("btn-eliminar").click();
  await expect(page.getByTestId("mensaje")).toHaveText("Producto eliminado");
  await expect(fila).toHaveCount(0);
  await expect(page.getByTestId("total-productos")).toHaveText("1");
});
