# Estructura del proyecto

Este documento explica **cada archivo del esqueleto**. Los archivos de código están **vacíos a propósito** (240 archivos):
el equipo los va llenando sprint a sprint. Se genera desde una única lista, por lo que el árbol y esta guía coinciden.

Para entender el porqué de la organización, ver [`arquitectura.md`](arquitectura.md); para trabajar en equipo, [`convenciones.md`](convenciones.md).

## Cómo leerlo

- Cada **épica** (EP-01 a EP-09) es un **módulo** del backend y una **carpeta de funcionalidad** (`features/`) del frontend, con el mismo nombre.
- Cada historia de usuario cae en un módulo claro: el código de HU-11 (reservar) vive en `modules/bookings` y en `features/bookings`.
- Una historia se implementa de abajo hacia arriba: migración → repositorio → servicio (reglas) → controlador/ruta → documentación OpenAPI → pantalla.

## Qué sprint llena qué

| Sprint | Objetivo | Se llenan |
|---|---|---|
| 1 | Usuarios, complejos, canchas, horarios y tarifas | Migraciones 001-002; `modules/auth`, `modules/venues`; `shared/`; `features/auth`, `features/venues`; `components/` |
| 2 | Reservas y pagos básicos | Migraciones 003-005; `modules/bookings`, `modules/payments`; `infrastructure/payments`; `jobs/expirar-reservas` |
| 3 | Equipos y Busca Partido (MVP) | Migración 004 (equipos, si no se hizo antes) y 006; `modules/teams`, `modules/matchmaking` |
| 4 | Pagos divididos, reembolsos, notificaciones y reputación | Migraciones 007-008; `modules/notifications`, `modules/ratings`; `infrastructure/email` |
| 5 | Recurrentes, chat, reportes y administración | Migración 009; `modules/admin`; `infrastructure/realtime`; reserva recurrente |

> Crear las migraciones de cada sprint cuando se necesiten es más seguro que crear las 28 tablas en el Sprint 1. Si el equipo prefiere crearlas todas de una vez (HT-02), el orden de los archivos ya respeta las dependencias.

## Base de datos (`database/`)

El orden de las migraciones sigue las **dependencias entre tablas**, no el número de la épica: `Pago` referencia a `Equipo` (pago dividido, HU-26), por eso `004_equipos` va antes de `005_pagos_reembolsos`.

| Archivo | Para qué sirve |
|---|---|
| `database/migrations/001_usuarios_roles.sql` | EP-01 · Rol, Usuario, TokenUsuario |
| `database/migrations/002_complejos_canchas.sql` | EP-02 · Servicio, Complejo, ComplejoServicio, FotoComplejo, HorarioAtencion, Cancha, Tarifa, BloqueoHorario |
| `database/migrations/003_reservas.sql` | EP-03 · ReservaRecurrente, Reserva, restricción EXCLUDE contra cruces (RN-01) e índices por fecha/cancha/estado (HT-02) |
| `database/migrations/004_equipos.sql` | EP-05 · Equipo, MiembroEquipo, InvitacionEquipo (antes que pagos: Pago referencia a Equipo) |
| `database/migrations/005_pagos_reembolsos.sql` | EP-04 · Pago, Reembolso |
| `database/migrations/006_busca_partido.sql` | EP-06 · PartidoAbierto, PostulacionRival, InscripcionJugador, MensajePartido |
| `database/migrations/007_notificaciones.sql` | EP-07 · Notificacion, PreferenciaAlerta |
| `database/migrations/008_calificaciones.sql` | EP-08 · CalificacionComplejo, CalificacionEquipo |
| `database/migrations/009_reportes_parametros.sql` | EP-09 · ReporteUsuario, ParametroSistema |
| `database/seeds/001_datos_de_prueba.sql` | Usuarios, complejos y canchas de ejemplo (HT-02 criterio 4) |

## Backend (`backend/`)

Capas dentro de cada módulo: **rutas → controlador → servicio → repositorio**. Las reglas puras de negocio (RN-XX) van en `domain/`, sin base de datos ni Express, para probarlas fácilmente.

#### Base común (`src/`)

| Archivo | Para qué sirve |
|---|---|
| `backend/src/main.ts` | Arranque del servidor, cierre ordenado y registro de las tareas programadas |
| `backend/src/app.ts` | Construye la app Express: middlewares, routers de cada módulo y manejo de errores (se separa de main.ts para poder probarla) |


#### `backend/src/shared/config/`

| Archivo | Para qué sirve |
|---|---|
| `backend/src/shared/config/env.ts` | Lee y valida las variables de entorno (.env) |

