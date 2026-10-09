# Proyecto Integrador — Pipeline CI/CD automatizado para una API REST

API REST de productos (Node.js + Express + SQLite) con socket TCP, pruebas
automatizadas con cobertura, imagen Docker optimizada y un pipeline de
**GitHub Actions** que, con un solo `git push` a `main`, prueba, publica la
imagen en **Docker Hub** y la despliega en **AWS EC2**.

## Arquitectura

```
 Desarrollador ──git push──▶ GitHub (main)
                                 │
                                 ▼
                   ┌──────── GitHub Actions (.github/workflows/main.yml) ────────┐
                   │ 1. test           npm ci → jest --coverage (umbral 70%)     │
                   │ 2. build-and-push docker build → Docker Hub :latest y :sha  │
                   │ 3. deploy-ec2     SSH → docker pull → stop/rm → run -p 80   │
                   │                   → curl /api verifica el commit en línea   │
                   └──────────────┬───────────────────────────────┬──────────────┘
                                  ▼                               ▼
                    Docker Hub  <usuario>/webapp        AWS EC2 (Ubuntu + Docker)
                                                        :80  → contenedor :8080 (HTTP)
                                                        :6061 → contenedor :6061 (TCP)
                                                        volumen webapp-data (SQLite)
```

Los datos sensibles (usuario/token de Docker Hub, IP, usuario y llave SSH de la
EC2) **solo** existen como *GitHub Secrets*; no hay ninguno en el código.

## Endpoints

Base pública: `http://<IP_EC2>/api` (también responden sin el prefijo `/api`).
Todas las respuestas usan el schema `{ "statusCode": 200, "data": ... }`.

| # | Método | Ruta | Descripción |
|---|--------|------|-------------|
| 0 | GET | `/api` | Mensaje, versión y commit desplegado |
| 1 | GET | `/api/health` | Healthcheck |
| 2 | GET | `/api/categorias` | Listar categorías |
| 3 | POST | `/api/categorias` | Crear categoría `{nombre}` |
| 4 | GET | `/api/productos` | Listar productos (`?nombre=` opcional) |
| 5 | GET | `/api/productos/:id` | Obtener un producto |
| 6 | POST | `/api/productos` | Crear producto |
| 7 | PUT | `/api/productos/:id` | Actualizar producto (parcial) |
| 8 | DELETE | `/api/productos/:id` | Eliminar un producto |
| 9 | DELETE | `/api/productos` | Vaciar la tabla productos |
| 10 | GET | `/api/backup` | Descargar backup `.db` |

Socket TCP (puerto 6061): `{insert:<json producto>}` y `{get:<id>}`.

```json
{ "nombre": "Teclado", "descripcion": "Mecánico", "precio": 899, "stock": 10, "categoria_id": 1 }
```

## Comandos locales

```bash
npm install            # dependencias
npm start              # API en http://localhost:8080 y socket en 6061
npm test               # 60 pruebas + reporte de cobertura (falla si < 70%)

docker build -t webapp:local .
docker run -d --name webapp -p 8080:8080 -p 6061:6061 webapp:local
curl http://localhost:8080/api/health
printf '{insert:{"nombre":"Mouse","precio":250}}' | ncat localhost 6061
```

## Estructura

```
├── .github/workflows/main.yml   # Pipeline CI/CD
├── app.js                       # Rutas Express (router en /api)
├── db.js                        # SQLite (better-sqlite3)
├── socket.js                    # Servidor TCP {insert:..}/{get:..}
├── server.js                    # Arranque HTTP + TCP y apagado limpio
├── tests/                       # Jest + Supertest (API, endpoints, socket)
├── Dockerfile                   # Multi-stage, usuario no-root, HEALTHCHECK
├── .dockerignore
├── scripts/ec2-user-data.sh     # Instala Docker en la EC2 al crearla
└── docs/GUIA_PASO_A_PASO.md     # Configuración completa desde cero
```

## Configuración (resumen)

1. **Docker Hub** → Account settings → Personal access tokens → token *Read & Write*.
2. **EC2** Ubuntu con Security Group: 22 (SSH), 80 (HTTP) y opcional 6061 (TCP);
   en *User data* pega `scripts/ec2-user-data.sh`.
3. **GitHub** → Settings → Secrets and variables → Actions → crear:

| Secret | Valor |
|--------|-------|
| `DOCKERHUB_USERNAME` | usuario de Docker Hub |
| `DOCKERHUB_TOKEN` | Personal Access Token |
| `EC2_HOST` | IP pública (o DNS) de la EC2 |
| `EC2_USERNAME` | `ubuntu` |
| `EC2_SSH_KEY` | contenido completo del archivo `.pem` |

4. `git push origin main` y listo: revisa la pestaña **Actions**.

La guía detallada está en [`docs/GUIA_PASO_A_PASO.md`](docs/GUIA_PASO_A_PASO.md).

## Demo en vivo

Cambia el texto de `MENSAJE_BIENVENIDA` en `app.js`, luego:

```bash
git commit -am "demo: cambia mensaje de bienvenida"
git push
```

En ~2 minutos `http://<IP_EC2>/api` muestra el nuevo mensaje y el nuevo `commit`.
