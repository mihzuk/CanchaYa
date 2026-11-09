-- EP-04 · Pagos y reembolsos: Pago, Reembolso

CREATE TABLE pago (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reserva_id BIGINT         NOT NULL REFERENCES reserva (id),
  usuario_id BIGINT         REFERENCES usuario (id),   -- NULL si el cliente de una reserva manual no tiene cuenta
  equipo_id  BIGINT         REFERENCES equipo (id),    -- HU-26: qué equipo paga su parte
  valor      DECIMAL(12, 2) NOT NULL CHECK (valor > 0),
  tipo       VARCHAR(20)    NOT NULL CHECK (tipo IN ('abono', 'saldo', 'aporte_jugador')),
  metodo     VARCHAR(20)    NOT NULL CHECK (metodo IN ('tarjeta', 'pse', 'nequi', 'efectivo', 'transferencia')),
  referencia VARCHAR(80)    UNIQUE,
  estado     VARCHAR(20)    NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aprobado', 'rechazado', 'reembolsado')),
  fecha      TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX pago_reserva_idx ON pago (reserva_id);
CREATE INDEX pago_fecha_idx   ON pago (fecha);
CREATE INDEX pago_usuario_idx ON pago (usuario_id);

-- RN-05: >24 h = 100 %, 6-24 h = 50 %, <6 h = 0 % (no se crea reembolso).
CREATE TABLE reembolso (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pago_id           BIGINT         NOT NULL UNIQUE REFERENCES pago (id),
  valor             DECIMAL(12, 2) NOT NULL CHECK (valor > 0),
  porcentaje        DECIMAL(5, 2)  NOT NULL CHECK (porcentaje > 0 AND porcentaje <= 100),
  motivo            VARCHAR(150)   NOT NULL,
  estado            VARCHAR(20)    NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'reembolsado')),
  fecha_solicitud   TIMESTAMPTZ    NOT NULL DEFAULT now(),
  fecha_resolucion  TIMESTAMPTZ,
  CONSTRAINT reembolso_resuelto CHECK (estado <> 'reembolsado' OR fecha_resolucion IS NOT NULL)
);

CREATE INDEX reembolso_estado_idx ON reembolso (estado);
