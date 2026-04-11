# Spoke 1 — Supabase schema + seed data

## What this chat is for
Set up the OpenMind database layer in Supabase. By the end of this session the database exists, all tables are created, RLS is configured, and 3-5 real projects are seeded. No code, no server — just SQL and data.

## Project context
**OpenMind** is a local-first AI-native project operating system built by Achim Imboden. Mac Mini M1 runs a Node.js server + Ollama (qwen2.5:3b + nomic-embed-text). Supabase is the cloud storage layer. GitHub Pages serves the static frontend. Zero cloud inference cost.

This is **Phase 1 of 5**. The hub chat holds all architecture decisions. This spoke executes one piece.

## What is already true
- Supabase project already exists — same project as the Decision Jam sprint platform at `https://blackmath88.github.io/onehour-minisprint/`
- `supabase-client.js` already exists in the repo
- Same anon key and project URL are already in use — reuse them
- RLS pattern already established in the sessions table — replicate it

## Your job in this chat
1. Run the SQL below in the Supabase SQL Editor
2. Configure RLS policies
3. Seed 3-5 real active projects
4. Verify with a test REST query from the browser

## Step 1 — Enable pgvector extension
Run in Supabase SQL Editor:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

## Step 2 — Create all five tables
Run each block separately. Check for errors after each one.

```sql
CREATE TABLE projects (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  code text UNIQUE,
  title text NOT NULL,
  status text DEFAULT 'active',
  description text,
  context_url text,
  facilitator text,
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);
```

```sql
CREATE TABLE updates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  raw_text text,
  summary text,
  input_type text,
  source text,
  submitted_at timestamptz DEFAULT now()
);
```

```sql
CREATE TABLE tasks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  update_id uuid REFERENCES updates(id) ON DELETE SET NULL,
  title text NOT NULL,
  status text DEFAULT 'open',
  due_date date,
  created_at timestamptz DEFAULT now()
);
```

```sql
CREATE TABLE decisions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  update_id uuid REFERENCES updates(id) ON DELETE SET NULL,
  body text NOT NULL,
  made_at timestamptz DEFAULT now()
);
```

```sql
CREATE TABLE embeddings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  source_id uuid NOT NULL,
  source_type text NOT NULL,
  content text NOT NULL,
  embedding vector(768),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX ON embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

## Step 3 — RLS policies
Enable RLS and allow public read/write on all five tables. Same pattern as the sessions table in the sprint platform.

```sql
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read" ON projects FOR SELECT USING (true);
CREATE POLICY "public write" ON projects FOR INSERT WITH CHECK (true);
CREATE POLICY "public update" ON projects FOR UPDATE USING (true);

CREATE POLICY "public read" ON updates FOR SELECT USING (true);
CREATE POLICY "public write" ON updates FOR INSERT WITH CHECK (true);

CREATE POLICY "public read" ON tasks FOR SELECT USING (true);
CREATE POLICY "public write" ON tasks FOR INSERT WITH CHECK (true);
CREATE POLICY "public update" ON tasks FOR UPDATE USING (true);

CREATE POLICY "public read" ON decisions FOR SELECT USING (true);
CREATE POLICY "public write" ON decisions FOR INSERT WITH CHECK (true);

CREATE POLICY "public read" ON embeddings FOR SELECT USING (true);
CREATE POLICY "public write" ON embeddings FOR INSERT WITH CHECK (true);
```

## Step 4 — Seed projects
Ask Achim for his 3-5 active projects. Then insert them. Example shape:

```sql
INSERT INTO projects (code, title, status, description) VALUES
  ('CONFIMO', 'Confimo AG AI-Enabled Buchhaltung Transformation', 'active', 'AI adoption and process transformation for Confimo AG finance team'),
  ('IMD-CMT', 'IMD Change Management Toolbox', 'active', 'Digital change management tool suite for IMD business school'),
  ('OPENMIND', 'OpenMind PM System', 'active', 'Building this system — local-first AI-native project operating system'),
  ('KINDLING', 'Kindling Network Visualizer', 'active', 'Personal professional network visualizer — D3 force graph');
```

Replace with Achim's real project names and descriptions.

## Step 5 — Verify
Run this in the Supabase SQL Editor to confirm everything looks right:
```sql
SELECT id, code, title, status FROM projects ORDER BY created_at;
```

Then test the REST API from the browser console (on any page that has supabase-client.js loaded):
```javascript
const { data } = await supabase.from('projects').select('*');
console.log(data);
```

## Done when
- All five tables exist with correct columns
- pgvector extension enabled
- RLS policies in place
- 3-5 real projects seeded
- REST query returns rows

## Hands off to
**Spoke 2 — Node.js server + Ollama integration.** Once this spoke is done, paste the Supabase project URL and anon key into the Spoke 2 handoff `.env` section.
