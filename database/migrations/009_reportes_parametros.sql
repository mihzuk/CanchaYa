-- EP-09 · Administración de la plataforma: ReporteUsuario, ParametroSistema

CREATE TABLE reporte_usuario (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reportante_id BIGINT       NOT NULL REFERENCES usuario (id),
  reportado_id  BIGINT       NOT NULL REFERENCES usuario (id),
  motivo        VARCHAR(255) NOT NULL,
  estado        VARCHAR(20)  NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto', 'atendido', 'descartado')),
  resolucion    VARCHAR(255),
  fecha         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT reporte_usuarios_distintos CHECK (reportante_id <> reportado_id)
);

CREATE INDEX reporte_usuario_estado_idx ON reporte_usuario (estado);

CREATE TABLE parametro_sistema (
  id                  INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  clave               VARCHAR(60)  NOT NULL UNIQUE,
  valor               VARCHAR(100) NOT NULL,
  descripcion         VARCHAR(255),
  fecha_actualizacion TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Valores por defecto de las reglas de negocio (HU-33.3: aplican a las nuevas reservas).
INSERT INTO parametro_sistema (clave, valor, descripcion) VALUES
  ('retencion_reserva_min', '15',  'RN-02: minutos que se retiene una reserva sin pago'),
  ('abono_pct_defecto',     '50',  'RN-03: porcentaje de abono por defecto'),
  ('reembolso_pct_24h',     '100', 'RN-05: reembolso al cancelar con más de 24 h'),
  ('reembolso_pct_6h',      '50',  'RN-05: reembolso al cancelar entre 6 y 24 h'),
  ('dias_anticipacion_max', '30',  'RN-06: días máximos de anticipación para reservar'),
  ('horas_min_publicacion', '3',   'RN-09: horas mínimas antes del partido para publicar'),
  ('plazo_pago_rival_horas','2',   'HU-26: horas para que el rival pague su abono'),
  ('inasistencias_suspension','3', 'RN-08: inasistencias en 60 días que suspenden'),
  ('dias_suspension',       '15',  'RN-08: días de suspensión de Busca Partido');
