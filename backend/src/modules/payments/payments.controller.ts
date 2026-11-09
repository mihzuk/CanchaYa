import type { Request, Response } from 'express';
import { validar, zParamsId } from '../../shared/http/validar';
import { usuarioDe } from '../../shared/middleware/authenticate';
import {
  cancelacionSchema,
  filtroReembolsosSchema,
  pagoEnLineaSchema,
  pagoManualSchema,
  rangoPagosSchema,
  reprogramacionSchema,
} from './payments.dto';
import { paymentsService as s } from './payments.service';

const id = (req: Request) => validar(zParamsId, req.params).id;

/** Valida la entrada y delega en el servicio. No accede a la base de datos. */
export const paymentsController = {
  async pagarAbono(req: Request, res: Response) {
    res.status(201).json(await s.pagarAbono(id(req), usuarioDe(req), validar(pagoEnLineaSchema, req.body)));
  },

  async pagoManual(req: Request, res: Response) {
    res.status(201).json(await s.registrarPagoManual(id(req), usuarioDe(req), validar(pagoManualSchema, req.body)));
  },

  async pagosDeReserva(req: Request, res: Response) {
    res.json(await s.pagosDeReserva(id(req), usuarioDe(req)));
  },

  async previewCancelacion(req: Request, res: Response) {
    res.json(await s.previewCancelacion(id(req), usuarioDe(req)));
  },

  async cancelar(req: Request, res: Response) {
    res.json(await s.cancelar(id(req), usuarioDe(req), validar(cancelacionSchema, req.body).motivo));
  },

  async reprogramar(req: Request, res: Response) {
    res.json(await s.reprogramar(id(req), usuarioDe(req), validar(reprogramacionSchema, req.body)));
  },

  async reembolsosDeComplejo(req: Request, res: Response) {
    res.json({ reembolsos: await s.reembolsosDeComplejo(id(req), usuarioDe(req), validar(filtroReembolsosSchema, req.query).estado) });
  },

  async resolverReembolso(req: Request, res: Response) {
    res.json({ reembolso: await s.resolverReembolso(id(req), usuarioDe(req)) });
  },

  async pagosDeComplejo(req: Request, res: Response) {
    const r = validar(rangoPagosSchema, req.query);
    res.json({ pagos: await s.pagosDeComplejo(id(req), usuarioDe(req), r.desde, r.hasta) });
  },
};
