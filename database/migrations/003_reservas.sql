-- EP-03 · Reservas: ReservaRecurrente, Reserva
-- ReservaRecurrente va primero porque Reserva la referencia.

CREATE TABLE reserva_recurrente (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id     BIGINT      NOT NULL REFERENCES usuario (id),
  cancha_id      BIGINT      NOT NULL REFERENCES cancha (id),
  dia_semana     SMALLINT    NOT NULL CHECK (dia_semana BETWEEN 1 AND 7),
  hora_inicio    TIME        NOT NULL,
  numero_semanas SMALLINT    NOT NULL CHECK (numero_semanas IN (4, 8, 12)),  -- HU-15
  fecha_inicio   DATE        NOT NULL,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX reserva_recurrente_usuario_idx ON reserva_recurrente (usuario_id);

-- fecha + hora_inicio/hora_fin están en hora local de Bogotá (RNF-09).
CREATE TABLE reserva (
  id                     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo                 VARCHAR(12)    NOT NULL UNIQUE,
  usuario_id             BIGINT         REFERENCES usuario (id),
  cancha_id              BIGINT         NOT NULL REFERENCES cancha (id),
  reserva_recurrente_id  BIGINT         REFERENCES reserva_recurrente (id),
  reprogramada_de_id     BIGINT         REFERENCES reserva (id),          -- HU-12: reserva original cuyo abono se traslada
  fecha                  DATE           NOT NULL,
  hora_inicio            TIME           NOT NULL,
  hora_fin               TIME           NOT NULL,
  precio_total           DECIMAL(12, 2) NOT NULL CHECK (precio_total >= 0),   -- RN-04: copia fija de la tarifa
  abono_requerido        DECIMAL(12, 2) NOT NULL CHECK (abono_requerido >= 0),
  saldo_pendiente        DECIMAL(12, 2) NOT NULL CHECK (saldo_pendiente >= 0),
  estado                 VARCHAR(20)    NOT NULL DEFAULT 'pendiente_pago' CHECK (estado IN (
                           'pendiente_pago', 'confirmada', 'pagada', 'cancelada', 'expirada', 'completada', 'no_asistio')),
  origen                 VARCHAR(10)    NOT NULL CHECK (origen IN ('web', 'manual')),
  nombre_cliente_manual  VARCHAR(120),
  celular_cliente_manual VARCHAR(20),
  motivo_cancelacion     VARCHAR(255),
  fecha_creacion         TIMESTAMPTZ    NOT NULL DEFAULT now(),
  fecha_expiracion       TIMESTAMPTZ,                                      -- RN-02: creación + 15 min
  fecha_cancelacion      TIMESTAMPTZ,
  CONSTRAINT reserva_rango_valido   CHECK (hora_fin > hora_inicio),
  CONSTRAINT reserva_abono_valido   CHECK (abono_requerido <= precio_total AND saldo_pendiente <= precio_total),
  CONSTRAINT reserva_origen_web     CHECK (origen <> 'web' OR usuario_id IS NOT NULL),
  CONSTRAINT reserva_origen_manual  CHECK (origen <> 'manual' OR nombre_cliente_manual IS NOT NULL),
  -- RN-01 / RNF-05: una cancha no puede tener dos reservas activas que se crucen.
  CONSTRAINT reserva_sin_cruces EXCLUDE USING gist (
    cancha_id WITH =,
    tsrange(fecha + hora_inicio, fecha + hora_fin, '[)') WITH &&
  ) WHERE (estado IN ('pendiente_pago', 'confirmada', 'pagada'))
);

-- HT-02: índices de búsqueda frecuente (fecha, cancha, estado).
CREATE INDEX reserva_cancha_fecha_idx ON reserva (cancha_id, fecha);
CREATE INDEX reserva_fecha_idx        ON reserva (fecha);
CREATE INDEX reserva_estado_idx       ON reserva (estado);
CREATE INDEX reserva_usuario_idx      ON reserva (usuario_id, fecha);
CREATE INDEX reserva_expiracion_idx   ON reserva (fecha_expiracion) WHERE estado = 'pendiente_pago';
CREATE INDEX reserva_recurrente_idx   ON reserva (reserva_recurrente_id) WHERE reserva_recurrente_id IS NOT NULL;
