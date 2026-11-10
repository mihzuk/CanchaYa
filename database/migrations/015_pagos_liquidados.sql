-- Correcciones del Sprint 4 (revisión independiente).

-- HU-26.3 / RN-05: lo que pierde un equipo al salir de un partido queda marcado. Sigue contando como
-- pago de la reserva, pero ya no es del equipo (no cuenta como su parte) ni del dueño (no recibe
-- devoluciones de excedentes ni se le reembolsa si el dueño cancela o reprograma).
ALTER TABLE pago ADD COLUMN liquidado BOOLEAN NOT NULL DEFAULT FALSE;

-- RN-08: las inasistencias que ya causaron una suspensión no vuelven a contar para la siguiente.
ALTER TABLE inasistencia_equipo ADD COLUMN cuenta BOOLEAN NOT NULL DEFAULT TRUE;
