import { env } from '../../shared/config/env';
import type { Correo } from './Mailer';

/**
 * Plantillas de correo en español (HU-01, HU-03, HU-28). Todo valor dinámico se escapa antes de
 * insertarlo en el HTML para evitar inyección de contenido.
 */
export function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function enlace(ruta: string, token: string): string {
  return `${env.APP_URL.replace(/\/$/, '')}${ruta}?token=${encodeURIComponent(token)}`;
}

function plantilla(titulo: string, parrafos: string[], boton?: { texto: string; url: string }): string {
  const cuerpo = parrafos.map((p) => `<p style="margin:0 0 16px">${escaparHtml(p)}</p>`).join('');
  const accion = boton
    ? `<p style="margin:24px 0"><a href="${escaparHtml(boton.url)}" style="background:#0f6b3a;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">${escaparHtml(boton.texto)}</a></p>
       <p style="margin:0 0 16px;font-size:13px;color:#555">Si el botón no funciona, copia este enlace en tu navegador:<br>${escaparHtml(boton.url)}</p>`
    : '';
  return `<!doctype html><html lang="es"><body style="font-family:Arial,sans-serif;color:#1d2a22;max-width:560px;margin:0 auto;padding:24px">
<h1 style="color:#0f6b3a;font-size:22px">${escaparHtml(titulo)}</h1>${cuerpo}${accion}
<p style="margin-top:32px;font-size:12px;color:#777">CanchaYa · Reserva tu cancha sintética. Si no solicitaste este correo, ignóralo.</p>
</body></html>`;
}

export function correoVerificacion(para: string, nombres: string, token: string): Correo {
  const url = enlace('/verificar-correo', token);
  return {
    para,
    asunto: 'Confirma tu correo en CanchaYa',
    texto: `Hola ${nombres}, confirma tu correo abriendo este enlace: ${url}\nEl enlace vence en 24 horas.`,
    html: plantilla(
      `¡Hola, ${nombres}!`,
      ['Gracias por registrarte en CanchaYa. Confirma tu correo para empezar a reservar canchas.', 'El enlace vence en 24 horas.'],
      { texto: 'Confirmar mi correo', url },
    ),
  };
}

export function correoRecuperacion(para: string, nombres: string, token: string, minutos: number): Correo {
  const url = enlace('/restablecer-contrasena', token);
  return {
    para,
    asunto: 'Restablece tu contraseña de CanchaYa',
    texto: `Hola ${nombres}, para crear una nueva contraseña abre este enlace: ${url}\nEl enlace vence en ${minutos} minutos.`,
    html: plantilla(
      'Restablece tu contraseña',
      [`Hola ${nombres}, recibimos una solicitud para restablecer tu contraseña.`, `El enlace es válido por ${minutos} minutos y solo se puede usar una vez.`],
      { texto: 'Crear una nueva contraseña', url },
    ),
  };
}

export function correoGenerico(para: string, titulo: string, mensaje: string): Correo {
  return {
    para,
    asunto: `CanchaYa · ${titulo}`,
    texto: mensaje,
    html: plantilla(titulo, [mensaje], { texto: 'Abrir CanchaYa', url: env.APP_URL }),
  };
}
