# Arquitectura de CanchaYa

## Decisión

**Monolito modular con arquitectura por capas dentro de cada módulo**, una SPA en React y PostgreSQL.

No se usan microservicios: el equipo es de 4 personas y 5 sprints, y la regla de no doble reserva (RN-01, RNF-05)
necesita una única transacción en la base de datos. Un monolito modular permite separar un módulo más adelante si hiciera falta.

## Vista general

```
 Navegador (React SPA)
        │  HTTPS · JSON · JWT
        ▼
 API Express ──────────────────────────────────────────────┐
  ├─ modules/   auth · venues · bookings · payments ·      │  un solo proceso,
  │             teams · matchmaking · notifications ·      │  una sola base de datos
  │             ratings · admin           (1 por épica)    │
  ├─ shared/          config, BD, errores, seguridad       │
  ├─ infrastructure/  pagos, correo, tiempo real           │
  └─ jobs/            tareas programadas (cada minuto...)  │
        │
        ▼
 PostgreSQL 16  (migraciones SQL en /database/migrations)
```

## Capas dentro de cada módulo

| Capa | Archivo | Responsabilidad |
|---|---|---|
| Rutas | `*.routes.ts` | Qué URL, qué método y qué roles pueden usarla. |
| Controlador | `*.controller.ts` | Valida la entrada y delega. No toca la base de datos. |
| Servicio | `*.service.ts` | **Reglas de negocio** (RN-XX) y permisos. Orquesta repositorios y transacciones. |
| Repositorio | `*.repository.ts` | Único lugar con SQL. Devuelve datos, no decide reglas. |
| Dominio | `domain/*.ts` | Funciones puras de reglas (reembolsos, franjas, suspensiones). Sin base de datos ni Express: se prueban sin infraestructura. |
| DTO | `*.dto.ts` | Esquemas de entrada y tipos de salida. |
| API pública | `index.ts` | Lo único que otros módulos pueden importar. |

## Cómo se hablan los módulos

Dependencias permitidas (una flecha significa "puede llamar al `index.ts` de"):

```
 venues        (independiente)
 teams         (independiente)
 bookings    → venues
 payments    → bookings
 matchmaking → bookings, teams, payments
 ratings     → bookings, matchmaking
 admin       → venues, bookings, payments, auth
 notifications  (solo escucha eventos; no importa a nadie)
```

**Evitar ciclos con eventos.** `payments` necesita datos de `bookings`, pero `bookings` debe confirmarse cuando se paga el abono.
En lugar de que `bookings` importe a `payments`, este publica el evento `PagoRegistrado` en `shared/events/eventBus.ts` y `bookings` lo escucha.
Lo mismo ocurre con las notificaciones: `bookings` publica `ReservaConfirmada` y `notifications` reacciona.

## Reglas de arquitectura (se verifican en el CI)

`npm run check:boundaries` falla si alguien rompe una de estas reglas:

1. Un módulo solo importa de otro módulo a través de su `index.ts`.
2. `shared/` no conoce ningún módulo.
3. `infrastructure/` no conoce ningún módulo.
4. `jobs/` solo usa la API pública (`index.ts`) de los módulos.
5. `domain/` no usa base de datos ni middleware.
6. Un controlador no accede a un repositorio ni a la base de datos.
7. No hay dependencias circulares.

## Decisiones técnicas

| Decisión | Motivo |
|---|---|
| **PostgreSQL** (no MySQL) | RN-01 se garantiza con una restricción de exclusión (`EXCLUDE USING gist`) que MySQL no tiene; también sirve para tarifas sin cruces. |
| **SQL plano en `database/migrations`** | Respeta la carpeta `/database` de HT-01 y permite restricciones avanzadas. `npm run migrate` aplica cada archivo en una transacción. |
| **`pg` sin ORM** | El SQL es explícito y vive solo en los repositorios. |
| **JWT sin estado (2 h)** | Permite varias instancias del backend sin sesiones compartidas (HT-04). |
| **`CHECK` en lugar de `ENUM`** | Cambiar los valores permitidos es una migración simple. |
| **Franjas horarias no se guardan** | Se calculan: horario − reservas − bloqueos (decisión del modelo E-R). |
| **Pagos detrás de una interfaz** | `PaymentGateway` tiene una implementación simulada hoy y Wompi/PayU después (HT-08). |
| **Correo detrás de una interfaz** | `Mailer` permite cambiar a SMTP sin tocar los módulos (HT-07). |

## Orden de las migraciones

Sigue las dependencias entre tablas: `Pago` referencia a `Equipo` (pago dividido, HU-26), por eso `004_equipos.sql` va antes de `005_pagos_reembolsos.sql`.
`ReservaRecurrente` se crea antes que `Reserva` dentro de `003_reservas.sql` porque `Reserva` la referencia.

## Límites conocidos

- **Tareas programadas en el mismo proceso** (HT-06): con varias instancias del backend se ejecutarían duplicadas. Hacerlas idempotentes y, más adelante, usar una cola o un bloqueo en la base de datos.
- **Bus de eventos en memoria**: no sobrevive a un reinicio. Lo que no pueda perderse (un pago) debe quedar como estado en la base de datos.
- **Base de datos compartida**: los módulos se acoplan por llaves foráneas; extraer uno a un servicio aparte costaría trabajo de datos.
- **Escalar carga** depende de índices, consultas de disponibilidad eficientes y, si hace falta, caché; no de reorganizar carpetas.
