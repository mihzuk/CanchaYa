import { describe, expect, it } from 'vitest';
import { combinarConReservas, distanciaKm, enRangoDeHoras, sugerirCercanas, type FranjaBase } from '../domain/availability';
import { calcularTraslado, puedeReprogramar } from '../domain/reschedule';

const franjas: FranjaBase[] = ['08:00', '09:00', '10:00', '11:00'].map((h, i) => ({
  horaInicio: h,
  horaFin: `${String(9 + i).padStart(2, '0')}:00`,
  precio: 80000,
  estado: 'libre',
}));

describe('disponibilidad = horario − reservas − bloqueos (HU-10)', () => {
  it('marca reservada la franja con una reserva activa y partido_abierto si se publicó en Busca Partido', () => {
    const r = combinarConReservas(
      franjas,
      [
        { id: 1, horaInicio: '09:00', horaFin: '10:00' },
        { id: 2, horaInicio: '11:00', horaFin: '12:00' },
      ],
      new Set([2]),
    );
    expect(r.map((f) => f.estado)).toEqual(['libre', 'reservada', 'libre', 'partido_abierto']);
  });

  it('una reserva de 90 minutos ocupa todas las franjas que toca; las franjas pasadas no cambian', () => {
    const conPasada: FranjaBase[] = [{ ...franjas[0]!, estado: 'pasada' }, ...franjas.slice(1)];
    const r = combinarConReservas(conPasada, [{ id: 1, horaInicio: '08:30', horaFin: '10:00' }]);
    expect(r.map((f) => f.estado)).toEqual(['pasada', 'reservada', 'libre', 'libre']);
  });

  it('filtra por rango de horas de inicio', () => {
    expect(franjas.filter((f) => enRangoDeHoras(f, '09:00', '11:00')).map((f) => f.horaInicio)).toEqual(['09:00', '10:00']);
    expect(franjas.filter((f) => enRangoDeHoras(f)).length).toBe(4);
  });

  it('sugiere las franjas libres más cercanas a la hora pedida (HU-10.3)', () => {
    const libres = combinarConReservas(franjas, [{ id: 1, horaInicio: '10:00', horaFin: '11:00' }]);
    expect(sugerirCercanas(libres, '10:00', 2).map((f) => f.horaInicio)).toEqual(['09:00', '11:00']);
  });

  it('calcula la distancia en km (Usaquén – Kennedy ≈ 14 km)', () => {
    expect(distanciaKm({ lat: 4.701594, lng: -74.03553 }, { lat: 4.62878, lng: -74.14037 })).toBeCloseTo(14.1, 0);
  });
});

describe('reprogramación (HU-12.3)', () => {
  it('solo con más de 24 horas de anticipación', () => {
    expect(puedeReprogramar(24.1)).toBe(true);
    expect(puedeReprogramar(24)).toBe(false);
  });

  it('traslada lo pagado: misma tarifa queda confirmada con el mismo saldo', () => {
    expect(calcularTraslado({ pagado: 40000, nuevoPrecio: 80000, porcentajeAbono: 50 })).toEqual({
      precioTotal: 80000,
      abonoRequerido: 40000,
      saldoPendiente: 40000,
      estado: 'confirmada',
      excedente: 0,
    });
  });

  it('franja más cara: sigue confirmada (nunca vuelve a pendiente ni puede expirar con el dinero adentro)', () => {
    expect(calcularTraslado({ pagado: 40000, nuevoPrecio: 120000, porcentajeAbono: 50 })).toMatchObject({ saldoPendiente: 80000, estado: 'confirmada' });
  });

  it('franja más barata: queda pagada y el excedente se reembolsa', () => {
    expect(calcularTraslado({ pagado: 100000, nuevoPrecio: 80000, porcentajeAbono: 50 })).toMatchObject({ saldoPendiente: 0, estado: 'pagada', excedente: 20000 });
  });
});
