import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Card, Input, Select, Spinner, useToast } from '../../../components/ui';
import { setToken } from '../../../lib/session';
import { actualizarPerfil, cambiarContrasena } from '../api';
import { useAuth } from '../AuthContext';
import { NIVELES, POSICIONES } from '../types';
import type { Nivel, Posicion, Usuario } from '../types';
import {
  erroresDeApi,
  limpiar,
  validarCelular,
  validarContrasena,
  validarObligatorio,
  validarUrlHttps,
} from '../validation';
import type { Errores } from '../validation';

function FormularioPerfil({ usuario }: { usuario: Usuario }) {
  const { actualizarUsuario } = useAuth();
  const { mostrar } = useToast();
  const [nombres, setNombres] = useState(usuario.nombres);
  const [apellidos, setApellidos] = useState(usuario.apellidos);
  const [celular, setCelular] = useState(usuario.celular);
  const [fotoUrl, setFotoUrl] = useState(usuario.fotoUrl ?? '');
  const [posicion, setPosicion] = useState<string>(usuario.posicionPreferida ?? '');
  const [nivel, setNivel] = useState<string>(usuario.nivel ?? '');
  const [errores, setErrores] = useState<Errores>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [fotoRota, setFotoRota] = useState(false);

  const mutacion = useMutation({
    mutationFn: () =>
      actualizarPerfil({
        nombres: nombres.trim(),
        apellidos: apellidos.trim(),
        celular: celular.trim(),
        fotoUrl: fotoUrl.trim() || null,
        posicionPreferida: (posicion || null) as Posicion | null,
        nivel: (nivel || null) as Nivel | null,
      }),
    onSuccess: (r) => {
      actualizarUsuario(r.usuario);
      mostrar('Perfil actualizado.', 'success');
    },
    onError: (e) => {
      const r = erroresDeApi(e);
      setErrores(r.campos);
      setGeneral(r.general);
    },
  });

  function enviar(e: FormEvent) {
    e.preventDefault();
    setGeneral(null);
    const nuevos = limpiar({
      nombres: validarObligatorio(nombres, 'Los nombres'),
      apellidos: validarObligatorio(apellidos, 'Los apellidos'),
      celular: validarCelular(celular.trim()),
      fotoUrl: validarUrlHttps(fotoUrl.trim()),
    });
    setErrores(nuevos);
    if (Object.keys(nuevos).length === 0) mutacion.mutate();
  }

  const fotoValida = fotoUrl.trim() !== '' && !validarUrlHttps(fotoUrl.trim());

  return (
    <Card>
      <h2>Mis datos</h2>
      <form onSubmit={enviar} noValidate className="form">
        {general && <Alert tone="error">{general}</Alert>}
        <Input label="Correo electrónico" value={usuario.correo} readOnly disabled />
        <Input label="Nombre de usuario" value={usuario.username} readOnly disabled />
        <div className="form__row">
          <Input label="Nombres" value={nombres} onChange={(e) => setNombres(e.target.value)} error={errores.nombres} />
          <Input label="Apellidos" value={apellidos} onChange={(e) => setApellidos(e.target.value)} error={errores.apellidos} />
        </div>
        <Input label="Celular" type="tel" inputMode="tel" value={celular} onChange={(e) => setCelular(e.target.value)} error={errores.celular} />
        <div className="form__row">
          <Select label="Posición preferida" value={posicion} onChange={(e) => setPosicion(e.target.value)} placeholder="Sin definir" options={POSICIONES} error={errores.posicionPreferida} />
          <Select label="Nivel" value={nivel} onChange={(e) => setNivel(e.target.value)} placeholder="Sin definir" options={NIVELES} error={errores.nivel} />
        </div>
        <Input
          label="Foto de perfil (URL)"
          type="url"
          inputMode="url"
          placeholder="https://..."
          hint="Debe ser una dirección https."
          value={fotoUrl}
          onChange={(e) => {
            setFotoUrl(e.target.value);
            setFotoRota(false);
          }}
          error={errores.fotoUrl}
        />
        {fotoValida && (
          <div className="photo-preview">
            {fotoRota ? (
              <p className="field__hint">No pudimos cargar la imagen de esa dirección.</p>
            ) : (
              <img src={fotoUrl.trim()} alt="Vista previa de tu foto de perfil" referrerPolicy="no-referrer" onError={() => setFotoRota(true)} />
            )}
          </div>
        )}
        <Button type="submit" loading={mutacion.isPending}>
          Guardar cambios
        </Button>
      </form>
    </Card>
  );
}

function FormularioContrasena() {
  const { mostrar } = useToast();
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [errores, setErrores] = useState<Errores>({});
  const [general, setGeneral] = useState<string | null>(null);

  const mutacion = useMutation({
    mutationFn: () => cambiarContrasena(actual, nueva),
    onSuccess: ({ token }) => {
      // Las demás sesiones quedaron cerradas; esta continúa con el token nuevo.
      setToken(token);
      mostrar('Contraseña actualizada. Cerramos tus sesiones en otros dispositivos.', 'success');
      setActual('');
      setNueva('');
      setConfirmar('');
    },
    onError: (e) => {
      const r = erroresDeApi(e);
      setErrores(r.campos);
      setGeneral(r.general);
    },
  });

  function enviar(e: FormEvent) {
    e.preventDefault();
    setGeneral(null);
    const nuevos = limpiar({
      actual: validarObligatorio(actual, 'La contraseña actual'),
      nueva: validarContrasena(nueva),
      confirmar: confirmar !== nueva ? 'Las contraseñas no coinciden.' : undefined,
    });
    setErrores(nuevos);
    if (Object.keys(nuevos).length === 0) mutacion.mutate();
  }

  return (
    <Card>
      <h2>Cambiar contraseña</h2>
      <form onSubmit={enviar} noValidate className="form">
        {general && <Alert tone="error">{general}</Alert>}
        <Input label="Contraseña actual" type="password" autoComplete="current-password" value={actual} onChange={(e) => setActual(e.target.value)} error={errores.actual} />
        <Input label="Nueva contraseña" type="password" autoComplete="new-password" hint="Mínimo 8 caracteres, con al menos una letra y un número." value={nueva} onChange={(e) => setNueva(e.target.value)} error={errores.nueva} />
        <Input label="Confirmar nueva contraseña" type="password" autoComplete="new-password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} error={errores.confirmar} />
        <Button type="submit" loading={mutacion.isPending}>
          Cambiar contraseña
        </Button>
      </form>
    </Card>
  );
}

export function ProfilePage() {
  const { usuario } = useAuth();
  if (!usuario) return <Spinner />;
  return (
    <div className="page page--narrow stack">
      <h1>Mi perfil</h1>
      <p>
        <Link to={`/jugadores/${encodeURIComponent(usuario.username)}`}>Ver mi perfil público</Link>
      </p>
      <FormularioPerfil usuario={usuario} />
      <FormularioContrasena />
    </div>
  );
}
