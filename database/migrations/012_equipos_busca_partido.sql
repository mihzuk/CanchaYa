-- EP-05 / EP-06: ajustes del Sprint 3 que el esquema inicial no permitía.

-- HU-21.2: la capitanía cambia cuando el otro miembro acepta; mientras tanto queda propuesta.
ALTER TABLE equipo ADD COLUMN capitan_propuesto_id BIGINT REFERENCES usuario (id);

-- HU-22.4: un "busco partido sin cancha" recibe después la reserva del equipo que lo acepta.
-- Las demás modalidades siempre tienen reserva.
ALTER TABLE partido_abierto DROP CONSTRAINT partido_sin_cancha;
ALTER TABLE partido_abierto ADD CONSTRAINT partido_con_reserva
  CHECK (modalidad = 'busco_partido_sin_cancha' OR reserva_id IS NOT NULL);

-- Una reserva puede volver a publicarse si su partido anterior se canceló.
ALTER TABLE partido_abierto DROP CONSTRAINT partido_abierto_reserva_id_key;
CREATE UNIQUE INDEX partido_reserva_activa_uk ON partido_abierto (reserva_id)
  WHERE reserva_id IS NOT NULL AND estado <> 'cancelado';

CREATE INDEX invitacion_equipo_idx ON invitacion_equipo (equipo_id) WHERE estado = 'pendiente';
CREATE INDEX postulacion_partido_idx ON postulacion_rival (partido_abierto_id) WHERE estado = 'pendiente';
CREATE INDEX inscripcion_partido_idx ON inscripcion_jugador (partido_abierto_id) WHERE estado = 'pendiente';
