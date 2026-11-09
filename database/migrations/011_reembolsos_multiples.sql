-- HU-12 / HU-18: un pago puede tener varios reembolsos.
-- Caso real: se reprograma a una franja más barata (reembolso de la diferencia, ya pagado) y luego se
-- cancela (reembolso del resto). Con un solo reembolso por pago el segundo se perdía.
-- La suma de los reembolsos de un pago nunca supera su valor (se valida en la aplicación dentro de la
-- transacción que bloquea la reserva, y aquí con un disparador como garantía final).

ALTER TABLE reembolso DROP CONSTRAINT reembolso_pago_id_key;
CREATE INDEX reembolso_pago_idx ON reembolso (pago_id);

CREATE FUNCTION reembolso_no_supera_pago() RETURNS trigger AS $$
DECLARE
  total NUMERIC;
  pagado NUMERIC;
BEGIN
  SELECT valor INTO pagado FROM pago WHERE id = NEW.pago_id FOR UPDATE;
  SELECT COALESCE(sum(valor), 0) INTO total FROM reembolso WHERE pago_id = NEW.pago_id AND id <> NEW.id;
  IF total + NEW.valor > pagado THEN
    RAISE EXCEPTION 'Los reembolsos del pago % superarían su valor', NEW.pago_id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER reembolso_no_supera_pago
  BEFORE INSERT OR UPDATE OF valor ON reembolso
  FOR EACH ROW EXECUTE FUNCTION reembolso_no_supera_pago();