#### `backend/src/shared/database/`

| Archivo | Para qué sirve |
|---|---|
| `backend/src/shared/database/pool.ts` | Conexión a PostgreSQL, consultas y helper de transacciones (HT-05) |
| `backend/src/shared/database/migrate.ts` | Ejecutor de migraciones: aplica database/migrations en orden (HT-02) |
| `backend/src/shared/database/seed.ts` | Carga database/seeds (solo desarrollo) |

#### `backend/src/shared/errors/`

| Archivo | Para qué sirve |
|---|---|
| `backend/src/shared/errors/AppError.ts` | Error de negocio con código HTTP: 400, 401, 403, 404, 409 (HT-03) |

#### `backend/src/shared/events/`

| Archivo | Para qué sirve |
|---|---|
| `backend/src/shared/events/eventBus.ts` | Bus de eventos interno: desacopla módulos (p. ej. ReservaConfirmada → notificaciones) |

#### `backend/src/shared/logger/`

| Archivo | Para qué sirve |
|---|---|
| `backend/src/shared/logger/logger.ts` | Logs con fecha, endpoint y usuario (HT-14) |
| `backend/src/shared/logger/audit.ts` | Auditoría de reservas, pagos y cancelaciones (HT-14) |

#### `backend/src/shared/middleware/`

| Archivo | Para qué sirve |
|---|---|
| `backend/src/shared/middleware/authenticate.ts` | Valida el JWT y deja el usuario en la petición (HT-04) |
| `backend/src/shared/middleware/authorize.ts` | Exige uno o varios roles (RNF-02, HT-04) |
| `backend/src/shared/middleware/errorHandler.ts` | Convierte errores en respuestas JSON uniformes (HT-03) |
| `backend/src/shared/middleware/rateLimiter.ts` | Límite de peticiones en el inicio de sesión (HT-13) |

#### `backend/src/shared/security/`

| Archivo | Para qué sirve |
|---|---|
| `backend/src/shared/security/jwt.ts` | Firma y verifica tokens JWT de 2 horas (HT-04) |
| `backend/src/shared/security/password.ts` | Hash y verificación de contraseñas con bcrypt (RNF-01) |
| `backend/src/shared/security/tokens.ts` | Tokens aleatorios para correos de verificación y recuperación (HU-01, HU-03) |

#### `backend/src/shared/utils/`

| Archivo | Para qué sirve |
|---|---|
| `backend/src/shared/utils/time.ts` | Fechas y horas en America/Bogota (RNF-09) |
| `backend/src/shared/utils/money.ts` | Formato y redondeo de pesos colombianos COP (RNF-09) |


#### `backend/src/infrastructure/payments/`

| Archivo | Para qué sirve |
|---|---|
| `backend/src/infrastructure/payments/PaymentGateway.ts` | Interfaz común: cobrar, consultar estado y reembolsar (HT-08) |
| `backend/src/infrastructure/payments/SimulatedPaymentGateway.ts` | Implementación simulada; luego se cambia por Wompi, PayU o Mercado Pago (HT-08) |
| `backend/src/infrastructure/payments/index.ts` | Elige la implementación según la configuración |

#### `backend/src/infrastructure/email/`

| Archivo | Para qué sirve |
|---|---|
| `backend/src/infrastructure/email/Mailer.ts` | Interfaz de envío de correo (HT-07) |
| `backend/src/infrastructure/email/SmtpMailer.ts` | Envío por SMTP tolerante a fallos (HT-07) |
| `backend/src/infrastructure/email/templates.ts` | Plantillas de correo en español: verificación, recuperación, confirmación, recordatorio (HU-01, HU-03, HU-28) |

#### `backend/src/infrastructure/realtime/`

| Archivo | Para qué sirve |
|---|---|
| `backend/src/infrastructure/realtime/socketServer.ts` | WebSockets: chat del partido y disponibilidad en vivo (HT-09) |


#### `backend/src/jobs/`

| Archivo | Para qué sirve |
|---|---|
| `backend/src/jobs/index.ts` | Registra y arranca todas las tareas programadas (HT-06) |
| `backend/src/jobs/expirar-reservas.job.ts` | Cada minuto: reservas sin pago pasan a "Expirada" y liberan la franja (RN-02) |
| `backend/src/jobs/recordatorios.job.ts` | Recordatorios de partido y alertas (HU-28, HU-29) |
| `backend/src/jobs/anular-confirmacion-rival.job.ts` | Anula la confirmación del rival que no paga a tiempo (HU-26) |
| `backend/src/jobs/levantar-suspensiones.job.ts` | Levanta las suspensiones de Busca Partido vencidas (RN-08) |

