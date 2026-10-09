# Guía paso a paso — Proyecto Integrador CI/CD

Meta: que un `git push` a `main` haga **todo solo**: pruebas → imagen en Docker Hub → despliegue en EC2.
Cada paso indica la captura (📸 Fig. N) que va en el reporte.

> **Nota sobre el PDF:** el requisito dice "al menos 60 endpoints", pero el "0" está en gris casi
> blanco (color RGB 0.906) — el requisito real es **6 endpoints**. Esta API tiene 11, así que se cumple de sobra.

---

## Paso 0. Probar todo en local (Windows / PowerShell)

```powershell
cd C:\sepdic2026\Gorra\webapp-contenedor
npm install
npm test
```

Debes ver `Tests: 60 passed` y la tabla de cobertura (≈97 %).
📸 **Fig. 1** — salida de `npm test` con la tabla de cobertura.

---

## Paso 1. Token de Docker Hub (PAT)

1. Entra a https://hub.docker.com → avatar → **Account settings** → **Personal access tokens**.
2. **Generate new token** → descripción `github-actions` → permisos **Read & Write**.
3. Copia el token (solo se muestra una vez).

📸 **Fig. 2** — lista de tokens (sin mostrar el valor del token).

---

## Paso 2. Instancia EC2

Puedes reutilizar `olainstancia` o crear una nueva (región Ohio, us-east-2).

**Si creas una nueva:**
1. EC2 → **Launch instance** → nombre `webapp-cicd` → **Ubuntu Server 24.04 LTS** → `t2.micro`/`t3.micro` (Free Tier).
2. **Key pair**: crea uno `.pem` (ej. `webapp-cicd.pem`) y guárdalo bien.
3. **Network settings → Security group** con reglas de entrada:

| Tipo | Puerto | Origen |
|------|--------|--------|
| SSH | 22 | 0.0.0.0/0 (GitHub Actions usa IPs variables) |
| HTTP | 80 | 0.0.0.0/0 |
| TCP personalizado | 6061 | 0.0.0.0/0 (opcional, socket) |

4. **Advanced details → User data**: pega el contenido de `scripts/ec2-user-data.sh`. Docker se instala solo.
5. **Launch**.

**Si reutilizas `olainstancia`:** edita su Security Group y agrega la regla HTTP 80. El pipeline
reemplaza solo el contenedor viejo `webapp-container` (que estaba en 8080).

**Recomendado:** EC2 → **Elastic IPs** → Allocate → Associate a la instancia, para que la IP no
cambie al apagar/encender (si cambia, hay que actualizar el secret `EC2_HOST`).

📸 **Fig. 3** — instancia en estado *Running* con su IP pública.
📸 **Fig. 4** — reglas de entrada del Security Group (22, 80, 6061).

**Verificar Docker (opcional):**
```powershell
ssh -i C:\ruta\webapp-cicd.pem ubuntu@<IP_EC2>
docker --version
```

---

## Paso 3. Repositorio en GitHub

1. En GitHub → **New repository** → nombre `webapp-cicd` (público o privado) → **sin** README.
2. En tu PC:

```powershell
cd C:\sepdic2026\Gorra\webapp-contenedor
git init
git branch -M main
git add .
git status        # verifica que NO aparezcan node_modules, data/, *.db ni *.pem
git commit -m "feat: API con pipeline CI/CD"
git remote add origin https://github.com/<tu-usuario>/webapp-cicd.git
```

> Todavía **no** hagas push: primero los secrets (si no, el primer pipeline fallará en Docker Hub).

---

## Paso 4. GitHub Secrets

Repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

| Nombre | Valor |
|--------|-------|
| `DOCKERHUB_USERNAME` | `cachorro444` (tu usuario de Docker Hub) |
| `DOCKERHUB_TOKEN` | el token del Paso 1 |
| `EC2_HOST` | IP pública / Elastic IP de la EC2 |
| `EC2_USERNAME` | `ubuntu` |
| `EC2_SSH_KEY` | **todo** el contenido del `.pem`, incluyendo `-----BEGIN ...-----` y `-----END ...-----` |

