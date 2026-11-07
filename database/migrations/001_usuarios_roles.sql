-- EP-01 · Usuarios y autenticación: Rol, Usuario, TokenUsuario
-- Convenciones: tablas y columnas en español snake_case; CHECK en lugar de ENUM (docs/arquitectura.md).

CREATE TABLE rol (
  id     INT         PRIMARY KEY,
  nombre VARCHAR(30) NOT NULL UNIQUE
);

INSERT INTO rol (id, nombre) VALUES
  (1, 'Jugador'),
  (2, 'AdminComplejo'),
  (3, 'Superadmin');

CREATE TABLE usuario (
  id                       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rol_id                   INT          NOT NULL DEFAULT 1 REFERENCES rol (id),
  username                 VARCHAR(30)  NOT NULL,
  correo                   VARCHAR(150) NOT NULL,
  contrasena_hash          VARCHAR(255) NOT NULL,                 -- RNF-01: bcrypt, nunca texto plano
  nombres                  VARCHAR(80)  NOT NULL,
  apellidos                VARCHAR(80)  NOT NULL,
  celular                  VARCHAR(20)  NOT NULL,
  fecha_nacimiento         DATE         NOT NULL,
  foto_url                 VARCHAR(255),
  posicion_preferida       VARCHAR(20)  CHECK (posicion_preferida IN ('arquero', 'defensa', 'medio', 'delantero')),
  nivel                    VARCHAR(20)  CHECK (nivel IN ('principiante', 'intermedio', 'avanzado')),
  estado                   VARCHAR(20)  NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'suspendido', 'desactivado')),
  correo_verificado        BOOLEAN      NOT NULL DEFAULT FALSE,
  acepta_tratamiento_datos BOOLEAN      NOT NULL CHECK (acepta_tratamiento_datos),  -- RNF-03, Ley 1581 de 2012
  intentos_fallidos        SMALLINT     NOT NULL DEFAULT 0 CHECK (intentos_fallidos >= 0),
  bloqueado_hasta          TIMESTAMPTZ,                           -- HU-02: 5 intentos -> ahora + 15 min
  -- Al cambiar o restablecer la contraseña, los JWT emitidos antes de esta fecha dejan de valer.
  credenciales_desde       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  fecha_registro           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT usuario_correo_minusculas CHECK (correo = lower(correo))
);

-- Únicos sin distinguir mayúsculas.
CREATE UNIQUE INDEX usuario_correo_uk   ON usuario (correo);
CREATE UNIQUE INDEX usuario_username_uk ON usuario (lower(username));
CREATE INDEX usuario_rol_idx ON usuario (rol_id);

CREATE TABLE token_usuario (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id       BIGINT       NOT NULL REFERENCES usuario (id) ON DELETE CASCADE,
  tipo             VARCHAR(30)  NOT NULL CHECK (tipo IN ('verificacion_correo', 'recuperacion_clave')),
  token_hash       VARCHAR(255) NOT NULL UNIQUE,   -- SHA-256 del token: el token en claro solo viaja en el correo
  fecha_expiracion TIMESTAMPTZ  NOT NULL,
  usado            BOOLEAN      NOT NULL DEFAULT FALSE,
  fecha_creacion   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX token_usuario_usuario_idx ON token_usuario (usuario_id, tipo);
