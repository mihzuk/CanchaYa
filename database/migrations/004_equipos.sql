-- EP-05 · Equipos: Equipo, MiembroEquipo, InvitacionEquipo
-- Va antes de pagos porque Pago referencia a Equipo (pago dividido, HU-26).

CREATE TABLE equipo (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  capitan_id       BIGINT       NOT NULL REFERENCES usuario (id),   -- fuente de verdad de la capitanía
  nombre           VARCHAR(60)  NOT NULL,
  escudo_url       VARCHAR(255),
  nivel            VARCHAR(20)  NOT NULL CHECK (nivel IN ('principiante', 'intermedio', 'avanzado')),
  tipo_futbol      SMALLINT     NOT NULL CHECK (tipo_futbol IN (5, 6, 7, 8, 11)),
  estado           VARCHAR(20)  NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'inactivo')),
  inasistencias    SMALLINT     NOT NULL DEFAULT 0 CHECK (inasistencias >= 0),
  suspendido_hasta TIMESTAMPTZ,                                       -- RN-08
  fecha_creacion   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX equipo_nombre_uk ON equipo (lower(nombre));    -- HU-19: nombre único
CREATE INDEX equipo_capitan_idx ON equipo (capitan_id);

CREATE TABLE miembro_equipo (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  equipo_id     BIGINT      NOT NULL REFERENCES equipo (id),
  usuario_id    BIGINT      NOT NULL REFERENCES usuario (id),
  rol_en_equipo VARCHAR(10) NOT NULL DEFAULT 'miembro' CHECK (rol_en_equipo IN ('capitan', 'miembro')),
  fecha_ingreso TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT miembro_equipo_uk UNIQUE (equipo_id, usuario_id)
);

CREATE INDEX miembro_equipo_usuario_idx ON miembro_equipo (usuario_id);

-- HU-20: invitación por enlace (token_enlace) o por usuario (usuario_invitado_id).
CREATE TABLE invitacion_equipo (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  equipo_id           BIGINT       NOT NULL REFERENCES equipo (id),
  usuario_invitado_id BIGINT       REFERENCES usuario (id),
  token_enlace        VARCHAR(100) UNIQUE,
  estado              VARCHAR(20)  NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aceptada', 'rechazada')),
  fecha               TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT invitacion_por_enlace_o_usuario CHECK ((usuario_invitado_id IS NULL) <> (token_enlace IS NULL))
);

CREATE INDEX invitacion_usuario_idx ON invitacion_equipo (usuario_invitado_id) WHERE estado = 'pendiente';
