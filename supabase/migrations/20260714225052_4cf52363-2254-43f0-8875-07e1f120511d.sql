ALTER TABLE public."Leads" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon insert on Leads"
  ON public."Leads"
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow authenticated all on Leads"
  ON public."Leads"
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public."Leads" TO authenticated;
GRANT INSERT ON public."Leads" TO anon;
GRANT ALL ON public."Leads" TO service_role;