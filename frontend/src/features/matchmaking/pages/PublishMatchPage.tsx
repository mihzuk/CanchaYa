import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Button, Card, Input, Select, Spinner } from '../../../components/ui';
import { formatFecha, formatHora, hoyBogota } from '../../../lib/format';
import { misReservas } from '../../bookings/api';
import { useAuth } from '../../auth/AuthContext';
import { misEquipos } from '../../teams/api';
import { errorDeCampo, errorGeneral } from '../../teams/errors';
import { NIVELES_EQUIPO } from '../../teams/types';
import type { NivelEquipo } from '../../teams/types';
import { opcionesHora } from '../../venues/utils';
import { publicarPartido } from '../api';
import { MODALIDADES, POSICIONES } from '../types';
import type { Modalidad, PosicionJugador, PublicarInput } from '../types';

const CAMPOS = ['modalidad', 'equipoId', 'reservaId', 'nivelBuscado', 'descripcion', 'aceptacionAutomatica', 'porcentajePagoRival', 'cuposDisponibles', 'aportePorJugador', 'posicionDeseada', 'fechaPreferida', 'rangoHoraInicio', 'rangoHoraFin', 'zona'];
const HORAS_INICIO = opcionesHora(false);
const HORAS_FIN = opcionesHora(true);

export function PublishMatchPage() {
  const { usuario } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const reservaParam = params.get('reservaId') ?? '';

  const [modalidad, setModalidad] = useState<Modalidad>('busco_rival');
  const [equipoId, setEquipoId] = useState('');
  const [reservaId, setReservaId] = useState(/^\d+$/.test(reservaParam) ? reservaParam : '');
  const [nivel, setNivel] = useState<NivelEquipo | ''>('');
  const [descripcion, setDescripcion] = useState('');
  const [auto, setAuto] = useState(false);
  const [porcentaje, setPorcentaje] = useState('50');
  const [cupos, setCupos] = useState('1');
  const [aporte, setAporte] = useState('0');
  const [posicion, setPosicion] = useState('');
  const [fechaPref, setFechaPref] = useState('');
  const [horaIni, setHoraIni] = useState('');
  const [horaFin, setHoraFin] = useState('');
  const [zona, setZona] = useState('');
  const [local, setLocal] = useState<Record<string, string>>({});

  const equipos = useQuery({ queryKey: ['mis-equipos'], queryFn: misEquipos });
  const reservas = useQuery({ queryKey: ['mis-reservas', 'proximas'], queryFn: () => misReservas('proximas') });

  const misCapitaneados = (equipos.data?.equipos ?? []).filter((e) => e.capitanId === usuario?.id && e.estado === 'activo');
  const reservasValidas = (reservas.data?.reservas ?? []).filter((r) => r.estado === 'confirmada' || r.estado === 'pagada');
  const requiereReserva = modalidad !== 'busco_partido_sin_cancha';

  const mutacion = useMutation({
    mutationFn: publicarPartido,
    onSuccess: async (r) => {
      await queryClient.invalidateQueries({ queryKey: ['partidos'] });
      void navigate(`/partidos/${r.partido.id}`);
    },
  });

  function enviar(e: FormEvent) {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (equipoId === '') err.equipoId = 'Elige el equipo que publica.';
    if (nivel === '') err.nivelBuscado = 'Elige el nivel buscado.';
    if (requiereReserva && reservaId === '') err.reservaId = 'Elige una reserva.';
    if (modalidad === 'busco_rival' && (porcentaje === '' || Number(porcentaje) < 0 || Number(porcentaje) > 100)) err.porcentajePagoRival = 'Ingresa un porcentaje entre 0 y 100.';
    if (modalidad === 'faltan_jugadores') {
      if (!Number.isInteger(Number(cupos)) || Number(cupos) < 1) err.cuposDisponibles = 'Debe haber al menos un cupo.';
      if (!Number.isInteger(Number(aporte)) || Number(aporte) < 0) err.aportePorJugador = 'Ingresa un aporte válido en pesos.';
    }
    if (modalidad === 'busco_partido_sin_cancha') {
      if (fechaPref === '') err.fechaPreferida = 'Elige la fecha preferida.';
      if (horaIni === '') err.rangoHoraInicio = 'Elige la hora inicial.';
      if (horaFin === '') err.rangoHoraFin = 'Elige la hora final.';
      if (horaIni !== '' && horaFin !== '' && horaIni >= horaFin) err.rangoHoraFin = 'La hora final debe ser posterior a la inicial.';
      if (zona.trim() === '') err.zona = 'Indica la zona donde quieres jugar.';
    }
    setLocal(err);
    if (Object.keys(err).length > 0 || nivel === '') return;

    const comun = { equipoId: Number(equipoId), nivelBuscado: nivel, ...(descripcion.trim() ? { descripcion: descripcion.trim() } : {}) };
    let datos: PublicarInput;
    if (modalidad === 'busco_rival') {
      datos = { modalidad, ...comun, reservaId: Number(reservaId), aceptacionAutomatica: auto, porcentajePagoRival: Number(porcentaje) };
    } else if (modalidad === 'faltan_jugadores') {
      datos = { modalidad, ...comun, reservaId: Number(reservaId), cuposDisponibles: Number(cupos), aportePorJugador: Number(aporte), posicionDeseada: posicion === '' ? null : (posicion as PosicionJugador) };
    } else {
      datos = { modalidad, ...comun, fechaPreferida: fechaPref, rangoHoraInicio: horaIni, rangoHoraFin: horaFin, zona: zona.trim() };
    }
    mutacion.mutate(datos);
  }

  if (equipos.isPending || reservas.isPending) return <Spinner />;

  const campo = (c: string) => local[c] ?? errorDeCampo(mutacion.error, c);
  const general = errorGeneral(mutacion.error, CAMPOS);
  const ayuda = MODALIDADES.find((m) => m.valor === modalidad)?.ayuda;

  return (
    <div className="page page--narrow stack stack--wide">
      <h1>Publicar partido</h1>
      {equipos.isError && <Alert tone="error">No pudimos cargar tus equipos. Intenta de nuevo.</Alert>}
      {equipos.isSuccess && misCapitaneados.length === 0 ? (
        <Card className="stack">
          <p>Para publicar un partido debes ser capitán de un equipo activo.</p>
          <div>
            <Link className="btn btn--primary" to="/equipos/crear">
              Crear un equipo
            </Link>
          </div>
        </Card>
      ) : (
        <Card>
          <form className="form" onSubmit={enviar} noValidate aria-label="Publicar partido">
            {general && <Alert tone="error">{general}</Alert>}
            <Select
              label="Modalidad"
              value={modalidad}
              onChange={(e) => setModalidad(e.target.value as Modalidad)}
              options={MODALIDADES.map((m) => ({ valor: m.valor, etiqueta: m.etiqueta }))}
              hint={ayuda}
            />
            <Select
              label="Equipo"
              value={equipoId}
              onChange={(e) => setEquipoId(e.target.value)}
              placeholder="Elige tu equipo"
              options={misCapitaneados.map((e) => ({ valor: String(e.id), etiqueta: `${e.nombre} (Fútbol ${e.tipoFutbol})` }))}
              error={campo('equipoId')}
            />
            {requiereReserva && (
              <>
                <Select
                  label="Reserva"
                  value={reservaId}
                  onChange={(e) => setReservaId(e.target.value)}
                  placeholder="Elige una reserva confirmada"
                  options={reservasValidas.map((r) => ({
                    valor: String(r.id),
                    etiqueta: `${r.complejo.nombre} · ${r.cancha.nombre} · ${formatFecha(r.fecha)} ${formatHora(r.horaInicio)}`,
                  }))}
                  error={campo('reservaId')}
                />
                {reservas.isSuccess && reservasValidas.length === 0 && (
                  <Alert tone="info">
                    No tienes reservas confirmadas próximas. <Link to="/disponibilidad">Reserva una cancha</Link> o elige &quot;Busco partido sin cancha&quot;.
                  </Alert>
                )}
              </>
            )}
            <Select
              label="Nivel buscado"
              value={nivel}
              onChange={(e) => setNivel(e.target.value as NivelEquipo | '')}
              placeholder="Elige un nivel"
              options={NIVELES_EQUIPO.map((n) => ({ valor: n.valor, etiqueta: n.etiqueta }))}
              error={campo('nivelBuscado')}
            />

            {modalidad === 'busco_rival' && (
              <>
                <div className="check">
                  <label className="check__label">
                    <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
                    <span>Aceptar automáticamente al primer equipo que se postule</span>
                  </label>
                </div>
                <Input
                  label="Porcentaje del valor de la cancha que paga el rival (%)"
                  type="number"
                  min={0}
                  max={100}
                  value={porcentaje}
                  onChange={(e) => setPorcentaje(e.target.value)}
                  error={campo('porcentajePagoRival')}
                />
              </>
            )}

            {modalidad === 'faltan_jugadores' && (
              <>
                <Input label="Cupos disponibles" type="number" min={1} step={1} value={cupos} onChange={(e) => setCupos(e.target.value)} error={campo('cuposDisponibles')} />
                <Input
                  label="Aporte por jugador (COP)"
                  type="number"
                  min={0}
                  step={500}
                  value={aporte}
                  onChange={(e) => setAporte(e.target.value)}
                  error={campo('aportePorJugador')}
                />
                <Select
                  label="Posición que buscas (opcional)"
                  value={posicion}
                  onChange={(e) => setPosicion(e.target.value)}
                  placeholder="Cualquiera"
                  options={POSICIONES}
                  error={campo('posicionDeseada')}
                />
              </>
            )}

            {modalidad === 'busco_partido_sin_cancha' && (
              <>
                <Input label="Fecha preferida" type="date" min={hoyBogota()} value={fechaPref} onChange={(e) => setFechaPref(e.target.value)} error={campo('fechaPreferida')} />
                <div className="form__row">
                  <Select label="Desde" value={horaIni} onChange={(e) => setHoraIni(e.target.value)} placeholder="Hora inicial" options={HORAS_INICIO} error={campo('rangoHoraInicio')} />
                  <Select label="Hasta" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} placeholder="Hora final" options={HORAS_FIN} error={campo('rangoHoraFin')} />
                </div>
                <Input label="Zona" value={zona} onChange={(e) => setZona(e.target.value)} maxLength={100} hint="Barrio o sector donde quieres jugar." error={campo('zona')} />
              </>
            )}

            <Input label="Descripción (opcional)" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={255} error={campo('descripcion')} />

            <Button type="submit" loading={mutacion.isPending}>
              Publicar partido
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