### Módulos (uno por épica)

#### `backend/src/modules/auth/`

| Archivo | Para qué sirve |
|---|---|
| `backend/src/modules/auth/index.ts` | API pública del módulo: lo único que otros módulos pueden importar |
| `backend/src/modules/auth/auth.routes.ts` | Rutas y roles permitidos · EP-01 · Usuarios y autenticación (HU-01 a HU-04, HT-04) |
| `backend/src/modules/auth/auth.controller.ts` | Valida la entrada y delega en el servicio; no accede a la base de datos |
| `backend/src/modules/auth/auth.service.ts` | Reglas de negocio y permisos; orquesta repositorios y transacciones |
| `backend/src/modules/auth/auth.repository.ts` | Único lugar con SQL de este módulo |
| `backend/src/modules/auth/auth.dto.ts` | Esquemas de entrada (validación) y tipos de salida |
| `backend/src/modules/auth/__tests__/auth.service.test.ts` | Registro, login, bloqueo tras 5 intentos, recuperación de contraseña |

#### `backend/src/modules/venues/`

| Archivo | Para qué sirve |
|---|---|
| `backend/src/modules/venues/index.ts` | API pública del módulo: lo único que otros módulos pueden importar |
| `backend/src/modules/venues/venues.routes.ts` | Rutas y roles permitidos · EP-02 · Complejos, canchas y horarios (HU-05 a HU-09) |
| `backend/src/modules/venues/venues.controller.ts` | Valida la entrada y delega en el servicio; no accede a la base de datos |
| `backend/src/modules/venues/venues.service.ts` | Reglas de negocio y permisos; orquesta repositorios y transacciones |
| `backend/src/modules/venues/venues.repository.ts` | Único lugar con SQL de este módulo |
| `backend/src/modules/venues/venues.dto.ts` | Esquemas de entrada (validación) y tipos de salida |
| `backend/src/modules/venues/domain/slots.ts` | Genera las franjas desde apertura, cierre y duración (HU-07) |
| `backend/src/modules/venues/domain/schedule.ts` | Horario habitual y fechas especiales que lo reemplazan (HU-07) |
| `backend/src/modules/venues/domain/rates.ts` | Tarifa por día y franja: semana, fin de semana y festivo (HU-08) |
| `backend/src/modules/venues/__tests__/slots.test.ts` | Franjas de 8:00 a 23:00 con turnos de 60 min |
| `backend/src/modules/venues/__tests__/schedule.test.ts` | Fecha especial vs. horario habitual |
| `backend/src/modules/venues/__tests__/rates.test.ts` | Tarifa diurna, nocturna y de fin de semana |

#### `backend/src/modules/bookings/`

| Archivo | Para qué sirve |
|---|---|
| `backend/src/modules/bookings/index.ts` | API pública del módulo: lo único que otros módulos pueden importar |
| `backend/src/modules/bookings/bookings.routes.ts` | Rutas y roles permitidos · EP-03 · Reservas (HU-10 a HU-15, HT-05) |
| `backend/src/modules/bookings/bookings.controller.ts` | Valida la entrada y delega en el servicio; no accede a la base de datos |
| `backend/src/modules/bookings/bookings.service.ts` | Reglas de negocio y permisos; orquesta repositorios y transacciones |
| `backend/src/modules/bookings/bookings.repository.ts` | Único lugar con SQL de este módulo |
| `backend/src/modules/bookings/bookings.dto.ts` | Esquemas de entrada (validación) y tipos de salida |
| `backend/src/modules/bookings/bookings.events.ts` | Eventos que publica este módulo (consumidos por otros vía eventBus) |
| `backend/src/modules/bookings/bookings.recurring.service.ts` | Reserva recurrente semanal (HU-15) |
| `backend/src/modules/bookings/domain/availability.ts` | Franjas libres = horario − reservas − bloqueos (HU-10) |
| `backend/src/modules/bookings/domain/booking-rules.ts` | Franja dentro del horario, no bloqueada y hasta 30 días antes (RN-01, RN-06); precio fijo al confirmar (RN-04) |
| `backend/src/modules/bookings/domain/expiration.ts` | Retención máxima de 15 minutos sin pago (RN-02) |
| `backend/src/modules/bookings/domain/reschedule.ts` | Reprogramar trasladando el abono (HU-12) |
| `backend/src/modules/bookings/domain/recurring.ts` | Genera las fechas de una reserva recurrente (HU-15) |
| `backend/src/modules/bookings/__tests__/availability.test.ts` | Disponibilidad con reservas y bloqueos |
| `backend/src/modules/bookings/__tests__/booking-rules.test.ts` | RN-01, RN-04, RN-06 |
| `backend/src/modules/bookings/__tests__/expiration.test.ts` | RN-02 |
| `backend/src/modules/bookings/__tests__/recurring.test.ts` | Generación de reservas semanales |

