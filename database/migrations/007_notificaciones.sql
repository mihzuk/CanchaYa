-- EP-07 · Notificaciones y alertas: Notificacion, PreferenciaAlerta

CREATE TABLE notificacion (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id      BIGINT       NOT NULL REFERENCES usuario (id),
  tipo            VARCHAR(40)  NOT NULL,
  titulo          VARCHAR(120) NOT NULL,
  mensaje         VARCHAR(500) NOT NULL,
  leida           BOOLEAN      NOT NULL DEFAULT FALSE,
  referencia_tipo VARCHAR(30),   -- referencia polimórfica sin FK física (reserva, partido, pago...)
  referencia_id   BIGINT,
  fecha           TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX notificacion_usuario_idx  ON notificacion (usuario_id, fecha DESC);
CREATE INDEX notificacion_no_leida_idx ON notificacion (usuario_id) WHERE NOT leida;
-- Evita duplicar recordatorios/alertas generados por las tareas programadas.
CREATE UNIQUE INDEX notificacion_unica_ref ON notificacion (usuario_id, tipo, referencia_tipo, referencia_id)
  WHERE tipo IN ('recordatorio_partido', 'alerta_sin_rival', 'alerta_partido_compatible');

-- HU-29: dias = lista de días de la semana ISO (ej. '1,3,5').
CREATE TABLE preferencia_alerta (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id  BIGINT       NOT NULL REFERENCES usuario (id),
  equipo_id   BIGINT       REFERENCES equipo (id),
  dias        VARCHAR(20)  NOT NULL CHECK (dias ~ '^[1-7](,[1-7]){0,6}$'),
  hora_inicio TIME         NOT NULL,
  hora_fin    TIME         NOT NULL,
  zona        VARCHAR(100),
  nivel       VARCHAR(20)  CHECK (nivel IN ('principiante', 'intermedio', 'avanzado')),
  tipo_futbol SMALLINT     CHECK (tipo_futbol IN (5, 6, 7, 8, 11)),
  activa      BOOLEAN      NOT NULL DEFAULT TRUE,
  CONSTRAINT preferencia_rango_valido CHECK (hora_fin > hora_inicio)
);

CREATE INDEX preferencia_activa_idx ON preferencia_alerta (usuario_id) WHERE activa;
