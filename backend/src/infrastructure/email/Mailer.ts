/** Interfaz de envío de correo (HT-07): los módulos no saben si se usa SMTP, el log o la memoria. */
export interface Correo {
  para: string;
  asunto: string;
  texto: string;
  html: string;
}

export interface Mailer {
  /** Envía el correo. Nunca lanza: devuelve false si falló (el error queda en el log). */
  enviar(correo: Correo): Promise<boolean>;
}

/** Desarrollo sin SMTP: escribe el correo en el log para poder copiar los enlaces. */
export class ConsoleMailer implements Mailer {
  constructor(private readonly log: (mensaje: string, contexto: Record<string, unknown>) => void) {}

  async enviar(correo: Correo): Promise<boolean> {
    this.log('Correo (modo desarrollo, no se envía)', { para: correo.para, asunto: correo.asunto, cuerpo: correo.texto });
    return true;
  }
}

/** Pruebas: guarda los correos en memoria para inspeccionarlos. */
export class MemoryMailer implements Mailer {
  readonly enviados: Correo[] = [];

  async enviar(correo: Correo): Promise<boolean> {
    this.enviados.push(correo);
    return true;
  }

  ultimoPara(para: string): Correo | undefined {
    return [...this.enviados].reverse().find((c) => c.para === para);
  }

  limpiar(): void {
    this.enviados.length = 0;
  }
}
