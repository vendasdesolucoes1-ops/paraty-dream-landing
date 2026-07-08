-- Allows 'google_maps' as a lead origin, used by the Ferramentas > Extrator de Leads (Google Maps) import.

alter table leads drop constraint if exists leads_origem_check;

alter table leads
  add constraint leads_origem_check
  check (origem in ('lp', 'whatsapp', 'indicacao', 'instagram', 'google_maps'));
