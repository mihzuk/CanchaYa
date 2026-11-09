-- EP-08 · Calificaciones y reputación: CalificacionComplejo, CalificacionEquipo
-- Los promedios (estrellas, fair play) se calculan, no se almacenan.

CREATE TABLE calificacion_complejo (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reserva_id  BIGINT       NOT NULL UNIQUE REFERENCES reserva (id),   -- RN-12: una por reserva; si existe se edita
  usuario_id  BIGINT       NOT NULL REFERENCES usuario (id),
  complejo_id BIGINT       NOT NULL REFERENCES complejo (id),
  estrellas   SMALLINT     NOT NULL CHECK (estrellas BETWEEN 1 AND 5),
  comentario  VARCHAR(500),
  fecha       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX calificacion_complejo_idx ON calificacion_complejo (complejo_id);

CREATE TABLE calificacion_equipo (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  partido_abierto_id    BIGINT       NOT NULL REFERENCES partido_abierto (id),
  equipo_calificador_id BIGINT       NOT NULL REFERENCES equipo (id),
  equipo_calificado_id  BIGINT       NOT NULL REFERENCES equipo (id),
  puntualidad           SMALLINT     CHECK (puntualidad BETWEEN 1 AND 5),
  fair_play             SMALLINT     CHECK (fair_play BETWEEN 1 AND 5),
  no_se_presento        BOOLEAN      NOT NULL DEFAULT FALSE,
  confirmado_por_admin  BOOLEAN      NOT NULL DEFAULT FALSE,   -- RN-08: la inasistencia cuenta al confirmarla
  comentario            VARCHAR(500),
  fecha                 TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT calificacion_equipo_uk UNIQUE (partido_abierto_id, equipo_calificador_id),  -- RN-12
  CONSTRAINT calificacion_equipos_distintos CHECK (equipo_calificador_id <> equipo_calificado_id),
  CONSTRAINT calificacion_con_puntaje CHECK (no_se_presento OR (puntualidad IS NOT NULL AND fair_play IS NOT NULL))
);

CREATE INDEX calificacion_equipo_calificado_idx ON calificacion_equipo (equipo_calificado_id);
