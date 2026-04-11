# Spoke 4 — Frontend — dashboard, capture, search

## What this chat is for
Build the three HTML pages that make OpenMind usable day-to-day. These are static files pushed to GitHub Pages. They read from Supabase directly and write via the OpenMind Node.js server. By the end of this session the full loop works: paste a note on your phone → appears in dashboard → searchable by meaning.

## Project context
**OpenMind** is a local-first AI-native project operating system. The frontend is three static HTML pages on GitHub Pages, matching the existing sprint platform design system exactly.

This is **Phase 4 of 5**. Phases 1-3 must be complete before starting this.

## What is already true
- GitHub Pages repo: `https://blackmath88.github.io/onehour-minisprint/`
- `supabase-client.js` already in repo — reuse as-is
- Design system established: Plus Jakarta Sans + Inter, Indigo-on-Cream palette
- Tailscale IP confirmed from Spoke 3 — fill in below

## Prerequisites — fill these in before starting
```
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SERVER_URL=http://100.x.x.x:3000   ← Tailscale IP from Spoke 3
```

## Design system reference
Match the existing sprint platform exactly:

```css
/* Palette */
--primary: #2a14b4;
--primary-soft: #eeedfe;
--bg: #faf9f5;
--surface: #ffffff;
--text: #1a1a18;
--muted: #6b6b66;
--border: #e2e0d8;
--radius: 12px;

/* Fonts */
font-family: 'Plus Jakarta Sans', sans-serif;  /* headlines */
font-family: 'Inter', sans-serif;              /* body */
```

Status badge colors:
- `active` → indigo background (#eeedfe), indigo text (#2a14b4)
- `paused` → amber background, amber text
- `done` → green background, green text
- `archived` → gray background, gray text

## Page 1 — pm-dashboard.html

**Purpose:** Portfolio view — all projects at a glance, recent activity, open tasks.

**Data sources (all Supabase REST, no server needed):**
- `projects` table — all rows, ordered by updated_at desc
- `updates` table — 10 most recent, with project_id join
- `tasks` table — open tasks, grouped by project_id

**Layout:**
```
Header: "OpenMind" + "New update" button (→ pm-update.html) + search icon (→ pm-search.html)

Project cards grid (2 cols desktop, 1 col mobile):
  Each card:
  - Project title + code badge
  - Status badge (active / paused / done)
  - Description (truncated to 2 lines)
  - Open task count
  - Last updated timestamp
  - "View updates" link

Recent activity feed (below cards):
  - Last 10 updates across all projects
  - Each item: project code badge + summary + source tag + relative timestamp
```

**Key interactions:**
- Click project card → expands or links to filtered view
- "New update" button → pm-update.html
- Search icon → pm-search.html

## Page 2 — pm-update.html

**Purpose:** Quick capture — paste raw text from anywhere, submit to server, confirm extraction before saving.

**Flow:**
1. Load project list from `GET /projects` (server endpoint, not Supabase direct)
2. User selects project from dropdown (or leaves as "auto-detect")
3. User pastes raw text into large textarea
4. User selects source tag: meeting / claude-export / note / voice
5. User hits "Process" → POST to `SERVER_URL/ingest`
6. Server returns extracted summary, tasks, decisions
7. Show confirmation panel: "Here's what was extracted — does this look right?"
8. User confirms → data is already saved (the server saved on ingest)
9. Show success toast + "Back to dashboard" link

**UI notes:**
- Large textarea — minimum 200px height, comfortable on mobile
- Project dropdown loads on page load — show "Loading projects..." until ready
- Process button shows spinner while server is working (qwen2.5:3b takes 2-4 seconds)
- Confirmation panel shows: summary text, task list with checkboxes, decisions list
- If server is unreachable (Mac Mini offline), show clear error: "Server offline — try again later or save note to ~/pm-inbox/"

**POST /ingest payload:**
```javascript
{
  text: textarea.value,
  project_hint: selectedProjectId || null,
  source: selectedSource  // "meeting" | "claude-export" | "note" | "voice"
}
```

## Page 3 — pm-search.html

**Purpose:** Semantic search across all project history using natural language.

**Flow:**
1. User types natural language query
2. POST to `SERVER_URL/search`
3. Display results ranked by cosine similarity
4. Each result shows: project code, date, input type, summary excerpt
5. Click result → expand to show full raw_text

**UI notes:**
- Large search input, prominent
- Results appear below as cards
- Each result card: project badge + date + type tag + similarity score (as a subtle bar, not a raw number) + summary
- Empty state: "Search across all your project history — try 'Confimo invoice pilot' or 'decisions made in March'"
- No results state: "No similar content found. Try different keywords."

**POST /search payload:**
```javascript
{
  query: searchInput.value,
  limit: 8
}
```

## Shared components to extract

Create a `pm-shared.js` file with:
```javascript
// Supabase client (reuse existing pattern)
// Status badge renderer
// Relative timestamp formatter ("2 hours ago", "3 days ago")
// Project code badge renderer
// Toast notification
// Server URL constant (Tailscale IP)
```

## File structure
```
/onehour-minisprint/
  pm-dashboard.html    ← new
  pm-update.html       ← new
  pm-search.html       ← new
  pm-shared.js         ← new shared utilities
  supabase-client.js   ← existing, reuse
  lang.js              ← existing, reuse
```

## Test sequence
1. Open pm-dashboard.html — project cards load from Supabase
2. Click "New update" — pm-update.html loads, project dropdown populated
3. Paste real meeting notes → hit Process → see extracted summary
4. Confirm → success toast
5. Back to dashboard → activity feed shows the new update
6. Open pm-search.html → search for a keyword from the notes → result appears
7. Test from phone on 4G with WiFi off — full loop should work

## Done when
- Dashboard shows all seeded projects with correct data
- Update form processes real text and shows extracted summary
- Search returns semantically relevant results
- Full loop works from mobile on 4G
- All three pages match the sprint platform design system

## Hands off to
**Spoke 5 — File watcher.** Once the frontend works end-to-end, Spoke 5 adds the drop-folder ingestion path so Claude conversation exports can be ingested by just dropping a .txt file into ~/pm-inbox/.
