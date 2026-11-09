-- EP-02 · Complejos, canchas y horarios:
-- Servicio, Complejo, ComplejoServicio, FotoComplejo, HorarioAtencion, Cancha, Tarifa, BloqueoHorario

CREATE EXTENSION IF NOT EXISTS btree_gist;  -- restricciones de exclusión con igualdad + rangos (RN-01, tarifas)

CREATE TABLE servicio (
  id     INT         PRIMARY KEY,
  nombre VARCHAR(60) NOT NULL UNIQUE
);

INSERT INTO servicio (id, nombre) VALUES
  (1, 'Parqueadero'),
  (2, 'Camerinos'),
  (3, 'Cafetería'),
  (4, 'Alquiler de petos'),
  (5, 'Alquiler de balón'),
  (6, 'Duchas'),
  (7, 'Wifi');

CREATE TABLE complejo (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_id         BIGINT        NOT NULL REFERENCES usuario (id),
  nombre           VARCHAR(120)  NOT NULL,
  descripcion      TEXT,
  direccion        VARCHAR(200)  NOT NULL,
  ciudad           VARCHAR(80)   NOT NULL,
  barrio           VARCHAR(80)   NOT NULL,
  latitud          DECIMAL(9, 6) CHECK (latitud BETWEEN -90 AND 90),
  longitud         DECIMAL(9, 6) CHECK (longitud BETWEEN -180 AND 180),
  telefono         VARCHAR(20)   NOT NULL,
  porcentaje_abono DECIMAL(5, 2) NOT NULL DEFAULT 50 CHECK (porcentaje_abono > 0 AND porcentaje_abono <= 100), -- RN-03
  estado           VARCHAR(20)   NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'activo', 'rechazado')),
  motivo_rechazo   VARCHAR(255),
  fecha_creacion   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT complejo_rechazo_con_motivo CHECK (estado <> 'rechazado' OR motivo_rechazo IS NOT NULL)
);

CREATE INDEX complejo_admin_idx  ON complejo (admin_id);
CREATE INDEX complejo_ciudad_idx ON complejo (lower(ciudad)) WHERE estado = 'activo';  -- HT-02: búsqueda por ciudad
CREATE INDEX complejo_estado_idx ON complejo (estado);

CREATE TABLE complejo_servicio (
  complejo_id BIGINT NOT NULL REFERENCES complejo (id) ON DELETE CASCADE,
  servicio_id INT    NOT NULL REFERENCES servicio (id),
  PRIMARY KEY (complejo_id, servicio_id)
);

CREATE TABLE foto_complejo (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  complejo_id BIGINT       NOT NULL REFERENCES complejo (id) ON DELETE CASCADE,
  url         VARCHAR(255) NOT NULL,
  orden       SMALLINT     NOT NULL DEFAULT 0
);

CREATE INDEX foto_complejo_complejo_idx ON foto_complejo (complejo_id, orden);

-- HU-07: horario habitual (dia_semana 1 = lunes ... 7 = domingo) o fecha especial que lo reemplaza.
-- Las franjas no se guardan: se calculan con apertura, cierre y duración del turno.
CREATE TABLE horario_atencion (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  complejo_id        BIGINT   NOT NULL REFERENCES complejo (id) ON DELETE CASCADE,
  dia_semana         SMALLINT CHECK (dia_semana BETWEEN 1 AND 7),
  fecha_especial     DATE,
  hora_apertura      TIME     NOT NULL,
  hora_cierre        TIME     NOT NULL,   -- '24:00' permitido para cerrar a medianoche
  duracion_turno_min SMALLINT NOT NULL CHECK (duracion_turno_min BETWEEN 30 AND 180),
  CONSTRAINT horario_uno_de_dos CHECK ((dia_semana IS NULL) <> (fecha_especial IS NULL)),
  CONSTRAINT horario_rango_valido CHECK (hora_cierre > hora_apertura)
);

CREATE UNIQUE INDEX horario_dia_uk   ON horario_atencion (complejo_id, dia_semana)     WHERE dia_semana IS NOT NULL;
CREATE UNIQUE INDEX horario_fecha_uk ON horario_atencion (complejo_id, fecha_especial) WHERE fecha_especial IS NOT NULL;

CREATE TABLE cancha (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  complejo_id         BIGINT      NOT NULL REFERENCES complejo (id),
  nombre              VARCHAR(60) NOT NULL,
  tipo_futbol         SMALLINT    NOT NULL CHECK (tipo_futbol IN (5, 6, 7, 8, 11)),
  superficie          VARCHAR(40) NOT NULL,
  techada             BOOLEAN     NOT NULL DEFAULT FALSE,
  iluminacion         BOOLEAN     NOT NULL DEFAULT FALSE,
  capacidad_jugadores SMALLINT    NOT NULL CHECK (capacidad_jugadores > 0),
  estado              VARCHAR(20) NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa', 'inactiva')),  -- HU-06: inactiva conserva historial
  CONSTRAINT cancha_nombre_uk UNIQUE (complejo_id, nombre)
);

CREATE INDEX cancha_tipo_idx ON cancha (tipo_futbol) WHERE estado = 'activa';

-- HU-08: tarifa por cancha, tipo de día y rango horario. Las tarifas activas de una cancha no se cruzan.
CREATE TABLE tarifa (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cancha_id   BIGINT         NOT NULL REFERENCES cancha (id),
  tipo_dia    VARCHAR(20)    NOT NULL CHECK (tipo_dia IN ('semana', 'fin_semana_festivo')),
  hora_inicio TIME           NOT NULL,
  hora_fin    TIME           NOT NULL,
  precio      DECIMAL(12, 2) NOT NULL CHECK (precio > 0),
  activa      BOOLEAN        NOT NULL DEFAULT TRUE,
  CONSTRAINT tarifa_rango_valido CHECK (hora_fin > hora_inicio),
  CONSTRAINT tarifa_sin_cruces EXCLUDE USING gist (
    cancha_id WITH =,
    tipo_dia WITH =,
    tsrange(DATE '2000-01-01' + hora_inicio, DATE '2000-01-01' + hora_fin, '[)') WITH &&
  ) WHERE (activa)
);

-- HU-09: bloqueo de una cancha en hora local de Bogotá (TIMESTAMP sin zona, igual que fecha + hora de Reserva).
CREATE TABLE bloqueo_horario (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cancha_id      BIGINT       NOT NULL REFERENCES cancha (id),
  creado_por_id  BIGINT       NOT NULL REFERENCES usuario (id),
  fecha_inicio   TIMESTAMP    NOT NULL,
  fecha_fin      TIMESTAMP    NOT NULL,
  motivo         VARCHAR(150) NOT NULL,
  fecha_creacion TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT bloqueo_rango_valido CHECK (fecha_fin > fecha_inicio)
);

CREATE INDEX bloqueo_cancha_rango_idx ON bloqueo_horario USING gist (cancha_id, tsrange(fecha_inicio, fecha_fin, '[)'));
