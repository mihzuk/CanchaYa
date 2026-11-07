import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert, Button, Card, Input, Select, Spinner } from '../../../components/ui';
import { buscarComplejos, listarServicios } from '../api';
import { VenueCard } from '../components/VenueCard';
import { TIPOS_FUTBOL } from '../types';
import { mensajeError } from '../utils';

export function VenueListPage() {
  const [params, setParams] = useSearchParams();
  const ciudad = params.get('ciudad') ?? '';
  const q = params.get('q') ?? '';
  const tipoFutbol = params.get('tipoFutbol') ?? '';
  const servicio = params.get('servicio') ?? '';
  const pagina = Math.max(1, Number(params.get('pagina')) || 1);

  const [bCiudad, setBCiudad] = useState(ciudad);
  const [bQ, setBQ] = useState(q);
  const [bTipo, setBTipo] = useState(tipoFutbol);
  const [bServicio, setBServicio] = useState(servicio);

  const servicios = useQuery({ queryKey: ['servicios'], queryFn: listarServicios, staleTime: 5 * 60_000 });
  const resultado = useQuery({
    queryKey: ['complejos', { ciudad, q, tipoFutbol, servicio, pagina }],
    queryFn: () => buscarComplejos({ ciudad, q, tipoFutbol, servicio, pagina, tamano: 12 }),
  });

  function aplicar(e: FormEvent) {
    e.preventDefault();
    const nuevos = new URLSearchParams();
    if (bCiudad.trim()) nuevos.set('ciudad', bCiudad.trim());
    if (bQ.trim()) nuevos.set('q', bQ.trim());
    if (bTipo) nuevos.set('tipoFutbol', bTipo);
    if (bServicio) nuevos.set('servicio', bServicio);
    setParams(nuevos);
  }

  function limpiar() {
    setBCiudad('');
    setBQ('');
    setBTipo('');
    setBServicio('');
    setParams(new URLSearchParams());
  }

  function irA(p: number) {
    const nuevos = new URLSearchParams(params);
    nuevos.set('pagina', String(p));
    setParams(nuevos);
    window.scrollTo({ top: 0 });
  }

  const datos = resultado.data;
  const totalPaginas = datos ? Math.max(1, Math.ceil(datos.total / datos.tamano)) : 1;

  return (
    <div className="page stack stack--wide">
      <h1>Complejos deportivos</h1>
      <Card className="filters">
        <form onSubmit={aplicar} className="form" role="search" aria-label="Filtrar complejos">
          <div className="filters__grid">
            <Input label="Ciudad" value={bCiudad} onChange={(e) => setBCiudad(e.target.value)} />
            <Input label="Buscar por nombre o barrio" type="search" value={bQ} onChange={(e) => setBQ(e.target.value)} />
            <Select
              label="Tipo de fútbol"
              value={bTipo}
              onChange={(e) => setBTipo(e.target.value)}
              placeholder="Todos"
              options={TIPOS_FUTBOL.map((t) => ({ valor: String(t), etiqueta: `Fútbol ${t}` }))}
            />
            <Select
              label="Servicio"
              value={bServicio}
              onChange={(e) => setBServicio(e.target.value)}
              placeholder="Cualquiera"
              options={(servicios.data?.servicios ?? []).map((s) => ({ valor: String(s.id), etiqueta: s.nombre }))}
            />
          </div>
          <div className="row-actions">
            <Button type="submit">Buscar</Button>
            <Button variant="ghost" onClick={limpiar}>
              Limpiar filtros
            </Button>
          </div>
        </form>
      </Card>

      {resultado.isPending && <Spinner label="Buscando complejos…" />}
      {resultado.isError && <Alert tone="error">{mensajeError(resultado.error)}</Alert>}
      {datos && datos.complejos.length === 0 && (
        <Card>
          <h2>No encontramos complejos</h2>
          <p>Prueba con otros filtros o quita alguno para ampliar la búsqueda.</p>
        </Card>
      )}
      {datos && datos.complejos.length > 0 && (
        <>
          <p aria-live="polite" className="muted">
            {datos.total} {datos.total === 1 ? 'complejo encontrado' : 'complejos encontrados'}
          </p>
          <ul className="card-grid">
            {datos.complejos.map((c) => (
              <li key={c.id}>
                <VenueCard complejo={c} />
              </li>
            ))}
          </ul>
          {totalPaginas > 1 && (
            <nav className="pager" aria-label="Paginación">
              <Button variant="secondary" disabled={pagina <= 1} onClick={() => irA(pagina - 1)}>
                Anterior
              </Button>
              <span>
                Página {datos.pagina} de {totalPaginas}
              </span>
              <Button variant="secondary" disabled={pagina >= totalPaginas} onClick={() => irA(pagina + 1)}>
                Siguiente
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
