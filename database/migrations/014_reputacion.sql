-- EP-06 / EP-08: registro de inasistencias con fecha y cancelaciones tardías.

-- HU-26.3: un rival que se retira con menos de 6 horas recibe una marca.
ALTER TABLE equipo ADD COLUMN cancelaciones_tardias SMALLINT NOT NULL DEFAULT 0 CHECK (cancelaciones_tardias >= 0);

-- RN-07 / RN-08: la suspensión cuenta inasistencias dentro de los últimos 60 días, así que cada una
-- necesita su fecha. Una por equipo y partido, para que un reintento no la cuente dos veces.
CREATE TABLE inasistencia_equipo (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  equipo_id          BIGINT      NOT NULL REFERENCES equipo (id),
  partido_abierto_id BIGINT      NOT NULL REFERENCES partido_abierto (id),
  fecha              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT inasistencia_equipo_uk UNIQUE (equipo_id, partido_abierto_id)
);

CREATE INDEX inasistencia_equipo_fecha_idx ON inasistencia_equipo (equipo_id, fecha DESC);
CREATE INDEX partido_rival_vence_idx ON partido_abierto (fecha_rival_confirmado) WHERE estado = 'rival_confirmado';
