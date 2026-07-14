GRANT SELECT, INSERT, UPDATE, DELETE ON public."Leads" TO authenticated;
GRANT INSERT ON public."Leads" TO anon;
GRANT ALL ON public."Leads" TO service_role;

ALTER TABLE public."Leads" DISABLE ROW LEVEL SECURITY;

-- Remove any existing policies to ensure RLS being disabled doesn't leave stale policies
DROP POLICY IF EXISTS "Allow anon insert" ON public."Leads";
DROP POLICY IF EXISTS "Allow authenticated all" ON public."Leads";