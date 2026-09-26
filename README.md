# SADE-IA · Sistema de Apoyo a la Decisión para Emergencias

Implementación del sistema descrito en la tesis *“SADE-IA”* (Maestría en Seguridad, Defensa y Desarrollo · EAEN) a partir del prototipo y la guía de estilo.

| Carpeta | Tecnología | Qué contiene |
|---|---|---|
| `backend/` | Node.js 20+ · Express 5 · MySQL 8 · Socket.IO | API REST, JWT, roles y permisos, motor de alertas con IA explicable, ingesta de datos, notificación simultánea, reportes PDF/XLSX/CSV, bitácora inalterable |
| `frontend/` | React 19 · Vite · React Router · Leaflet · Chart.js | Sistema web del COEN y de las instituciones (9 módulos) |
| `mobile/` | React Native · Expo SDK 57 · Expo Router | App **ciudadana** (reportar emergencias, sin cuenta), app de **enlace** (alertas y tareas, funciona sin señal) y app de **rescate** (misiones, ruta e informe en sitio) |

**Mapas sin Google Maps:** todo el sistema usa **Leaflet + OpenStreetMap** (licencia libre, sin API key). En la web con `react-leaflet`; en el móvil, Leaflet dentro de un `WebView` (funciona en Expo Go, Android e iOS por igual). La navegación del equipo de rescate abre la ruta en OpenStreetMap (OSRM). Ver [Mapas en producción](#mapas-en-producción).

---

## 1. Arquitectura (tres capas + REST, tesis §4.4.2.9)

```
 ┌──────────────── Presentación ────────────────┐
 │  Web React (COEN, VIDECI, SENAMHI, UTI…)      │
 │  App móvil Expo (ciudadano · enlace · rescate)│
 └───────────────┬───────────────▲──────────────┘
          REST /api (JWT)   Socket.IO (tiempo real)
 ┌───────────────▼───────────────┴──────────────┐
 │  Node.js + Express  — servicios desacoplados  │
 │  auth · ingesta · motor de alerta · inferencia│
 │  IA · coordinación · notificaciones · auditoría│
 └───────────────┬──────────────────────────────┘
 ┌───────────────▼──────────────────────────────┐
 │  MySQL 8 (sadeia_db, 3FN)                     │
 │  lectura particionada por año · bitácora con  │
 │  triggers que impiden UPDATE/DELETE (RNF-10)  │
 └──────────────────────────────────────────────┘
      (opcional) microservicio Python/scikit-learn → AI_SERVICE_URL
```

## 2. Instalación local (desarrollo)

Requisitos: **Node.js 20 o superior**, **MySQL 8** (o MariaDB 10.11 para pruebas), y para el móvil la app **Expo Go** en el teléfono.

### 2.1 Base de datos y backend

```bash
cd backend
cp .env.example .env          # edite DB_USER, DB_PASSWORD y JWT_SECRET
npm install
npm run db:reset              # crea sadeia_db (schema.sql) y carga datos de demostración
npm run dev                   # API en http://localhost:4000/api
```

> `db:init` solo crea el esquema; `db:seed` carga los datos demo; `db:reset` hace ambas cosas (¡borra todo!).
> El usuario MySQL de `.env` necesita permiso `CREATE` y `TRIGGER` para `db:init`.

Simulador de estaciones (opcional, en otra terminal) — envía lecturas como lo haría SENAMHI y el motor IA propone una alerta nueva en Riberalta:

```bash
npm run simulate              # 5 lotes; use  npm run simulate -- --loop  para modo continuo
```

### 2.2 Frontend web

```bash
cd frontend
cp .env.example .env
npm install
npm run dev                   # http://localhost:5173  (proxy automático a la API)
```

### 2.3 App móvil

```bash
cd mobile
cp .env.example .env          # opcional: EXPO_PUBLIC_API_URL=http://<IP-de-su-PC>:4000
npm install
npx expo start                # escanee el QR con Expo Go (teléfono en la misma red Wi-Fi)
```

Si no define `EXPO_PUBLIC_API_URL`, la app usa automáticamente la IP de la PC que ejecuta `expo start` y el puerto 4000. En el backend agregue esa URL a `CORS_ORIGINS` solo si prueba la versión web del móvil (las apps nativas no envían cabecera Origin).

### 2.4 Usuarios de demostración

Contraseña de todos: **`Sadeia2026!`**

| Usuario | Rol | Institución | Dónde usarlo |
|---|---|---|---|
| `marce` | Decisor | VIDECI | Web: valida alertas, aprueba recomendaciones |
| `jmamani` | Operador | COEN | Web: emite alertas, recibe reportes ciudadanos y despacha |
| `arojas` | Analista técnico | SENAMHI | Web: fuentes, modelos IA, umbrales |
| `dchoque` | Administrador | UTI | Web: todo, incluido usuarios, permisos y bitácora |
| `rsuarez` | Enlace | FF.AA. | **App móvil de enlace** (y web de coordinación) |
| `lmendez` | Equipo de rescate | Policía · BR-03 | **App móvil de rescate** |
| `pticona` | Analista (bloqueado) | SENAMHI | Demuestra el bloqueo de cuentas |

Para producción desactive los accesos rápidos: `VITE_DEMO_LOGIN=false` (web) y `EXPO_PUBLIC_DEMO_LOGIN=false` (móvil), y **no** ejecute `db:seed`.

### 2.5 Recorrido de demostración (flujo completo)

1. **Móvil (ciudadano):** *Reportar una emergencia* → tipo, fotos, GPS, personas en riesgo → *Enviar*. Queda en *Seguimiento* en tiempo real.
2. **Web (`jmamani`) → Reportes ciudadanos:** el reporte aparece al instante con triaje IA (prioridad, clasificación, duplicados, alerta coincidente). Pulse *Despachar · sugerido* sobre BR-03.
3. **Móvil (`lmendez`):** suena/vibra *Nueva misión* → *Aceptar* → mapa con ruta → *Llegué al sitio* → *Situación controlada* → *Informe en sitio*. El ciudadano ve cada paso.
4. **Web (`marce`) → Alertas:** valide ALT-2026-0412 → notificación simultánea a 7 instituciones.
5. **Móvil (`rsuarez`) → Alertas:** *Confirmar recepción*. En **Tareas**, reporte avance (funciona sin señal: se encola y se envía al reconectar).
6. **Web → Eventos:** apruebe o modifique cursos de acción → se generan tareas para cada institución.
7. **Web → Reportes:** exporte el consolidado en PDF, XLSX o CSV. **Administración → Bitácora:** todo quedó registrado.

## 3. Módulos y trazabilidad con la tesis

| Módulo (Tabla 24) | Web | API | Requerimientos |
|---|---|---|---|
| Ingesta e integración | Fuentes de datos | `/api/datos/*` (ingesta push con `x-api-key`, adaptadores REST/CSV/Formulario/MQTT) | RF-01, RF-02, RNF-09 |
| Análisis predictivo e IA | Modelos IA (versiones, umbrales, inferencias) | `/api/modelos/*` | RF-03, RF-04, RF-17, RNF-05 |
| Alerta temprana | Alertas tempranas | `/api/alertas/*` (validar, modificar nivel, descartar con justificación, confirmar recepción) | RF-05, RF-06, RF-07 |
| Eventos y apoyo a la decisión | Eventos y decisión | `/api/eventos/*` (recomendaciones priorizadas; flujo 3.a protocolo) | RF-08, RF-09 |
| Coordinación y recursos | Coordinación | `/api/coordinacion/*` | RF-10, RF-11 |
| Tablero y reportes | Tablero · Reportes | `/api/tablero`, `/api/reportes/*` | RF-12, RF-13, RNF-01 |
| Seguridad y auditoría | Administración | `/api/auth/*`, `/api/admin/*` | RF-14, RF-15, RF-16, RNF-03, RNF-04, RNF-10 |
| Primera respuesta (prototipo) | Reportes ciudadanos | `/api/publico/*`, `/api/reportes-ciudadanos/*`, `/api/misiones/*` | RNF-07 |

**Motor de IA explicable (RNF-05).** `backend/src/services/inferenceService.js` calcula, para cada variable, la excedencia normalizada frente al umbral normado; la probabilidad es una logística del promedio ponderado y el nivel se asigna con los cortes del D.S. 2342 (0,50 / 0,65 / 0,80). Cada alerta guarda variables, valores y umbrales, que la web muestra como barras con la línea del umbral. Los umbrales se editan desde *Modelos IA → Umbrales* sin tocar código (RNF-09).

**Microservicio Python (opcional).** Si define `AI_SERVICE_URL`, el backend llama a:
- `POST /predict` con `{ "amenaza": "INU", "features": { "nivel_rio": 8.92, … } }` → `{ "probabilidad": 0.87 }`
- `POST /train` con `{ "modelo": "M-INU" }` → `{ "f1": 0.9, "auc": 0.95, "recall": 0.92 }`

Si el servicio no responde, se usa el motor integrado (el sistema no se detiene).

**Tiempo real.** Socket.IO con salas por institución (`inst:<id>`), por permiso, por equipo de rescate y por reporte ciudadano (con token). El tablero, las bandejas y las apps móviles se actualizan sin recargar.

**Bitácora inalterable.** Solo existe `INSERT`; los triggers `trg_bitacora_no_update/no_delete` rechazan cualquier modificación incluso desde la consola SQL. En producción otorgue al usuario de la app solo `SELECT, INSERT` sobre `bitacora`.

## 4. Despliegue

### 4.1 Con Docker (recomendado)

```bash
cp .env.example .env                  # defina JWT_SECRET, contraseñas, PUBLIC_URL y CORS_ORIGINS
docker compose up -d --build          # MySQL 8 + API + web (Nginx) en http://localhost:8080
docker compose exec backend npm run db:seed   # solo si quiere datos de demostración
```

Nginx (`frontend/nginx.conf`) sirve la SPA y hace de proxy a `/api`, `/uploads` y `/socket.io` (WebSocket).
Ponga delante un balanceador o Nginx con **certificado TLS** (RNF-03), por ejemplo con Let's Encrypt, y publique solo el puerto 443. Configure `PUBLIC_URL=https://su-dominio` para que las fotos se sirvan con URL pública.

### 4.2 Sin Docker (servidor Linux)

1. MySQL 8: `mysql -u root -p < backend/database/schema.sql` y cree el usuario de la app.
2. Backend: `npm ci --omit=dev`, configure `.env` y ejecútelo con **PM2** o **systemd** (`node src/server.js`).
3. Frontend: `npm run build` y publique `frontend/dist` con Nginx usando el mismo `nginx.conf` (cambie `backend:4000` por `127.0.0.1:4000`).
4. Respaldo diario cifrado (RNF-11), por ejemplo con cron:
   `mysqldump --single-transaction sadeia_db | gzip | openssl enc -aes-256-cbc -pbkdf2 -pass file:/root/.backup_key > /respaldos/sadeia_$(date +%F).sql.gz.enc`

### 4.3 App móvil (Android / iOS) con EAS

```bash
cd mobile
npm install -g eas-cli            # o use npx eas-cli@latest
eas login
eas build:configure               # la primera vez (asocia el proyecto)
# edite EXPO_PUBLIC_API_URL en eas.json con la URL HTTPS de su servidor
npm run build:apk                 # APK instalable para pruebas (perfil preview)
npm run build:android             # AAB para Google Play (perfil production)
npm run build:ios                 # IPA para App Store / TestFlight (requiere cuenta Apple)
eas submit -p android             # publicación en tiendas
```

Identificadores configurados: `com.chakuy.sadeia` (Android e iOS). Cámbielos en `app.json` si la institución publicará con su propia cuenta.
En producción use siempre HTTPS; `usesCleartextTraffic` está habilitado solo para pruebas en red local.

## 5. Mapas en producción

- Web: `VITE_TILE_URL` · Móvil: `EXPO_PUBLIC_TILE_URL` (formato XYZ `https://…/{z}/{x}/{y}.png`).
- Las teselas públicas de `tile.openstreetmap.org` son adecuadas para pruebas y bajo volumen, pero su [política de uso](https://operations.osmfoundation.org/policies/tiles/) no permite cargas intensivas. Para operación institucional se recomienda un **servidor de teselas propio** con datos OSM de Bolivia (p. ej. `openmaptiles/tileserver-gl` u `overv/openstreetmap-tile-server` en Docker), lo que además permite operar en redes aisladas. También existen proveedores basados en OSM con planes gratuitos.
- La atribución “© OpenStreetMap contributors” es obligatoria y ya está incluida.

## 6. Referencia rápida de la API

| Método | Ruta | Permiso |
|---|---|---|
| POST | `/api/auth/login` · GET `/api/auth/me` | público / sesión |
| GET | `/api/tablero` · `/api/tablero/contadores` · `/api/tablero/buscar?q=` | `tablero.ver` |
| GET | `/api/alertas` · `/api/alertas/:id` · `/api/alertas/recibidas` | `alertas.ver` / `alertas.confirmar` |
| POST | `/api/alertas/:id/validar` · `/nivel` · `/descartar` · `/confirmar` · `/cerrar` | `alertas.validar` / `alertas.gestionar` |
| GET/POST | `/api/eventos` · `/api/eventos/:id` · `/api/eventos/:id/cerrar` | `eventos.*` |
| POST | `/api/eventos/recomendaciones/:id/decidir` (`aprobada`, `modificada`, `descartada`, `deshacer`) | `recomendaciones.decidir` |
| GET/POST | `/api/coordinacion/tareas` · `/tareas/mias` · `/tareas/:id/avance` · `/recursos` · `/recursos/:id/asignar` | `coordinacion.*` / `tareas.reportar` |
| POST | `/api/datos/ingesta` (cabecera `x-api-key`) · GET `/api/datos/fuentes` · `/lecturas` · `/umbrales` | clave de fuente / `fuentes.*` |
| GET/POST | `/api/modelos` · `/api/modelos/:id/versiones` · `/api/modelos/:id/reentrenar` | `modelos.*` |
| GET/POST | `/api/reportes/indicadores` · `/alertas-mes` · `/exportar` (`PDF`/`XLSX`/`CSV`) | `reportes.*` |
| GET/POST/PATCH | `/api/admin/usuarios` · `/api/admin/roles` · `/api/admin/bitacora` | `admin.*` / `bitacora.ver` |
| GET/POST | `/api/reportes-ciudadanos` · `/:id/despachar` · `/:id/vincular` · `/:id/falso` | `ciudadanos.*` |
| GET/POST/PUT | `/api/misiones/actual` · `/:id/aceptar` · `/:id/rechazar` · `/:id/avanzar` · `/:id/informe` · `/ubicacion` | `rescate.misiones` |
| GET/POST | `/api/publico/alertas` · `/api/publico/reportes` · `/api/publico/reportes/:codigo?token=` | público (con límite de tasa) |

Ejemplo de ingesta desde una estación:

```bash
curl -X POST http://localhost:4000/api/datos/ingesta \
  -H "Content-Type: application/json" -H "x-api-key: dev-senamhi-hidro" \
  -d '{"lecturas":[{"estacion":"Est. Riberalta","departamento":"Beni","municipio":"Riberalta","lat":-11.0,"lng":-66.07,"variable":"nivel_rio","valor":8.7}]}'
```

## 7. Lista de verificación para producción

- [ ] `JWT_SECRET` largo y aleatorio; `NODE_ENV=production`.
- [ ] HTTPS en todos los accesos (web, API y app móvil).
- [ ] Sin datos de demostración y con accesos rápidos desactivados.
- [ ] Usuario MySQL de la app con privilegios mínimos (solo `SELECT, INSERT` sobre `bitacora`).
- [ ] Respaldo diario cifrado y prueba de restauración.
- [ ] Servidor de teselas propio o proveedor OSM con capacidad suficiente.
- [ ] `CORS_ORIGINS` limitado al dominio institucional.
- [ ] Webhooks de instituciones (`institucion.webhook_url`) configurados si se integran canales externos (SMS, correo, radio).

---
Autor: Dhc. Ing. Carlos Andres Azcarraga Esquivel · Tutor: Gral. Div. Vladimir Hinojosa Luizaga · CHAKUY · 2026
