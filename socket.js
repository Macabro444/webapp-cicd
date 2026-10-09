const net = require("net");
const { db } = require("./db");

function extraerMensajes(buffer) {
  const mensajes = [];
  let i = 0;

  while (i < buffer.length) {
    const inicioMatch = buffer.slice(i).match(/\{(insert|get):/);
    if (!inicioMatch) break;

    const inicio = i + inicioMatch.index;
    const command = inicioMatch[1];
    const inicioElement = inicio + inicioMatch[0].length;

    let profundidad = 1;
    let j = inicioElement;
    let dentroString = false;

    while (j < buffer.length && profundidad > 0) {
      const ch = buffer[j];
      if (ch === '"' && buffer[j - 1] !== "\\") dentroString = !dentroString;
      if (!dentroString) {
        if (ch === "{") profundidad++;
        if (ch === "}") profundidad--;
      }
      j++;
    }

    if (profundidad !== 0) {
      return { mensajes, resto: buffer.slice(inicio) };
    }

    const element = buffer.slice(inicioElement, j - 1);
    mensajes.push({ command, element });
    i = j;
  }

  return { mensajes, resto: buffer.slice(i) };
}

function iniciarSocketServer(puerto = 6061) {
  const insertStmt = db.prepare(
    `INSERT INTO productos (nombre, descripcion, precio, stock, categoria_id)
     VALUES (@nombre, @descripcion, @precio, @stock, @categoria_id)`
  );
  const getStmt = db.prepare("SELECT * FROM productos WHERE id = ?");

  const socketServer = net.createServer((socket) => {
    let buffer = "";

    socket.on("data", (data) => {
      buffer += data.toString();
      const { mensajes, resto } = extraerMensajes(buffer);
      buffer = resto;

      for (const { command, element } of mensajes) {
        try {
          if (command === "insert") {
            const producto = JSON.parse(element);
            const info = insertStmt.run({
              nombre: producto.nombre,
              descripcion: producto.descripcion ?? null,
              precio: producto.precio ?? 0,
              stock: producto.stock ?? 0,
              categoria_id: producto.categoria_id ?? null,
            });
            const nuevo = getStmt.get(info.lastInsertRowid);
            socket.write(JSON.stringify({ statusCode: 200, data: nuevo, error: null }) + "\n");
          }

          if (command === "get") {
            const id = parseInt(element, 10);
            const producto = getStmt.get(id);
            if (producto) {
              socket.write(JSON.stringify({ statusCode: 200, data: producto, error: null }) + "\n");
            } else {
              socket.write(JSON.stringify({ statusCode: 404, data: null, error: "no encontrado" }) + "\n");
            }
          }
        } catch (err) {
          socket.write(JSON.stringify({ statusCode: 400, data: null, error: err.message }) + "\n");
        }
      }
    });

    socket.on("error", (err) => console.error("Error de socket:", err.message));
  });

  socketServer.listen(puerto, () =>
    console.log(`Socket TCP escuchando en ${socketServer.address().port}`)
  );
  return socketServer;
}

module.exports = { iniciarSocketServer, extraerMensajes };