-- Enable realtime updates for the leads table (used by the CRM Kanban board)

alter publication supabase_realtime add table leads;
