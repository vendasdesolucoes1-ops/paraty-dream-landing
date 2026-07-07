-- Seeds the lotes table with the main lots of Moradas de Paraty, only if empty.

do $$
declare
  metragens numeric[];
  precos numeric;
  tipo_lote text;
  i integer;
  m numeric;
begin
  if exists (select 1 from lotes limit 1) then
    return;
  end if;

  -- Quadra 1 — comercial, lotes 1 a 9 (metragens reais)
  insert into lotes (quadra, numero_lote, metragem, tipo, valor, status)
  select '1', n::text, met, 'comercial', round(met * 1580, 2), 'disponivel'
  from unnest(
    array[1, 2, 3, 4, 5, 6, 7, 8, 9],
    array[533.71, 492.51, 417.32, 360.00, 360.00, 360.00, 360.16, 397.50, 397.50]
  ) as t(n, met);

  -- Quadra 3 — residencial, lotes 20 a 44 (maioria 250m², variação pontual)
  metragens := array[250.00, 250.00, 250.00, 250.00, 360.13, 250.00, 284.07, 250.00, 250.00, 291.15];
  precos := 1220;
  for i in 20..44 loop
    m := metragens[((i - 20) % array_length(metragens, 1)) + 1];
    insert into lotes (quadra, numero_lote, metragem, tipo, valor, status)
    values ('3', i::text, m, 'residencial', round(m * precos, 2), 'disponivel');
  end loop;

  -- Quadra 5 — residencial, lotes 71 a 86 (150m² a 450m²)
  metragens := array[153.15, 169.07, 250.00, 291.15, 360.00, 363.80, 397.50, 450.02];
  precos := 1198;
  for i in 71..86 loop
    m := metragens[((i - 71) % array_length(metragens, 1)) + 1];
    insert into lotes (quadra, numero_lote, metragem, tipo, valor, status)
    values ('5', i::text, m, 'residencial', round(m * precos, 2), 'disponivel');
  end loop;

  -- Quadra 6 — mista, lotes 87 a 97 (lotes grandes 600–811m²)
  metragens := array[811.11, 643.97, 623.51, 625.20, 635.40, 643.91, 618.00, 630.00, 620.00, 640.00, 615.00];
  for i in 87..97 loop
    m := metragens[((i - 87) % array_length(metragens, 1)) + 1];
    tipo_lote := case when i in (87, 88) then 'comercial' else 'residencial' end;
    precos := case when tipo_lote = 'comercial' then 1580 else 1400 end;
    insert into lotes (quadra, numero_lote, metragem, tipo, valor, status)
    values ('6', i::text, m, tipo_lote, round(m * precos, 2), 'disponivel');
  end loop;

  -- Quadra 8 — residencial, lotes 125 a 144 (360m²)
  metragens := array[360.17, 360.00, 291.25, 360.13];
  precos := 1198;
  for i in 125..144 loop
    m := metragens[((i - 125) % array_length(metragens, 1)) + 1];
    insert into lotes (quadra, numero_lote, metragem, tipo, valor, status)
    values ('8', i::text, m, 'residencial', round(m * precos, 2), 'disponivel');
  end loop;

  -- Quadra 9 — residencial, lotes 145 a 156 (360–450m²)
  metragens := array[450.24, 360.00, 397.50, 360.00];
  precos := 1450;
  for i in 145..156 loop
    m := metragens[((i - 145) % array_length(metragens, 1)) + 1];
    insert into lotes (quadra, numero_lote, metragem, tipo, valor, status)
    values ('9', i::text, m, 'residencial', round(m * precos, 2), 'disponivel');
  end loop;

  -- Quadra 10 — residencial, lotes 157 a 163 (360–462m²)
  metragens := array[360.00, 462.15, 397.50, 360.00];
  precos := 1450;
  for i in 157..163 loop
    m := metragens[((i - 157) % array_length(metragens, 1)) + 1];
    insert into lotes (quadra, numero_lote, metragem, tipo, valor, status)
    values ('10', i::text, m, 'residencial', round(m * precos, 2), 'disponivel');
  end loop;
end $$;
