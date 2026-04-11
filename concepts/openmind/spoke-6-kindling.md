# Spoke 6 — Kindling bridge — contact network layer (deferred)

## What this chat is for
Connect OpenMind (project management) with Kindling (personal network visualizer). Two-way bridge: projects know which people are involved, people know which projects they're connected to.

## Status
**Deferred — do not start until OpenMind Phases 1-5 have been running in real use for 4-6 weeks.**

The reason: the bridge should be shaped by how you actually use both tools, not by upfront design. After a month of use you'll know which connections matter most.

## Project context

**OpenMind** — local-first AI-native PM system. Supabase backend. GitHub Pages frontend. Node.js server on Mac Mini.

**Kindling** — personal professional network visualizer. Single HTML file. D3.js force graph. Warmth-based relationship tracking. Repo: `https://github.com/achimimboden/kindling`

Both tools are built by Achim Imboden. This spoke connects them.

## The bridge — minimal and reversible

Two changes. That's it.

**Change 1 — OpenMind projects table**
Add a contacts array to projects:
```sql
ALTER TABLE projects ADD COLUMN contact_ids text[] DEFAULT '{}';
```

This stores Kindling contact IDs (the `id` slug from CONTACTS array) against a project. Example: `['philippe-matter', 'sebastian-ritter']`.

**Change 2 — Kindling person schema**
Add a project_ids field to each person in the CONTACTS array:
```javascript
{
  id: "philippe-matter",
  name: "Philippe Matter",
  // ... existing fields ...
  project_ids: ["CONFIMO", "IMD-CMT"]  // ← add this
}
```

No backend needed for Kindling — it's still a single HTML file. The project links are just metadata in the data array.

## What this enables

**In OpenMind dashboard:**
- Project card shows linked contacts as small avatar chips
- Click a contact chip → opens Kindling filtered to that person (if hosted on GitHub Pages)

**In Kindling:**
- Person node tooltip shows active projects
- Filter graph by project code — see everyone involved in CONFIMO, for example
- Ghost nodes for projects that need contacts but don't have them yet

## Implementation plan

### Phase A — Data bridge (1 hour)
1. Add `contact_ids` column to projects table (SQL above)
2. Update existing project seed data with known contact IDs
3. Update Kindling CONTACTS array with `project_ids` for key people

### Phase B — OpenMind UI (2 hours)
1. Add contact chips to pm-dashboard.html project cards
2. Load contact names from Kindling's CONTACTS array (fetch the raw GitHub file, parse it)
3. Click chip → open `https://blackmath88.github.io/kindling/?person=CONTACT_ID`

### Phase C — Kindling UI (1-2 hours)
1. Add project badges to person detail panel in Kindling
2. Add "filter by project" option to Kindling's filter bar
3. Show project-connected nodes with a subtle ring highlight

## Open questions to answer before starting
- Is Kindling deployed on GitHub Pages? If not, deploy it first.
- Are contact IDs stable (not changing)? The bridge breaks if IDs change.
- How many contacts currently in Kindling? Shapes how much seed data work is needed.
- Should contact data live in Supabase instead of hardcoded in Kindling HTML? (Natural evolution if contact list grows beyond ~50 people)

## Supabase contacts table — optional future step
If Kindling outgrows a single HTML file, migrate contacts to Supabase:
```sql
CREATE TABLE contacts (
  id text PRIMARY KEY,  -- same slug format as Kindling
  name text NOT NULL,
  company text,
  role text,
  warmth text DEFAULT 'cold',
  last_contact date,
  notes text,
  project_ids text[] DEFAULT '{}',
  tags text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
```

Then both OpenMind and Kindling read from the same source of truth. This is a natural Phase 7 if the system grows.

## Done when
- project cards in OpenMind show linked contacts
- Person nodes in Kindling show linked projects
- Filter by project in Kindling works
- Full loop: add a contact to a project → appears in both tools instantly
