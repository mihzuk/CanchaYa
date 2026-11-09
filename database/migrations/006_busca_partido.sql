-- EP-06 · Busca Equipo / Busca Partido: PartidoAbierto, PostulacionRival, InscripcionJugador, MensajePartido

CREATE TABLE partido_abierto (
  id                       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reserva_id               BIGINT         UNIQUE REFERENCES reserva (id),   -- NULL en "busco partido sin cancha" (HU-22)
  equipo_publicador_id     BIGINT         NOT NULL REFERENCES equipo (id),
  equipo_rival_id          BIGINT         REFERENCES equipo (id),
  modalidad                VARCHAR(30)    NOT NULL CHECK (modalidad IN ('busco_rival', 'faltan_jugadores', 'busco_partido_sin_cancha')),
  nivel_buscado            VARCHAR(20)    NOT NULL CHECK (nivel_buscado IN ('principiante', 'intermedio', 'avanzado')),
  fecha_preferida          DATE,
  rango_hora_inicio        TIME,
  rango_hora_fin           TIME,
  zona                     VARCHAR(100),
  cupos_disponibles        SMALLINT       CHECK (cupos_disponibles >= 0),
  aporte_por_jugador       DECIMAL(12, 2) CHECK (aporte_por_jugador >= 0),
  porcentaje_pago_rival    DECIMAL(5, 2)  NOT NULL DEFAULT 50 CHECK (porcentaje_pago_rival >= 0 AND porcentaje_pago_rival <= 100),
  aceptacion_automatica    BOOLEAN        NOT NULL DEFAULT FALSE,
  descripcion              VARCHAR(255),
  estado                   VARCHAR(20)    NOT NULL DEFAULT 'buscando' CHECK (estado IN ('buscando', 'rival_confirmado', 'completo', 'cancelado', 'jugado')),
  goles_publicador         SMALLINT       CHECK (goles_publicador >= 0),
  goles_rival              SMALLINT       CHECK (goles_rival >= 0),
  marcador_conf_publicador BOOLEAN        NOT NULL DEFAULT FALSE,
  marcador_conf_rival      BOOLEAN        NOT NULL DEFAULT FALSE,
  fecha_rival_confirmado   TIMESTAMPTZ,                                     -- HU-26: plazo de 2 h para el abono del rival
  alerta_sin_rival_enviada BOOLEAN        NOT NULL DEFAULT FALSE,           -- HU-22.3: la alerta de 6 h se envía una sola vez
  fecha_publicacion        TIMESTAMPTZ    NOT NULL DEFAULT now(),
  CONSTRAINT partido_equipos_distintos CHECK (equipo_publicador_id <> equipo_rival_id),
  CONSTRAINT partido_sin_cancha CHECK (
    (modalidad = 'busco_partido_sin_cancha') = (reserva_id IS NULL)
  ),
  CONSTRAINT partido_rango_horas CHECK (rango_hora_fin IS NULL OR rango_hora_inicio IS NULL OR rango_hora_fin > rango_hora_inicio)
);

CREATE INDEX partido_estado_idx    ON partido_abierto (estado);
CREATE INDEX partido_publicador_idx ON partido_abierto (equipo_publicador_id);
CREATE INDEX partido_rival_idx      ON partido_abierto (equipo_rival_id);

CREATE TABLE postulacion_rival (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  partido_abierto_id BIGINT      NOT NULL REFERENCES partido_abierto (id),
  equipo_id          BIGINT      NOT NULL REFERENCES equipo (id),
  estado             VARCHAR(20) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aceptada', 'rechazada', 'anulada')),
  fecha              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT postulacion_uk UNIQUE (partido_abierto_id, equipo_id)
);

-- RN-10: solo una postulación aceptada por partido.
CREATE UNIQUE INDEX postulacion_una_aceptada ON postulacion_rival (partido_abierto_id) WHERE estado = 'aceptada';

CREATE TABLE inscripcion_jugador (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  partido_abierto_id BIGINT      NOT NULL REFERENCES partido_abierto (id),
  usuario_id         BIGINT      NOT NULL REFERENCES usuario (id),
  posicion           VARCHAR(20) CHECK (posicion IN ('arquero', 'defensa', 'medio', 'delantero')),
  estado             VARCHAR(20) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aceptada', 'rechazada')),
  fecha              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT inscripcion_uk UNIQUE (partido_abierto_id, usuario_id)
);

CREATE TABLE mensaje_partido (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  partido_abierto_id BIGINT      NOT NULL REFERENCES partido_abierto (id),
  usuario_id         BIGINT      NOT NULL REFERENCES usuario (id),
  contenido          TEXT        NOT NULL CHECK (length(contenido) BETWEEN 1 AND 1000),
  fecha_envio        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX mensaje_partido_idx ON mensaje_partido (partido_abierto_id, fecha_envio);
