// OpenTelemetry debe cargarse antes que express
require("./tracing");
const app = require("./app");
const { db } = require("./db");
const { iniciarSocketServer } = require("./socket");

const PORT = Number(process.env.PORT) || 8080;
const SOCKET_PORT = Number(process.env.SOCKET_PORT) || 6061;

const socketServer = iniciarSocketServer(SOCKET_PORT);
const httpServer = app.listen(PORT, () => {
  console.log(`Servidor HTTP escuchando en el puerto ${PORT}`);
});

// Apagado limpio: `docker stop` manda SIGTERM durante el despliegue.
function apagar(signal) {
  console.log(`${signal} recibido, cerrando servidores...`);
  socketServer.close();
  httpServer.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on("SIGTERM", () => apagar("SIGTERM"));
process.on("SIGINT", () => apagar("SIGINT"));