#### `backend/src/modules/payments/`

| Archivo | Para qué sirve |
|---|---|
| `backend/src/modules/payments/index.ts` | API pública del módulo: lo único que otros módulos pueden importar |
| `backend/src/modules/payments/payments.routes.ts` | Rutas y roles permitidos · EP-04 · Pagos y cancelaciones (HU-16 a HU-18, HU-26, HT-08) |
| `backend/src/modules/payments/payments.controller.ts` | Valida la entrada y delega en el servicio; no accede a la base de datos |
| `backend/src/modules/payments/payments.service.ts` | Reglas de negocio y permisos; orquesta repositorios y transacciones |
| `backend/src/modules/payments/payments.repository.ts` | Único lugar con SQL de este módulo |
| `backend/src/modules/payments/payments.dto.ts` | Esquemas de entrada (validación) y tipos de salida |
| `backend/src/modules/payments/payments.events.ts` | Eventos que publica este módulo (consumidos por otros vía eventBus) |
| `backend/src/modules/payments/domain/deposit.ts` | Abono mínimo del 50 % o el que configure el complejo (RN-03) |
| `backend/src/modules/payments/domain/refund-policy.ts` | Reembolso del 100 %, 50 % o 0 % según la anticipación (RN-05) |
| `backend/src/modules/payments/domain/split-payment.ts` | División del valor de la cancha entre dos equipos (HU-26) |
| `backend/src/modules/payments/__tests__/deposit.test.ts` | RN-03 |
| `backend/src/modules/payments/__tests__/refund-policy.test.ts` | RN-05: más de 24 h, entre 6 y 24 h, menos de 6 h |
| `backend/src/modules/payments/__tests__/split-payment.test.ts` | Pago dividido |

#### `backend/src/modules/teams/`

| Archivo | Para qué sirve |
|---|---|
| `backend/src/modules/teams/index.ts` | API pública del módulo: lo único que otros módulos pueden importar |
| `backend/src/modules/teams/teams.routes.ts` | Rutas y roles permitidos · EP-05 · Equipos (HU-19 a HU-21) |
| `backend/src/modules/teams/teams.controller.ts` | Valida la entrada y delega en el servicio; no accede a la base de datos |
| `backend/src/modules/teams/teams.service.ts` | Reglas de negocio y permisos; orquesta repositorios y transacciones |
| `backend/src/modules/teams/teams.repository.ts` | Único lugar con SQL de este módulo |
| `backend/src/modules/teams/teams.dto.ts` | Esquemas de entrada (validación) y tipos de salida |
| `backend/src/modules/teams/__tests__/teams.service.test.ts` | Crear equipo, invitar, expulsar y ceder la capitanía |

#### `backend/src/modules/matchmaking/`

| Archivo | Para qué sirve |
|---|---|
| `backend/src/modules/matchmaking/index.ts` | API pública del módulo: lo único que otros módulos pueden importar |
| `backend/src/modules/matchmaking/matchmaking.routes.ts` | Rutas y roles permitidos · EP-06 · Busca Equipo / Busca Partido (HU-22 a HU-27) |
| `backend/src/modules/matchmaking/matchmaking.controller.ts` | Valida la entrada y delega en el servicio; no accede a la base de datos |
| `backend/src/modules/matchmaking/matchmaking.service.ts` | Reglas de negocio y permisos; orquesta repositorios y transacciones |
| `backend/src/modules/matchmaking/matchmaking.repository.ts` | Único lugar con SQL de este módulo |
| `backend/src/modules/matchmaking/matchmaking.dto.ts` | Esquemas de entrada (validación) y tipos de salida |
| `backend/src/modules/matchmaking/matchmaking.events.ts` | Eventos que publica este módulo (consumidos por otros vía eventBus) |
| `backend/src/modules/matchmaking/matchmaking.chat.ts` | Chat del partido en tiempo real; solo lectura 24 h después (HU-27, HT-09) |
| `backend/src/modules/matchmaking/domain/publication-rules.ts` | Publicar solo con 3 h de anticipación; un solo rival; cupos máximos (RN-09, RN-10) |
| `backend/src/modules/matchmaking/domain/suspension.ts` | Inasistencias y suspensión de 15 días (RN-07, RN-08) |
| `backend/src/modules/matchmaking/domain/schedule-conflict.ts` | Un equipo no puede estar en dos partidos que se crucen (RN-11) |
| `backend/src/modules/matchmaking/__tests__/publication-rules.test.ts` | RN-09, RN-10 |
| `backend/src/modules/matchmaking/__tests__/suspension.test.ts` | RN-07, RN-08 |
| `backend/src/modules/matchmaking/__tests__/schedule-conflict.test.ts` | RN-11 |

