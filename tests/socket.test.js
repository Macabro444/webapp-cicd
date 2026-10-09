/**
 * Pruebas del socket TCP crudo (protocolo {insert:<json>} y {get:<id>}).
 * Se levanta el servidor en un puerto libre (0) para no chocar con el 6061.
 */
const path = require("path");
const fs = require("fs");
const os = require("os");
const net = require("net");

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "webapp-socket-"));
process.env.DB_PATH = path.join(TMP_DIR, "test.db");

const { db } = require("../db");
const { iniciarSocketServer, extraerMensajes } = require("../socket");

let server;
let port;

beforeAll((done) => {
  server = iniciarSocketServer(0);
  server.on("listening", () => {
    port = server.address().port;
    done();
  });
});

afterAll((done) => {
  server.close(() => {
    db.close();
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
    done();
  });
});

beforeEach(() => db.exec("DELETE FROM productos;"));

// Envía uno o varios trozos y espera `n` respuestas (una por línea).
function enviar(trozos, n = 1) {
  return new Promise((resolve, reject) => {
    const cliente = net.createConnection({ port }, async () => {
      for (const t of [].concat(trozos)) {
        cliente.write(t);
        await new Promise((r) => setTimeout(r, 20));
      }
    });
    let buffer = "";
    cliente.on("data", (d) => {
      buffer += d.toString();
      const lineas = buffer.split("\n").filter(Boolean);
      if (lineas.length >= n) {
        cliente.end();
        resolve(lineas.map((l) => JSON.parse(l)));
      }
    });
    cliente.on("error", reject);
  });
}

describe("SOCKET - extraerMensajes (parser)", () => {
  test("SK-1: separa varios comandos en un mismo buffer", () => {
    const { mensajes, resto } = extraerMensajes('{get:1}{insert:{"nombre":"A"}}');
    expect(mensajes).toEqual([
      { command: "get", element: "1" },
      { command: "insert", element: '{"nombre":"A"}' },
    ]);
    expect(resto).toBe("");
  });

  test("SK-2: deja en el resto un mensaje incompleto", () => {
    const { mensajes, resto } = extraerMensajes('{insert:{"nombre":"A"');
    expect(mensajes).toHaveLength(0);
    expect(resto).toBe('{insert:{"nombre":"A"');
  });

  test("SK-3: llaves dentro de strings no rompen el parser", () => {
    const { mensajes } = extraerMensajes('{insert:{"nombre":"a}b{c"}}');
    expect(JSON.parse(mensajes[0].element).nombre).toBe("a}b{c");
  });

  test("SK-4: texto sin comando se ignora", () => {
    const { mensajes } = extraerMensajes("hola mundo");
    expect(mensajes).toHaveLength(0);
  });
});

describe("SOCKET - servidor TCP", () => {
  test("SK-5: insert crea el producto y responde 200", async () => {
    const [r] = await enviar('{insert:{"nombre":"Webcam","precio":450,"stock":2}}');
    expect(r.statusCode).toBe(200);
    expect(r.data).toMatchObject({ nombre: "Webcam", precio: 450, stock: 2 });
  });

  test("SK-6: get devuelve el producto insertado", async () => {
    const [ins] = await enviar('{insert:{"nombre":"Hub USB"}}');
    const [r] = await enviar(`{get:${ins.data.id}}`);
    expect(r.statusCode).toBe(200);
    expect(r.data.nombre).toBe("Hub USB");
  });

  test("SK-7 (error usuario): get de id inexistente responde 404", async () => {
    const [r] = await enviar("{get:99999}");
    expect(r.statusCode).toBe(404);
    expect(r.error).toBe("no encontrado");
  });

  test("SK-8 (error usuario): insert con JSON inválido responde 400", async () => {
    const [r] = await enviar("{insert:{nombre:sin comillas}}");
    expect(r.statusCode).toBe(400);
  });

  test("SK-9: mensaje partido en dos paquetes TCP se procesa completo", async () => {
    const [r] = await enviar(['{insert:{"nombre":"Mic', 'rófono"}}']);
    expect(r.statusCode).toBe(200);
    expect(r.data.nombre).toBe("Micrófono");
  });
});
