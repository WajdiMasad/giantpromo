export const BOOTSTRAP_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'office',
  phone TEXT DEFAULT '',
  avatar_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  google_refresh_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users (email);

CREATE TABLE IF NOT EXISTS sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS sessions_token_hash_idx ON sessions (token_hash);

CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  sage_id TEXT,
  name TEXT NOT NULL,
  company_name TEXT DEFAULT '',
  contact_person TEXT DEFAULT '',
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  address_line1 TEXT DEFAULT '',
  address_line2 TEXT DEFAULT '',
  city TEXT DEFAULT 'Halifax',
  province TEXT NOT NULL DEFAULT 'NS',
  postal_code TEXT DEFAULT '',
  country TEXT NOT NULL DEFAULT 'Canada',
  payment_terms TEXT NOT NULL DEFAULT 'Net 30',
  tax_exempt BOOLEAN NOT NULL DEFAULT FALSE,
  site_notes TEXT DEFAULT '',
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS customers_sage_id_idx ON customers (sage_id);

CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  quote_number TEXT NOT NULL,
  public_token TEXT NOT NULL,
  job_number TEXT,
  idempotency_key TEXT NOT NULL,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  po_reference TEXT DEFAULT '',
  site_address TEXT DEFAULT '',
  site_province TEXT NOT NULL DEFAULT 'NS',
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  status TEXT NOT NULL DEFAULT 'new',
  priority TEXT NOT NULL DEFAULT 'normal',
  scheduled_date TEXT,
  completed_at TIMESTAMPTZ,
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  tax_rate_ppm INTEGER NOT NULL DEFAULT 140000,
  tax_label TEXT NOT NULL DEFAULT '14% HST',
  tax_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  customer_terms TEXT DEFAULT '',
  valid_until TEXT,
  sent_at TIMESTAMPTZ,
  sent_by_user_id INTEGER REFERENCES users(id),
  first_viewed_at TIMESTAMPTZ,
  last_viewed_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  approved_by_name TEXT,
  approved_by_email TEXT,
  approved_ip TEXT,
  decline_reason TEXT,
  created_by_user_id INTEGER REFERENCES users(id),
  installer_notes TEXT DEFAULT '',
  internal_notes TEXT DEFAULT '',
  drive_folder_id TEXT,
  drive_folder_url TEXT,
  sage_invoice_id TEXT,
  sage_invoice_number TEXT,
  sage_sync_status TEXT NOT NULL DEFAULT 'not_started',
  sage_sync_error TEXT,
  sage_payment_status TEXT NOT NULL DEFAULT 'DRAFT',
  invoice_sent_at TIMESTAMPTZ,
  invoice_sent_by_user_id INTEGER REFERENCES users(id),
  invoice_sent_to_email TEXT,
  void_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS projects_quote_number_idx ON projects (quote_number);
CREATE UNIQUE INDEX IF NOT EXISTS projects_public_token_idx ON projects (public_token);
CREATE UNIQUE INDEX IF NOT EXISTS projects_job_number_idx ON projects (job_number);
CREATE UNIQUE INDEX IF NOT EXISTS projects_idempotency_key_idx ON projects (idempotency_key);

CREATE TABLE IF NOT EXISTS project_items (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  group_name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL,
  quantity TEXT NOT NULL DEFAULT '1',
  unit_price_cents INTEGER NOT NULL DEFAULT 0,
  net_cents INTEGER NOT NULL DEFAULT 0,
  tax_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  tax_exempt BOOLEAN NOT NULL DEFAULT FALSE,
  hidden_from_customer BOOLEAN NOT NULL DEFAULT FALSE,
  calculator_meta_json TEXT
);