#### `backend/src/modules/notifications/`

| Archivo | Para qué sirve |
|---|---|
| `backend/src/modules/notifications/index.ts` | API pública del módulo: lo único que otros módulos pueden importar |
| `backend/src/modules/notifications/notifications.routes.ts` | Rutas y roles permitidos · EP-07 · Notificaciones (HU-28, HU-29, HT-07) |
| `backend/src/modules/notifications/notifications.controller.ts` | Valida la entrada y delega en el servicio; no accede a la base de datos |
| `backend/src/modules/notifications/notifications.service.ts` | Reglas de negocio y permisos; orquesta repositorios y transacciones |
| `backend/src/modules/notifications/notifications.repository.ts` | Único lugar con SQL de este módulo |
| `backend/src/modules/notifications/notifications.dto.ts` | Esquemas de entrada (validación) y tipos de salida |
| `backend/src/modules/notifications/notifications.events.ts` | Eventos que publica este módulo (consumidos por otros vía eventBus) |
| `backend/src/modules/notifications/notifications.listeners.ts` | Escucha eventos de otros módulos y crea las notificaciones |
| `backend/src/modules/notifications/domain/alert-matching.ts` | Decide si un partido publicado coincide con las preferencias de alerta (HU-29) |
| `backend/src/modules/notifications/__tests__/alert-matching.test.ts` | Compatibilidad de alertas |

#### `backend/src/modules/ratings/`

| Archivo | Para qué sirve |
|---|---|
| `backend/src/modules/ratings/index.ts` | API pública del módulo: lo único que otros módulos pueden importar |
| `backend/src/modules/ratings/ratings.routes.ts` | Rutas y roles permitidos · EP-08 · Calificaciones y reputación (HU-30, HU-31) |
| `backend/src/modules/ratings/ratings.controller.ts` | Valida la entrada y delega en el servicio; no accede a la base de datos |
| `backend/src/modules/ratings/ratings.service.ts` | Reglas de negocio y permisos; orquesta repositorios y transacciones |
| `backend/src/modules/ratings/ratings.repository.ts` | Único lugar con SQL de este módulo |
| `backend/src/modules/ratings/ratings.dto.ts` | Esquemas de entrada (validación) y tipos de salida |
| `backend/src/modules/ratings/domain/rating-rules.ts` | Solo participantes de un partido completado, una vez por partido (RN-12) |
| `backend/src/modules/ratings/domain/fair-play.ts` | Promedios de estrellas y fair play (se calculan, no se guardan) |
| `backend/src/modules/ratings/__tests__/rating-rules.test.ts` | RN-12 |

#### `backend/src/modules/admin/`

| Archivo | Para qué sirve |
|---|---|
| `backend/src/modules/admin/index.ts` | API pública del módulo: lo único que otros módulos pueden importar |
| `backend/src/modules/admin/admin.routes.ts` | Rutas y roles permitidos · EP-09 · Reportes y administración (HU-32, HU-33, HT-15) |
| `backend/src/modules/admin/admin.controller.ts` | Valida la entrada y delega en el servicio; no accede a la base de datos |
| `backend/src/modules/admin/admin.service.ts` | Reglas de negocio y permisos; orquesta repositorios y transacciones |
| `backend/src/modules/admin/admin.repository.ts` | Único lugar con SQL de este módulo |
| `backend/src/modules/admin/admin.dto.ts` | Esquemas de entrada (validación) y tipos de salida |
| `backend/src/modules/admin/admin.reports.service.ts` | Ocupación, ingresos y cancelaciones del complejo (HU-32) |
| `backend/src/modules/admin/admin.reports.repository.ts` | Consultas agregadas de los reportes |
| `backend/src/modules/admin/admin.export.ts` | Exportación a Excel (.xlsx) y PDF (HT-15) |
| `backend/src/modules/admin/__tests__/admin.reports.test.ts` | Cálculo de reportes |