Para copiar el `.pem` en PowerShell:
```powershell
Get-Content C:\ruta\webapp-cicd.pem -Raw | Set-Clipboard
```

📸 **Fig. 5** — lista de *Repository secrets* (solo se ven los nombres, nunca los valores).

---

## Paso 5. Primer push → el pipeline corre solo

```powershell
git push -u origin main
```

Repo → pestaña **Actions** → workflow **CI/CD - Docker Hub + AWS EC2**. Verás 3 jobs encadenados:

1. **Pruebas y cobertura** — `npm ci`, 60 pruebas, tabla de cobertura en el *Summary*.
2. **Build & push a Docker Hub** — imagen `cachorro444/webapp:latest` y `:<sha del commit>`.
3. **Desplegar en AWS EC2** — SSH, `docker pull`, reemplazo del contenedor en el puerto 80 y verificación automática de que `http://<IP>/api` responde con el nuevo commit.

📸 **Fig. 6** — grafo del workflow con los 3 jobs en verde.
📸 **Fig. 7** — log del job de pruebas con la tabla de cobertura.
📸 **Fig. 8** — *Summary* con la tabla "Cobertura de código".
📸 **Fig. 9** — Docker Hub → repositorio `webapp` → pestaña **Tags** (`latest` y el sha).
📸 **Fig. 10** — log del job de despliegue ("✅ API en línea con el commit …").

---

## Paso 6. Probar la API pública

Navegador o Postman:

- `http://<IP_EC2>/api` → mensaje, versión y commit
- `http://<IP_EC2>/api/health`
- `POST http://<IP_EC2>/api/productos` con body JSON
- `GET http://<IP_EC2>/api/productos`

Socket (si abriste el 6061):
```bash
printf '{insert:{"nombre":"Mouse","precio":250}}' | ncat <IP_EC2> 6061
printf '{get:1}' | ncat <IP_EC2> 6061
```

📸 **Fig. 11** — `/api` en el navegador mostrando el commit.
📸 **Fig. 12** — Postman con POST/GET de productos contra la IP pública.

---

## Paso 7. Demo en vivo (la que pide el profe)

1. Abre `app.js` y cambia la línea:
   ```js
   const MENSAJE_BIENVENIDA = "API de productos v1 — desplegada automáticamente con GitHub Actions";
   ```
   por ejemplo a `"API de productos v2 — demo en vivo"`.
2. ```powershell
   git commit -am "demo: cambia mensaje de bienvenida"
   git push
   ```
3. Muestra la pestaña **Actions** corriendo y, al terminar (~1–2 min), recarga `http://<IP_EC2>/api`: aparece el mensaje nuevo y el nuevo `commit`.

📸 **Fig. 13** — antes/después de `/api` con el mensaje cambiado.

**Extra para demostrar que las pruebas protegen `main`:** cambia algo que rompa una prueba (ej.
que `/health` devuelva `"okk"`), haz push y muestra que el pipeline se detiene en *Pruebas* y **no**
despliega. Luego revierte.

---

## Solución de problemas

| Síntoma | Causa probable | Solución |
|---------|----------------|----------|
| `unauthorized: incorrect username or password` en build | Token mal copiado o sin permiso Write | Regenerar PAT *Read & Write* y actualizar `DOCKERHUB_TOKEN` |
| `ssh: handshake failed` / `unable to authenticate` | `.pem` incompleto o usuario incorrecto | Pegar el `.pem` completo; `EC2_USERNAME=ubuntu` |
| `dial tcp ...:22: i/o timeout` | Puerto 22 cerrado o IP cambió | Revisar Security Group / actualizar `EC2_HOST` (usa Elastic IP) |
| `docker: command not found` en la EC2 | No se aplicó el user data | `sudo apt-get install -y docker.io && sudo systemctl enable --now docker` |
| `port is already allocated` (80) | Otro proceso/contenedor en el 80 | `sudo docker ps` y detener el que ocupe el 80 |
| Verificación final falla pero el contenedor corre | Puerto 80 cerrado en el SG | Agregar regla HTTP 80 |
| Job de pruebas falla por cobertura | Bajó del 70 % | Agregar pruebas para el código nuevo |
