// Frontend del inventario: consume la API REST en /api.
const API = "/api";

const $ = (id) => document.getElementById(id);
const form = $("form-producto");
const mensaje = $("mensaje");

async function api(method, ruta, body) {
  const res = await fetch(API + ruta, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.data?.error || `Error ${res.status}`);
  return json.data;
}

function mostrarMensaje(texto, tipo = "ok") {
  mensaje.textContent = texto;
  mensaje.className = `mensaje ${tipo}`;
}

async function cargarEstado() {
  try {
    const info = await api("GET", "");
    $("estado-api").textContent = `API en línea · v${info.version} · commit ${String(info.commit).slice(0, 7)}`;
  } catch {
    $("estado-api").textContent = "API sin conexión";
  }
}

async function cargarCategorias() {
  const cats = await api("GET", "/categorias");
  const select = $("categoria");
  const actual = select.value;
  select.innerHTML = cats.map((c) => `<option value="${c.id}">${escapar(c.nombre)}</option>`).join("");
  if (actual) select.value = actual;
}

async function cargarProductos() {
  const filtro = $("buscar").value.trim();
  const productos = await api("GET", "/productos" + (filtro ? `?nombre=${encodeURIComponent(filtro)}` : ""));
  $("total").textContent = productos.length;
  $("vacio").hidden = productos.length > 0;
  $("lista").innerHTML = productos
    .map(
      (p) => `
      <tr data-testid="fila-producto" data-id="${p.id}">
        <td>${p.id}</td>
        <td data-testid="celda-nombre">${escapar(p.nombre)}</td>
        <td data-testid="celda-categoria">${escapar(p.categoria ?? "—")}</td>
        <td data-testid="celda-precio">$${Number(p.precio).toFixed(2)}</td>
        <td data-testid="celda-stock">${p.stock}</td>
        <td>
          <button class="chico secundario" data-testid="btn-editar" data-id="${p.id}">Editar</button>
          <button class="chico peligro" data-testid="btn-eliminar" data-id="${p.id}">Eliminar</button>
        </td>
      </tr>`
    )
    .join("");
}

function escapar(texto) {
  const div = document.createElement("div");
  div.textContent = texto;
  return div.innerHTML;
}

function limpiarFormulario() {
  form.reset();
  $("producto-id").value = "";
  $("titulo-form").textContent = "Nuevo producto";
  $("btn-guardar").textContent = "Agregar producto";
  $("btn-cancelar").hidden = true;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = $("producto-id").value;
  const body = {
    nombre: $("nombre").value,
    descripcion: $("descripcion").value || null,
    precio: Number($("precio").value),
    stock: Number($("stock").value),
    categoria_id: $("categoria").value ? Number($("categoria").value) : null,
  };
  try {
    if (id) {
      await api("PUT", `/productos/${id}`, body);
      mostrarMensaje("Producto actualizado correctamente");
    } else {
      await api("POST", "/productos", body);
      mostrarMensaje("Producto agregado correctamente");
    }
    limpiarFormulario();
    await cargarProductos();
  } catch (err) {
    mostrarMensaje(err.message, "error");
  }
});

$("btn-cancelar").addEventListener("click", () => {
  limpiarFormulario();
  mostrarMensaje("");
});

$("lista").addEventListener("click", async (e) => {
  const boton = e.target.closest("button");
  if (!boton) return;
  const id = boton.dataset.id;

  if (boton.dataset.testid === "btn-eliminar") {
    try {
      await api("DELETE", `/productos/${id}`);
      mostrarMensaje("Producto eliminado");
      await cargarProductos();
    } catch (err) {
      mostrarMensaje(err.message, "error");
    }
  }

  if (boton.dataset.testid === "btn-editar") {
    const p = await api("GET", `/productos/${id}`);
    $("producto-id").value = p.id;
    $("nombre").value = p.nombre;
    $("descripcion").value = p.descripcion ?? "";
    $("precio").value = p.precio;
    $("stock").value = p.stock;
    if (p.categoria_id) $("categoria").value = p.categoria_id;
    $("titulo-form").textContent = `Editando producto #${p.id}`;
    $("btn-guardar").textContent = "Guardar cambios";
    $("btn-cancelar").hidden = false;
    mostrarMensaje("");
  }
});

$("form-categoria").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const cat = await api("POST", "/categorias", { nombre: $("nueva-categoria").value });
    $("nueva-categoria").value = "";
    await cargarCategorias();
    $("categoria").value = cat.id;
    mostrarMensaje(`Categoría "${cat.nombre}" creada`);
  } catch (err) {
    mostrarMensaje(err.message, "error");
  }
});

let espera;
$("buscar").addEventListener("input", () => {
  clearTimeout(espera);
  espera = setTimeout(cargarProductos, 250);
});

cargarEstado();
cargarCategorias().then(cargarProductos);
