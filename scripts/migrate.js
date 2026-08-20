import pg from "pg";
const { Client } = pg;

const sql = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  microsoft_tenant_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  microsoft_oid text,
  email text,
  name text NOT NULL,
  role text NOT NULL DEFAULT 'member',
  department text NOT NULL DEFAULT 'Geral',
  job_title text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, microsoft_oid)
);

CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'Em andamento',
  progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  owner_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'A Fazer',
  priority text NOT NULL DEFAULT 'Média',
  department text NOT NULL DEFAULT 'Geral',
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  owner_id uuid REFERENCES users(id) ON DELETE SET NULL,
  due_date date,
  monitor_outlook boolean NOT NULL DEFAULT false,
  mail_keywords text[] NOT NULL DEFAULT '{}',
  mail_domain text,
  mail_contact text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  outlook_message_id text NOT NULL,
  internet_message_id text,
  subject text NOT NULL,
  from_name text,
  from_email text,
  received_at timestamptz NOT NULL,
  preview text,
  body_excerpt text,
  task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
  score integer NOT NULL DEFAULT 0,
  unread boolean NOT NULL DEFAULT true,
  action_suggested boolean NOT NULL DEFAULT false,
  web_link text,
  source text NOT NULL DEFAULT 'microsoft_graph',
  created_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, outlook_message_id)
);

CREATE TABLE IF NOT EXISTS decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  task_id uuid REFERENCES tasks(id) ON DELETE CASCADE,
  title text NOT NULL,
  detail text,
  status text NOT NULL DEFAULT 'Pendente',
  owner_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pending_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  task_id uuid REFERENCES tasks(id) ON DELETE CASCADE,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'Aberta',
  owner_id uuid REFERENCES users(id) ON DELETE SET NULL,
  due_date date,
  origin text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS activity (
  id bigserial PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  task_id uuid REFERENCES tasks(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  detail text,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS integration_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  refresh_token_enc text NOT NULL,
  scopes text,
  connected_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_tasks_org_status ON tasks (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_org_due ON tasks (organization_id, due_date);
CREATE INDEX IF NOT EXISTS idx_emails_org_received ON emails (organization_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_emails_task ON emails (task_id);
CREATE INDEX IF NOT EXISTS idx_decisions_task ON decisions (task_id);
CREATE INDEX IF NOT EXISTS idx_pending_task ON pending_items (task_id);
`;

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("localhost") ? false : { rejectUnauthorized: false }
});
await client.connect();
await client.query(sql);
await client.end();
console.log("Migração concluída.");
