-- HU-07 criterio 2: una fecha especial puede reemplazar el horario habitual por "cerrado todo el día"
-- (p. ej. 25 de diciembre). Un día cerrado no tiene horas ni turnos.

ALTER TABLE horario_atencion
  ADD COLUMN cerrado BOOLEAN NOT NULL DEFAULT FALSE,
  ALTER COLUMN hora_apertura DROP NOT NULL,
  ALTER COLUMN hora_cierre DROP NOT NULL,
  ALTER COLUMN duracion_turno_min DROP NOT NULL,
  DROP CONSTRAINT horario_rango_valido;

ALTER TABLE horario_atencion
  -- Solo una fecha especial puede estar cerrada (el horario habitual de un día cerrado simplemente no existe).
  ADD CONSTRAINT horario_cerrado_solo_especial CHECK (NOT cerrado OR fecha_especial IS NOT NULL),
  ADD CONSTRAINT horario_rango_valido CHECK (
    (cerrado AND hora_apertura IS NULL AND hora_cierre IS NULL AND duracion_turno_min IS NULL)
    OR (NOT cerrado AND hora_apertura IS NOT NULL AND hora_cierre IS NOT NULL AND duracion_turno_min IS NOT NULL
        AND hora_cierre > hora_apertura)
  );
