# Convenciones del equipo

Acuerdos para que 4 personas trabajen en el mismo repositorio sin pisarse. Complementan la Definition of Done del README.

## Ramas y pull requests (HT-01)

- `main`: siempre estable y desplegable. `develop`: integración. `feature/HU-XX-descripcion-corta`: una rama por historia.
- Nadie sube directo a `main` ni a `develop`: todo entra por **pull request**.
- Cada PR lleva la historia (`HU-XX`) en el título, usa la plantilla de `.github/pull_request_template.md` y necesita **al menos una revisión de un compañero** y el **CI en verde**.
- PR pequeños y frecuentes: una historia, o una parte de ella, no un sprint completo.

## Commits

Formato `tipo(módulo): descripción en español`, con el código de la historia cuando aplique.

```
feat(bookings): validar cruces de reserva en la base de datos (HU-11)
fix(auth): bloquear la cuenta tras 5 intentos fallidos (HU-02)
docs(arquitectura): aclarar el orden de las migraciones
test(payments): cubrir la política de reembolso (RN-05)
```

Tipos: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`.

## Nombres

| Qué | Convención | Ejemplo |
|---|---|---|
| Módulos y archivos de código | Inglés, `kebab-case` o `camelCase` según el tipo | `bookings.service.ts`, `refund-policy.ts` |
| Tablas y columnas | Español, `snake_case`, como en el modelo E-R | `reserva`, `fecha_expiracion` |
| JSON de la API | Español, `camelCase` | `fechaInicio`, `porcentajeAbono` |
| Reglas de negocio en el código | Comentario con el código de la regla | `// RN-02` |
| Mensajes al usuario | Español claro (RNF-09) | "El correo ya está en uso" |

## Cómo no pisarse

- **Cada historia, una rama.** Dos personas no trabajan en el mismo archivo a la vez salvo que lo hayan hablado.
- **Archivos compartidos** (`app.ts`, `router.tsx`, `shared/`, `components/ui/`): cambios pequeños, en su propio PR y avisando al equipo.
- **Migraciones:** el número ya está asignado por épica (`003_reservas.sql`). Si un cambio nuevo necesita otra migración, usar el **siguiente número libre** después de hacer `git pull`. Nunca editar una migración ya integrada: se crea una nueva.
- **Dependencias entre módulos:** solo por `index.ts` y por eventos. Si el CI falla con `check:boundaries`, no se desactiva la regla: se reorganiza la dependencia.

## Checklist para implementar una historia

1. Crear la rama `feature/HU-XX`.
2. Migración SQL (si hay tablas nuevas) y actualizar el modelo E-R.
3. Repositorio → servicio (con las reglas RN-XX validadas en el backend) → controlador y ruta.
4. Pruebas unitarias de las reglas en `domain/` y de integración de la API.
5. Documentar los endpoints en `backend/openapi.yaml`.
6. Pantalla en `frontend/src/features/<módulo>`, responsive y con mensajes de error en español.
7. Ejecutar `npm test`, `npm run typecheck` y `npm run check:boundaries` en `backend`, y `npm run build` en `frontend`.
8. Abrir el pull request con la plantilla.

## Variables de entorno

Los secretos (`JWT_SECRET`, contraseñas, claves de pasarela) viven en `.env`, que **nunca se sube**. Toda variable nueva se agrega también a `.env.example` y a `backend/src/shared/config/env.ts`.