### Pruebas de integración
| Archivo | Para qué sirve |
|---|---|
| `backend/tests/helpers/globalSetup.ts` | Recrea la base de datos de pruebas y aplica las migraciones antes de correr la suite |
| `backend/tests/helpers/api.ts` | Cliente HTTP de prueba y creación de usuarios por rol |
| `backend/tests/integration/auth.test.ts` | Registro, login y recuperación de contraseña (criterios de HU-01 a HU-03) |
| `backend/tests/integration/venues.test.ts` | Complejos, canchas, horarios, tarifas y bloqueos (HU-05 a HU-09) |
| `backend/tests/integration/bookings.test.ts` | Reservar, cancelar y reprogramar (HU-10 a HU-14) |
| `backend/tests/integration/bookings.concurrency.test.ts` | Dos reservas simultáneas de la misma franja: una gana y la otra recibe 409 (HT-05) |
| `backend/tests/integration/payments.test.ts` | Abono, saldo y reembolsos (HU-16 a HU-18) |
| `backend/tests/integration/matchmaking.test.ts` | Publicar, postularse y completar jugadores (HU-22 a HU-26) |
| `backend/tests/integration/e2e-flow.test.ts` | Flujo completo: registro → reserva → pago → Busca Partido → calificación (entrega final) |

## Frontend (`frontend/src/`)


#### `frontend/src/main.tsx/`

| Archivo | Para qué sirve |
|---|---|
| `frontend/src/main.tsx` | Punto de entrada de React |

#### `frontend/src/app/router.tsx/`

| Archivo | Para qué sirve |
|---|---|
| `frontend/src/app/router.tsx` | Todas las rutas; públicas, privadas y por rol |

#### `frontend/src/app/providers.tsx/`

| Archivo | Para qué sirve |
|---|---|
| `frontend/src/app/providers.tsx` | Sesión, caché de consultas y notificaciones emergentes |

#### `frontend/src/styles/global.css/`

| Archivo | Para qué sirve |
|---|---|
| `frontend/src/styles/global.css` | Estilos globales y breakpoints 360, 768 y 1280 px (HT-10, RNF-06) |

#### `frontend/src/components/ui/`

| Archivo | Para qué sirve |
|---|---|
| `frontend/src/components/ui/Button.tsx` | Botón reutilizable |
| `frontend/src/components/ui/Input.tsx` | Campo de texto con etiqueta reutilizable |
| `frontend/src/components/ui/Select.tsx` | Lista desplegable reutilizable |
| `frontend/src/components/ui/Card.tsx` | Tarjeta reutilizable |
| `frontend/src/components/ui/Badge.tsx` | Etiqueta de estado reutilizable |
| `frontend/src/components/ui/Modal.tsx` | Ventana de confirmación reutilizable |
| `frontend/src/components/ui/Alert.tsx` | Mensaje de error o éxito en español reutilizable |
| `frontend/src/components/ui/Spinner.tsx` | Indicador de carga reutilizable |
| `frontend/src/components/ui/Toast.tsx` | Notificación emergente (HT-10) reutilizable |
| `frontend/src/components/ui/index.ts` | Exporta los componentes de interfaz |

#### `frontend/src/components/layout/`

| Archivo | Para qué sirve |
|---|---|
| `frontend/src/components/layout/Layout.tsx` | Estructura general de la página |
| `frontend/src/components/layout/Navbar.tsx` | Navegación adaptada al rol del usuario |
| `frontend/src/components/layout/ProtectedRoute.tsx` | Ruta privada por sesión y rol (HT-10) |

#### `frontend/src/lib/api.ts/`

| Archivo | Para qué sirve |
|---|---|
| `frontend/src/lib/api.ts` | Cliente HTTP: agrega el token y traduce los errores de la API |

#### `frontend/src/lib/session.ts/`

| Archivo | Para qué sirve |
|---|---|
| `frontend/src/lib/session.ts` | Guarda el token de sesión con tolerancia a fallos del navegador |

#### `frontend/src/lib/format.ts/`

| Archivo | Para qué sirve |
|---|---|
| `frontend/src/lib/format.ts` | Pesos COP, fechas en America/Bogota (RNF-09) |

#### `frontend/src/lib/types.ts/`

| Archivo | Para qué sirve |
|---|---|
| `frontend/src/lib/types.ts` | Tipos compartidos que reflejan las respuestas de la API |

### Funcionalidades (una por épica)

#### `frontend/src/features/auth/`

