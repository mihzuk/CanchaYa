import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, Button, Card, Input, Select } from '../../../components/ui';
import { TIPOS_FUTBOL } from '../../venues/types';
import { crearEquipo } from '../api';
import { codigoError, errorDeCampo, errorGeneral } from '../errors';
import { NIVELES_EQUIPO } from '../types';
import type { NivelEquipo } from '../types';

const CAMPOS = ['nombre', 'nivel', 'tipoFutbol', 'escudoUrl'];

export function CreateTeamPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [nombre, setNombre] = useState('');
  const [nivel, setNivel] = useState<NivelEquipo | ''>('');
  const [tipoFutbol, setTipoFutbol] = useState('');
  const [escudoUrl, setEscudoUrl] = useState('');
  const [local, setLocal] = useState<Record<string, string>>({});

  const mutacion = useMutation({
    mutationFn: crearEquipo,
    onSuccess: async (r) => {
      await queryClient.invalidateQueries({ queryKey: ['mis-equipos'] });
      void navigate(`/equipos/${r.equipo.id}`);
    },
  });

  function enviar(e: FormEvent) {
    e.preventDefault();
    const errores: Record<string, string> = {};
    if (nombre.trim().length < 3) errores.nombre = 'El nombre debe tener al menos 3 caracteres.';
    if (nivel === '') errores.nivel = 'Elige un nivel.';
    if (tipoFutbol === '') errores.tipoFutbol = 'Elige el tipo de fútbol.';
    if (escudoUrl.trim() !== '' && !/^https:\/\//i.test(escudoUrl.trim())) errores.escudoUrl = 'El escudo debe ser un enlace que empiece por https://';
    setLocal(errores);
    if (Object.keys(errores).length > 0 || nivel === '') return;
    mutacion.mutate({ nombre: nombre.trim(), nivel, tipoFutbol: Number(tipoFutbol), escudoUrl: escudoUrl.trim() === '' ? null : escudoUrl.trim() });
  }

  const error = mutacion.error;
  const nombreEnUso = codigoError(error) === 'NOMBRE_EQUIPO_EN_USO';
  const campo = (c: string) => local[c] ?? errorDeCampo(error, c);
  const general = nombreEnUso ? null : errorGeneral(error, CAMPOS);

  return (
    <div className="page page--narrow stack stack--wide">
      <h1>Crear equipo</h1>
      <Card>
        <form className="form" onSubmit={enviar} noValidate aria-label="Crear equipo">
          {general && <Alert tone="error">{general}</Alert>}
          <Input
            label="Nombre del equipo"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            maxLength={60}
            required
            error={nombreEnUso ? 'Ese nombre ya está en uso, elige otro nombre.' : campo('nombre')}
          />
          <Select
            label="Nivel"
            value={nivel}
            onChange={(e) => setNivel(e.target.value as NivelEquipo | '')}
            placeholder="Elige un nivel"
            options={NIVELES_EQUIPO.map((n) => ({ valor: n.valor, etiqueta: n.etiqueta }))}
            required
            error={campo('nivel')}
          />
          <Select
            label="Tipo de fútbol"
            value={tipoFutbol}
            onChange={(e) => setTipoFutbol(e.target.value)}
            placeholder="Elige el tipo"
            options={TIPOS_FUTBOL.map((t) => ({ valor: String(t), etiqueta: `Fútbol ${t}` }))}
            required
            error={campo('tipoFutbol')}
          />
          <Input
            label="Escudo (opcional)"
            type="url"
            value={escudoUrl}
            onChange={(e) => setEscudoUrl(e.target.value)}
            placeholder="https://..."
            hint="Enlace https a la imagen de tu escudo."
            error={campo('escudoUrl')}
          />
          <div className="row-actions">
            <Button type="submit" loading={mutacion.isPending}>
              Crear equipo
            </Button>
            <Link className="btn btn--secondary" to="/mis-equipos">
              Cancelar
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
