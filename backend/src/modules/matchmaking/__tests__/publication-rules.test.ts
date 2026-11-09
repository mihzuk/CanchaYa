import { describe, expect, it } from 'vitest';
import { instanteBogota } from '../../../shared/utils/time';
import { cuposValidos, maximoDeCupos, reservaDentroDeLoPedido, trasAceptarJugador, validarPublicacion } from '../domain/publication-rules';

const base = { estadoReserva: 'confirmada', fecha: '2026-11-20', horaInicio: '18:00', horasMinimas: 3 };

describe('publicación (RN-09)', () => {
  it('acepta una reserva confirmada o pagada con 3 horas o más de anticipación', () => {
    expect(validarPublicacion({ ...base, ahora: instanteBogota('2026-11-20', '15:00') })).toBeNull();
    expect(validarPublicacion({ ...base, estadoReserva: 'pagada', ahora: instanteBogota('2026-11-20', '10:00') })).toBeNull();
  });

  it('rechaza con menos de 3 horas', () => {
    expect(validarPublicacion({ ...base, ahora: instanteBogota('2026-11-20', '15:01') })).toBe('ANTICIPACION_INSUFICIENTE');
  });

  it.each(['pendiente_pago', 'cancelada', 'expirada', 'completada', 'no_asistio'])('rechaza una reserva %s', (estadoReserva) => {
    expect(validarPublicacion({ ...base, estadoReserva, ahora: instanteBogota('2026-11-19', '10:00') })).toBe('RESERVA_NO_CONFIRMADA');
  });
});

describe('cupos (RN-10, HU-25)', () => {
  it('no superan el tamaño de la modalidad: 10 en fútbol 5, 22 en fútbol 11', () => {
    expect(maximoDeCupos(5)).toBe(10);
    expect(cuposValidos(10, 5)).toBe(true);
    expect(cuposValidos(11, 5)).toBe(false);
    expect(cuposValidos(22, 11)).toBe(true);
    expect(cuposValidos(0, 5)).toBe(false);
    expect(cuposValidos(1.5, 5)).toBe(false);
  });

  it('aceptar un jugador descuenta un cupo y el último cierra el anuncio', () => {
    expect(trasAceptarJugador(2)).toEqual({ cupos: 1, estado: 'buscando' });
    expect(trasAceptarJugador(1)).toEqual({ cupos: 0, estado: 'completo' });
  });
});

describe('busco partido sin cancha (HU-22.4)', () => {
  const pedido = { fechaPreferida: '2026-11-20', rangoHoraInicio: '18:00', rangoHoraFin: '21:00' };

  it('la reserva debe caer dentro de la fecha y el rango pedidos', () => {
    expect(reservaDentroDeLoPedido({ fecha: '2026-11-20', horaInicio: '18:00', horaFin: '19:00' }, pedido)).toBe(true);
    expect(reservaDentroDeLoPedido({ fecha: '2026-11-20', horaInicio: '20:00', horaFin: '21:00' }, pedido)).toBe(true);
    expect(reservaDentroDeLoPedido({ fecha: '2026-11-20', horaInicio: '20:30', horaFin: '21:30' }, pedido)).toBe(false);
    expect(reservaDentroDeLoPedido({ fecha: '2026-11-20', horaInicio: '17:00', horaFin: '18:00' }, pedido)).toBe(false);
    expect(reservaDentroDeLoPedido({ fecha: '2026-11-21', horaInicio: '18:00', horaFin: '19:00' }, pedido)).toBe(false);
  });
});