| Archivo | Para qué sirve |
|---|---|
| `frontend/src/features/auth/api.ts` | Llamadas a la API de EP-01 |
| `frontend/src/features/auth/types.ts` | Tipos de EP-01 |
| `frontend/src/features/auth/AuthContext.tsx` | Estado de sesión: usuario, iniciar y cerrar sesión |
| `frontend/src/features/auth/pages/LoginPage.tsx` | HU-02 |
| `frontend/src/features/auth/pages/RegisterPage.tsx` | HU-01 |
| `frontend/src/features/auth/pages/VerifyEmailPage.tsx` | HU-01 · confirmar correo |
| `frontend/src/features/auth/pages/ForgotPasswordPage.tsx` | HU-03 |
| `frontend/src/features/auth/pages/ResetPasswordPage.tsx` | HU-03 |
| `frontend/src/features/auth/pages/ProfilePage.tsx` | HU-04 · editar mi perfil |
| `frontend/src/features/auth/pages/PublicProfilePage.tsx` | HU-04 · perfil público sin celular ni correo |

#### `frontend/src/features/venues/`

| Archivo | Para qué sirve |
|---|---|
| `frontend/src/features/venues/api.ts` | Llamadas a la API de EP-02 |
| `frontend/src/features/venues/types.ts` | Tipos de EP-02 |
| `frontend/src/features/venues/components/VenueCard.tsx` | Tarjeta de complejo con servicios como etiquetas (HU-05) |
| `frontend/src/features/venues/components/CourtCard.tsx` | Tarjeta de cancha (HU-06) |
| `frontend/src/features/venues/components/SlotGrid.tsx` | Grilla de franjas horarias (HT-10) |
| `frontend/src/features/venues/components/ScheduleForm.tsx` | Horario de atención (HU-07) |
| `frontend/src/features/venues/components/RateForm.tsx` | Tarifas (HU-08) |
| `frontend/src/features/venues/components/BlockForm.tsx` | Bloqueos de horario (HU-09) |
| `frontend/src/features/venues/pages/VenueListPage.tsx` | Explorar complejos |
| `frontend/src/features/venues/pages/VenueDetailPage.tsx` | Detalle del complejo y sus canchas |
| `frontend/src/features/venues/pages/MyVenuesPage.tsx` | HU-05 · mis complejos |
| `frontend/src/features/venues/pages/ManageVenuePage.tsx` | HU-06 a HU-09 · administrar un complejo |

#### `frontend/src/features/bookings/`

| Archivo | Para qué sirve |
|---|---|
| `frontend/src/features/bookings/api.ts` | Llamadas a la API de EP-03 |
| `frontend/src/features/bookings/types.ts` | Tipos de EP-03 |
| `frontend/src/features/bookings/components/AvailabilityFilters.tsx` | Filtros por fecha, hora, tipo y ubicación (HU-10) |
| `frontend/src/features/bookings/components/BookingSummary.tsx` | Resumen antes de confirmar (HU-11) |
| `frontend/src/features/bookings/components/BookingCalendar.tsx` | Calendario de todas las canchas (HU-14) |
| `frontend/src/features/bookings/components/CancelBookingDialog.tsx` | Cancelar o reprogramar mostrando el reembolso (HU-12) |
| `frontend/src/features/bookings/pages/AvailabilityPage.tsx` | HU-10 |
| `frontend/src/features/bookings/pages/BookingPage.tsx` | HU-11 · reservar en 4 pasos o menos (RNF-06) |
| `frontend/src/features/bookings/pages/MyBookingsPage.tsx` | HU-13 |
| `frontend/src/features/bookings/pages/VenueBookingsPage.tsx` | HU-14 · reservas del complejo y reservas manuales |
| `frontend/src/features/bookings/pages/RecurringBookingPage.tsx` | HU-15 |

#### `frontend/src/features/payments/`

| Archivo | Para qué sirve |
|---|---|
| `frontend/src/features/payments/api.ts` | Llamadas a la API de EP-04 |
| `frontend/src/features/payments/types.ts` | Tipos de EP-04 |
| `frontend/src/features/payments/components/PaymentForm.tsx` | Pago del abono (HU-16) |
| `frontend/src/features/payments/components/SplitPaymentSummary.tsx` | Pago dividido entre equipos (HU-26) |
| `frontend/src/features/payments/pages/PaymentPage.tsx` | HU-16 |
| `frontend/src/features/payments/pages/VenuePaymentsPage.tsx` | HU-17 · registrar saldo |
| `frontend/src/features/payments/pages/RefundsPage.tsx` | HU-18 · aprobar reembolsos |

#### `frontend/src/features/teams/`

