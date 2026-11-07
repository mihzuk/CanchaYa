import nodemailer, { type Transporter } from 'nodemailer';
import { env, esPrueba } from '../../shared/config/env';
import { logger } from '../../shared/logger/logger';
import { ConsoleMailer, MemoryMailer, type Correo, type Mailer } from './Mailer';

/** Envío por SMTP tolerante a fallos (HT-07 criterio 3): un fallo se registra y no rompe el flujo. */
export class SmtpMailer implements Mailer {
  private readonly transporte: Transporter;

  constructor() {
    this.transporte = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
      connectionTimeout: 10_000,
    });
  }

  async enviar(correo: Correo): Promise<boolean> {
    try {
      await this.transporte.sendMail({
        from: env.SMTP_FROM,
        to: correo.para,
        subject: correo.asunto,
        text: correo.texto,
        html: correo.html,
      });
      return true;
    } catch (err) {
      logger.error('No se pudo enviar el correo', { asunto: correo.asunto, error: (err as Error).message });
      return false;
    }
  }
}

function crearMailer(): Mailer {
  if (esPrueba) return new MemoryMailer();
  if (env.SMTP_HOST) return new SmtpMailer();
  return new ConsoleMailer((m, c) => logger.info(m, c));
}

/** Instancia única usada por toda la aplicación. */
export const mailer: Mailer = crearMailer();
