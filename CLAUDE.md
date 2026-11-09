# CLAUDE.md

Guía para asistentes de código (y personas) que trabajan en CanchaYa. Las fuentes de verdad son
[`docs/requerimientos.txt`](docs/requerimientos.txt) (historias, criterios y reglas RN-XX),
[`docs/arquitectura.md`](docs/arquitectura.md) y [`docs/convenciones.md`](docs/convenciones.md).

## Proyecto

Plataforma web de alquiler de canchas sintéticas con módulo "Busca Partido". Código abierto (MIT).

- `backend/`: Node 20+, Express 5, TypeScript estricto, `pg` sin ORM, `zod` para validar entradas.
- `frontend/`: React 19 + Vite + TypeScript, React Router 7, TanStack Query.
- `database/migrations/`: SQL plano numerado, PostgreSQL 16 (usa `btree_gist` para RN-01).

## Comandos

```bash
cd backend
npm run migrate          # aplica database/migrations (DATABASE_URL)
npm run seed             # datos de prueba (solo desarrollo)
npm run dev              # API en :3000
npm test                 # unitarias + integración (necesita PostgreSQL; ver tests/helpers/globalSetup.ts)
npm run typecheck
npm run check:boundaries # reglas de arquitectura (dependency-cruiser)

cd frontend
npm run dev              # web en :5173 (proxy /api -> :3000)
npm run build            # typecheck + build
```

## Reglas de arquitectura (el CI las verifica)

- Un módulo por épica en `backend/src/modules/<modulo>`: `routes → controller → service → repository`, reglas puras en `domain/`.
- Otro módulo solo se importa por su `index.ts`. `shared/` e `infrastructure/` no importan módulos. Sin ciclos.
- Dependencias permitidas: `bookings → venues`, `payments → bookings`, `matchmaking → bookings, teams, payments`,
  `ratings → bookings, matchmaking`, `admin → venues, bookings, payments, auth`. Lo demás va por eventos (`shared/events/eventBus.ts`).
- SQL **solo** en `*.repository.ts`, siempre parametrizado (`$1`), nunca concatenando entradas.
- `domain/` no usa base de datos, Express ni reloj implícito: recibe `ahora` como parámetro para poder probarse.

## Convenciones

- Tablas/columnas en español `snake_case`; JSON de la API en español `camelCase`; código en inglés.
- Errores: `throw new AppError(status, codigo, mensaje)`; respuesta `{ "error": { "codigo", "mensaje", "detalles?" } }`.
  Mensajes al usuario en español claro; nunca exponer trazas ni mensajes de la base de datos.
- Dinero en COP como enteros (pesos) en la API; `NUMERIC(12,2)` en la BD. Zona horaria `America/Bogota`.
  Fechas de reserva: `fecha` (DATE) + `hora_inicio`/`hora_fin` (TIME) en hora local de Bogotá.
- Comentar la regla de negocio que se aplica: `// RN-02`.
- Cada endpoint nuevo se documenta en `backend/openapi.yaml`.
- Nunca editar una migración ya integrada: crear la siguiente.

## Seguridad (no negociable)

- bcrypt asíncrono; JWT HS256 de 2 h con `algorithms: ['HS256']` fijado al verificar; secreto ≥ 32 caracteres.
- Tokens de correo (verificación, recuperación) se guardan **hasheados** (SHA-256) y son de un solo uso.
- Bloqueo de 15 min tras 5 intentos fallidos; límite de peticiones en login y recuperación.
- Helmet, CORS restringido a `CORS_ORIGIN`, límite de tamaño del body, validación `zod` en cada entrada.
- Autorización en el servicio (dueño del recurso), no solo por rol en la ruta (RNF-02).
- El perfil público nunca expone correo ni celular (HU-04).

## Git

- Ramas `feature/...` → `develop` → `main`. Commits `tipo(módulo): descripción (HU-XX)`.
- **Sin nombres de personas** en archivos, documentos ni commits; identidad de commit `CanchaYa`.
- **Sin** líneas `Co-Authored-By` ni atribuciones a asistentes de IA.
