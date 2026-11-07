-- Datos de prueba (HT-02 criterio 4). SOLO PARA DESARROLLO: nunca ejecutar en producción.
-- Todas las cuentas usan la contraseña: CanchaYa2026
-- Idempotente: si los datos ya existen no hace nada.

DO $$
DECLARE
  clave CONSTANT TEXT := '$2b$10$IZyczmxphSPg2MeMGUDj2uetdGNUDRhM42SnrmYvJGRMWDcbMmNWO';
  id_super BIGINT; id_admin1 BIGINT; id_admin2 BIGINT;
  id_c1 BIGINT; id_c2 BIGINT; id_c3 BIGINT;
  cancha BIGINT;
BEGIN
  IF EXISTS (SELECT 1 FROM usuario WHERE correo = 'superadmin@canchaya.local') THEN
    RAISE NOTICE 'Los datos de prueba ya existen';
    RETURN;
  END IF;

  -- Usuarios ------------------------------------------------------------------------------------
  INSERT INTO usuario (rol_id, username, correo, contrasena_hash, nombres, apellidos, celular, fecha_nacimiento,
                       correo_verificado, acepta_tratamiento_datos)
  VALUES (3, 'superadmin', 'superadmin@canchaya.local', clave, 'Super', 'Administrador', '3000000000', '1990-01-01', TRUE, TRUE)
  RETURNING id INTO id_super;

  INSERT INTO usuario (rol_id, username, correo, contrasena_hash, nombres, apellidos, celular, fecha_nacimiento,
                       correo_verificado, acepta_tratamiento_datos)
  VALUES (2, 'admin_norte', 'admin.norte@canchaya.local', clave, 'Administrador', 'Norte', '3000000001', '1985-04-12', TRUE, TRUE)
  RETURNING id INTO id_admin1;

  INSERT INTO usuario (rol_id, username, correo, contrasena_hash, nombres, apellidos, celular, fecha_nacimiento,
                       correo_verificado, acepta_tratamiento_datos)
  VALUES (2, 'admin_sur', 'admin.sur@canchaya.local', clave, 'Administrador', 'Sur', '3000000002', '1987-09-30', TRUE, TRUE)
  RETURNING id INTO id_admin2;

  INSERT INTO usuario (rol_id, username, correo, contrasena_hash, nombres, apellidos, celular, fecha_nacimiento,
                       posicion_preferida, nivel, correo_verificado, acepta_tratamiento_datos)
  VALUES
    (1, 'jugador1', 'jugador1@canchaya.local', clave, 'Jugador', 'Uno',    '3000000011', '1998-02-14', 'arquero',   'intermedio',   TRUE, TRUE),
    (1, 'jugador2', 'jugador2@canchaya.local', clave, 'Jugador', 'Dos',    '3000000012', '1999-06-21', 'defensa',   'avanzado',     TRUE, TRUE),
    (1, 'jugador3', 'jugador3@canchaya.local', clave, 'Jugador', 'Tres',   '3000000013', '2000-11-03', 'medio',     'principiante', TRUE, TRUE),
    (1, 'jugador4', 'jugador4@canchaya.local', clave, 'Jugador', 'Cuatro', '3000000014', '1997-08-09', 'delantero', 'intermedio',   TRUE, TRUE);

  -- Complejos -----------------------------------------------------------------------------------
  INSERT INTO complejo (admin_id, nombre, descripcion, direccion, ciudad, barrio, latitud, longitud, telefono, estado)
  VALUES (id_admin1, 'Sintéticas del Norte', 'Tres canchas con iluminación LED y cafetería.', 'Cra 15 # 120-30', 'Bogotá', 'Usaquén',
          4.701594, -74.035530, '6017654321', 'activo')
  RETURNING id INTO id_c1;

  INSERT INTO complejo (admin_id, nombre, descripcion, direccion, ciudad, barrio, latitud, longitud, telefono, porcentaje_abono, estado)
  VALUES (id_admin2, 'La Cancha del Sur', 'Canchas techadas, ideales para jugar con lluvia.', 'Av. 1 de Mayo # 30-15 Sur', 'Bogotá', 'Kennedy',
          4.628780, -74.140370, '6011234567', 40, 'activo')
  RETURNING id INTO id_c2;

  INSERT INTO complejo (admin_id, nombre, direccion, ciudad, barrio, telefono, estado)
  VALUES (id_admin2, 'Complejo Nuevo (pendiente)', 'Calle 80 # 50-10', 'Medellín', 'Robledo', '6045550000', 'pendiente')
  RETURNING id INTO id_c3;

  INSERT INTO complejo_servicio (complejo_id, servicio_id) VALUES
    (id_c1, 1), (id_c1, 2), (id_c1, 3), (id_c1, 5), (id_c2, 2), (id_c2, 4), (id_c2, 6);

  INSERT INTO foto_complejo (complejo_id, url, orden) VALUES
    (id_c1, 'https://images.unsplash.com/photo-1529900748604-07564a03e7a6?w=1200', 0),
    (id_c2, 'https://images.unsplash.com/photo-1575361204480-aadea25e6e68?w=1200', 0);

  -- Horarios: lunes a viernes 8:00-23:00, sábado y domingo 7:00-22:00, turnos de 60 minutos.
  INSERT INTO horario_atencion (complejo_id, dia_semana, hora_apertura, hora_cierre, duracion_turno_min)
  SELECT c, d, CASE WHEN d <= 5 THEN TIME '08:00' ELSE TIME '07:00' END, CASE WHEN d <= 5 THEN TIME '23:00' ELSE TIME '22:00' END, 60
    FROM unnest(ARRAY[id_c1, id_c2]) AS c, generate_series(1, 7) AS d;

  -- Canchas y tarifas (diurna, nocturna desde las 18:00 y fin de semana/festivo) -------------------
  FOR cancha IN
    INSERT INTO cancha (complejo_id, nombre, tipo_futbol, superficie, techada, iluminacion, capacidad_jugadores) VALUES
      (id_c1, 'Cancha 1', 5, 'Césped sintético', FALSE, TRUE, 10),
      (id_c1, 'Cancha 2', 5, 'Césped sintético', FALSE, TRUE, 10),
      (id_c1, 'Cancha 3', 7, 'Césped sintético', FALSE, TRUE, 14),
      (id_c2, 'Cancha A', 5, 'Césped sintético', TRUE,  TRUE, 10),
      (id_c2, 'Cancha B', 8, 'Césped sintético', TRUE,  TRUE, 16)
    RETURNING id
  LOOP
    INSERT INTO tarifa (cancha_id, tipo_dia, hora_inicio, hora_fin, precio) VALUES
      (cancha, 'semana',             '07:00', '18:00',  80000),
      (cancha, 'semana',             '18:00', '23:00', 120000),
      (cancha, 'fin_semana_festivo', '07:00', '23:00', 130000);
  END LOOP;

  INSERT INTO cancha (complejo_id, nombre, tipo_futbol, superficie, capacidad_jugadores)
  VALUES (id_c3, 'Cancha 1', 5, 'Césped sintético', 10);

  RAISE NOTICE 'Datos de prueba cargados';
END $$;