CREATE TABLE IF NOT EXISTS project_assignments (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS project_assignments_unique_idx ON project_assignments (project_id, user_id);

CREATE TABLE IF NOT EXISTS project_files (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  uploaded_by_user_id INTEGER REFERENCES users(id),
  uploaded_by_name TEXT NOT NULL DEFAULT 'Staff',
  kind TEXT NOT NULL DEFAULT 'install_photo',
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  storage_path TEXT NOT NULL,
  caption TEXT DEFAULT '',
  drive_file_id TEXT,
  drive_url TEXT,
  drive_mirror_status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS equipment (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Mobile Sign',
  serial_number TEXT DEFAULT '',
  default_monthly_rate_cents INTEGER NOT NULL DEFAULT 15000,
  status TEXT NOT NULL DEFAULT 'available',
  condition_notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS equipment_code_idx ON equipment (code);

CREATE TABLE IF NOT EXISTS equipment_rentals (
  id SERIAL PRIMARY KEY,
  equipment_id INTEGER NOT NULL REFERENCES equipment(id),
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  start_date TEXT NOT NULL,
  end_date TEXT,
  returned_at TIMESTAMPTZ,
  monthly_rate_cents INTEGER NOT NULL DEFAULT 15000,
  location_address TEXT NOT NULL DEFAULT '',
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Database-level double-booking guard on equipment_rentals:
-- Prevents any two active/scheduled bookings for the same equipment_id from overlapping.
CREATE OR REPLACE FUNCTION check_equipment_rental_no_overlap()
RETURNS TRIGGER AS $$
DECLARE
  new_start TEXT;
  new_end TEXT;
  conflict_id INTEGER;
BEGIN
  IF NEW.status NOT IN ('active', 'scheduled') THEN
    RETURN NEW;
  END IF;

  new_start := NEW.start_date;
  new_end := COALESCE(NULLIF(NEW.end_date, ''), '9999-12-31');

  IF new_end < new_start THEN
    RAISE EXCEPTION 'Rental end_date (%) cannot be before start_date (%)', new_end, new_start
      USING ERRCODE = '22007';
  END IF;

  SELECT id INTO conflict_id
  FROM equipment_rentals
  WHERE equipment_id = NEW.equipment_id
    AND status IN ('active', 'scheduled')
    AND (NEW.id IS NULL OR id <> NEW.id)
    AND start_date <= new_end
    AND COALESCE(NULLIF(end_date, ''), '9999-12-31') >= new_start
  LIMIT 1;

  IF conflict_id IS NOT NULL THEN
    RAISE EXCEPTION 'Equipment % is already booked during % to % (conflicts with rental #%)',
      NEW.equipment_id, new_start, COALESCE(NULLIF(NEW.end_date, ''), 'ongoing'), conflict_id
      USING ERRCODE = '23P01';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_equipment_rental_no_overlap ON equipment_rentals;
CREATE TRIGGER trg_equipment_rental_no_overlap
BEFORE INSERT OR UPDATE ON equipment_rentals
FOR EACH ROW EXECUTE FUNCTION check_equipment_rental_no_overlap();

CREATE TABLE IF NOT EXISTS recurring_billing_plans (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  rental_id INTEGER REFERENCES equipment_rentals(id),
  kind TEXT NOT NULL DEFAULT 'equipment_rental',
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  po_reference TEXT DEFAULT '',
  province TEXT NOT NULL DEFAULT 'NS',
  monthly_amount_cents INTEGER NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recurring_billing_batches (
  id SERIAL PRIMARY KEY,
  month_key TEXT NOT NULL,
  invoice_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  is_dry_run BOOLEAN NOT NULL DEFAULT FALSE,
  approved_by_user_id INTEGER REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS recurring_batches_month_idx ON recurring_billing_batches (month_key);

CREATE TABLE IF NOT EXISTS recurring_billing_batch_items (
  id SERIAL PRIMARY KEY,
  batch_id INTEGER NOT NULL REFERENCES recurring_billing_batches(id) ON DELETE CASCADE,
  plan_id INTEGER NOT NULL REFERENCES recurring_billing_plans(id),
  month_key TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  description TEXT NOT NULL,
  net_cents INTEGER NOT NULL,
  tax_cents INTEGER NOT NULL,
  total_cents INTEGER NOT NULL,
  is_half_month_prorated BOOLEAN NOT NULL DEFAULT FALSE,
  change_flag TEXT NOT NULL DEFAULT 'unchanged',
  skip_this_month BOOLEAN NOT NULL DEFAULT FALSE,
  sage_invoice_id TEXT,
  sage_invoice_number TEXT,
  emailed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS batch_items_plan_month_unique_idx ON recurring_billing_batch_items (plan_id, month_key);
CREATE UNIQUE INDEX IF NOT EXISTS batch_items_idempotency_idx ON recurring_billing_batch_items (idempotency_key);

CREATE TABLE IF NOT EXISTS sage_invoices (
  id SERIAL PRIMARY KEY,
  sage_id TEXT NOT NULL,
  invoice_number TEXT NOT NULL,
  contact_name TEXT NOT NULL DEFAULT '',
  contact_sage_id TEXT,
  reference TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'UNPAID',
  date TEXT NOT NULL,
  due_date TEXT,
  net_cents INTEGER NOT NULL DEFAULT 0,
  tax_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  outstanding_cents INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS sage_invoices_sage_id_idx ON sage_invoices (sage_id);

CREATE TABLE IF NOT EXISTS sage_connection (
  id TEXT PRIMARY KEY,
  environment TEXT NOT NULL DEFAULT 'sandbox',
  business_name TEXT DEFAULT 'Giant Promotions Limited (Sage Sandbox)',
  access_token TEXT,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  resource_owner_id TEXT,
  next_number_preview INTEGER NOT NULL DEFAULT 232016,
  last_sync_at TIMESTAMPTZ,
  last_sync_status TEXT NOT NULL DEFAULT 'connected',
  last_sync_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activity_log (
  id SERIAL PRIMARY KEY,
  actor_user_id INTEGER REFERENCES users(id),
  actor_name TEXT NOT NULL DEFAULT 'System',
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  summary TEXT NOT NULL,
  metadata_json TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;