| Archivo | Para qué sirve |
|---|---|
| `frontend/src/features/teams/api.ts` | Llamadas a la API de EP-05 |
| `frontend/src/features/teams/types.ts` | Tipos de EP-05 |
| `frontend/src/features/teams/pages/MyTeamsPage.tsx` | Mis equipos |
| `frontend/src/features/teams/pages/CreateTeamPage.tsx` | HU-19 |
| `frontend/src/features/teams/pages/TeamPage.tsx` | HU-21 · miembros, expulsar y ceder capitanía |
| `frontend/src/features/teams/pages/JoinTeamPage.tsx` | HU-20 · unirse por enlace de invitación |

#### `frontend/src/features/matchmaking/`

| Archivo | Para qué sirve |
|---|---|
| `frontend/src/features/matchmaking/api.ts` | Llamadas a la API de EP-06 |
| `frontend/src/features/matchmaking/types.ts` | Tipos de EP-06 |
| `frontend/src/features/matchmaking/components/OpenMatchCard.tsx` | Tarjeta de partido abierto |
| `frontend/src/features/matchmaking/components/MatchFilters.tsx` | Filtros de horario, lugar y nivel (HU-23) |
| `frontend/src/features/matchmaking/components/ChatPanel.tsx` | Chat del partido (HU-27) |
| `frontend/src/features/matchmaking/pages/OpenMatchesPage.tsx` | HU-23 |
| `frontend/src/features/matchmaking/pages/PublishMatchPage.tsx` | HU-22 |
| `frontend/src/features/matchmaking/pages/MatchDetailPage.tsx` | HU-24, HU-25, HU-26 · postularse, unirse y pagar |

#### `frontend/src/features/notifications/`

| Archivo | Para qué sirve |
|---|---|
| `frontend/src/features/notifications/api.ts` | Llamadas a la API de EP-07 |
| `frontend/src/features/notifications/types.ts` | Tipos de EP-07 |
| `frontend/src/features/notifications/components/NotificationBell.tsx` | Campana con notificaciones sin leer (HU-28) |
| `frontend/src/features/notifications/components/AlertPreferencesForm.tsx` | Preferencias de alerta (HU-29) |
| `frontend/src/features/notifications/pages/NotificationsPage.tsx` | Lista de notificaciones |

#### `frontend/src/features/ratings/`

| Archivo | Para qué sirve |
|---|---|
| `frontend/src/features/ratings/api.ts` | Llamadas a la API de EP-08 |
| `frontend/src/features/ratings/types.ts` | Tipos de EP-08 |
| `frontend/src/features/ratings/components/StarRating.tsx` | Selector de estrellas |
| `frontend/src/features/ratings/components/FairPlayForm.tsx` | Fair play e inasistencia del rival (HU-31) |
| `frontend/src/features/ratings/pages/RateVenuePage.tsx` | HU-30 |

#### `frontend/src/features/admin/`

| Archivo | Para qué sirve |
|---|---|
| `frontend/src/features/admin/api.ts` | Llamadas a la API de EP-09 |
| `frontend/src/features/admin/types.ts` | Tipos de EP-09 |
| `frontend/src/features/admin/pages/VenueReportsPage.tsx` | HU-32 · ocupación, ingresos y cancelaciones |
| `frontend/src/features/admin/pages/PlatformAdminPage.tsx` | HU-33 · aprobar complejos y parámetros |
| `frontend/src/features/admin/pages/UsersPage.tsx` | HU-33 · gestionar usuarios |
| `frontend/src/features/admin/pages/UserReportsPage.tsx` | HU-33 · atender reportes de usuarios |

## Archivos que **no** están vacíos

Son configuración que hace que la estructura funcione desde el primer día:

| Archivo | Para qué sirve |
|---|---|
| `docker-compose.yml`, `.env.example`, `.gitignore` | Levantar todo con `docker-compose up` y mantener secretos fuera del repositorio (HT-01, HT-12) |
| `.github/workflows/ci.yml`, `.github/pull_request_template.md` | Pruebas en cada pull request y checklist de la Definition of Done (HT-12) |
| `backend/package.json`, `tsconfig.json`, `vitest.config.mts`, `Dockerfile` | Dependencias, tipos, pruebas y contenedor del backend |
| `backend/.dependency-cruiser.cjs` | **Reglas de arquitectura**: falla el CI si un módulo rompe los límites |
| `backend/openapi.yaml` | Documentación de la API, vacía de endpoints (HT-03) |
| `frontend/package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `Dockerfile` | Dependencias, tipos y compilación del frontend |

Los `package-lock.json` fijan las versiones de las dependencias: **no se borran**.
