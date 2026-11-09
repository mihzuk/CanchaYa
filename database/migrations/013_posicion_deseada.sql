-- HU-25.1: el capitán puede indicar la posición que busca al publicar "Faltan jugadores".
ALTER TABLE partido_abierto
  ADD COLUMN posicion_deseada VARCHAR(20) CHECK (posicion_deseada IN ('arquero', 'defensa', 'medio', 'delantero'));
