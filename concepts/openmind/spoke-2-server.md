# Spoke 2 — Node.js server + Ollama integration

## What this chat is for
Build the OpenMind orchestration server from scratch. A clean, purpose-built Node.js + Express server running on the Mac Mini. By the end of this session all four endpoints work and the full ingestion pipeline is verified with curl.

## Project context
**OpenMind** is a local-first AI-native project operating system. This server is the intelligence layer — it receives raw text, runs two local AI models in parallel, and writes structured data + vectors to Supabase.

This is **Phase 2 of 5**. Phase 1 (Supabase schema) must be complete before starting this.

## What is already true
- Mac Mini M1 8GB — dedicated server, always on
- Node.js v25.8.2, npm v11.11.1 installed
- Ollama v0.19.0 running on localhost:11434
- Models installed: `qwen2.5:3b` (extraction), `nomic-embed-text` (embeddings)
- Supabase project exists with all five tables: projects, updates, tasks, decisions, embeddings
- RLS policies in place — anon key access

## Prerequisites from Spoke 1
Fill these in before starting:
```
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
```

## What to build

### File structure
```
~/openmind-server/
  server.js        ← main server file
  package.json
  .env             ← Supabase credentials + config
  .gitignore       ← exclude .env and node_modules
```

### package.json dependencies
```json
{
  "name": "openmind-server",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "express": "^4.18.0",
    "cors": "^2.8.5",
    "@supabase/supabase-js": "^2.0.0",
    "dotenv": "^16.0.0"
  }
}
```

### Four endpoints to implement

**POST /ingest**
- Input: `{ text: string, project_hint?: string, source?: string }`
- Fire two jobs in parallel using Promise.all:
  1. Call qwen2.5:3b twice — `classify_input` and `extract_structure` (can be sequential within the Gemma track, or parallel)
  2. Call nomic-embed-text for embedding
- Write to Supabase: updates row, tasks rows, decisions rows, embeddings row
- Return: `{ success: true, update_id, project_id, tasks_created, decisions_created }`

**POST /search**
- Input: `{ query: string, limit?: number, project_id?: string }`
- Embed the query string with nomic-embed-text
- Run pgvector cosine similarity via Supabase RPC
- Return top-k results with source metadata

**GET /projects**
- Query Supabase projects table
- Return array of `{ id, code, title, status, description }`

**GET /health**
- Check Ollama is reachable: GET http://localhost:11434/api/tags
- Check Supabase is reachable: simple projects count query
- Return: `{ ollama: true/false, supabase: true/false, models: [...], last_ingest: timestamp }`

## Ollama API calls

**Generate (extraction):**
```javascript
const response = await fetch('http://localhost:11434/api/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'qwen2.5:3b',
    prompt: YOUR_PROMPT,
    stream: false,
    format: 'json'
  })
});
const data = await response.json();
const result = JSON.parse(data.response);
```

**Embeddings:**
```javascript
const response = await fetch('http://localhost:11434/api/embeddings', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'nomic-embed-text',
    prompt: text
  })
});
const data = await response.json();
const vector = data.embedding; // float[768]
```

## Extraction prompts

### classify_input prompt
```
You are a project management assistant. Analyze the following text and classify it.
Respond ONLY with valid JSON matching this exact schema — no preamble, no explanation:
{
  "input_type": "update | decision | task_list | idea | meeting_note | reflection",
  "project_id_guess": "string or null — guess the project code if obvious",
  "confidence": "high | medium | low"
}

Text to classify:
"""
${text}
"""
```

### extract_structure prompt
```
You are a project management assistant. Extract structured information from the following text.
Respond ONLY with valid JSON matching this exact schema — no preamble, no explanation:
{
  "summary": "2-3 sentence summary of the key content",
  "tasks": [{ "title": "string", "status": "open", "due_date": "ISO date or null" }],
  "decisions": [{ "body": "string", "context": "string" }],
  "status_change": { "old_status": "string", "new_status": "string" } or null,
  "tags": ["string"],
  "next_review_date": "ISO date or null"
}

Text to extract from:
"""
${text}
"""
```

## pgvector search — Supabase RPC
Create this function in Supabase SQL Editor (one-time setup):

```sql
CREATE OR REPLACE FUNCTION match_embeddings(
  query_embedding vector(768),
  match_count int DEFAULT 5,
  filter_project_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  source_id uuid,
  source_type text,
  content text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.source_id,
    e.source_type,
    e.content,
    1 - (e.embedding <=> query_embedding) AS similarity
  FROM embeddings e
  WHERE filter_project_id IS NULL OR e.source_id IN (
    SELECT id FROM updates WHERE project_id = filter_project_id
  )
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

Then call it from the server:
```javascript
const { data } = await supabase.rpc('match_embeddings', {
  query_embedding: vector,
  match_count: limit || 5,
  filter_project_id: project_id || null
});
```

## Error handling priorities
1. Ollama JSON parse failures — qwen2.5:3b sometimes returns malformed JSON even with `format: 'json'`. Wrap all JSON.parse in try/catch. On failure, store raw_text only, log the error, still write the embedding.
2. Supabase write failures — log but don't crash. Return partial success.
3. Never let a single bad input crash the server.

## Test sequence
Once server is running (`node server.js`), test in order:

```bash
# 1. Health check
curl http://localhost:3000/health

# 2. Project list
curl http://localhost:3000/projects

# 3. Ingest a real project update
curl -X POST http://localhost:3000/ingest \
  -H "Content-Type: application/json" \
  -d '{"text": "Had a good meeting with the Confimo team today. We decided to use Claude for invoice categorization. Next step is to set up a pilot with 3 users by end of April. Main blocker is IT security approval.", "source": "meeting"}'

# 4. Check Supabase — rows should appear in updates, tasks, decisions, embeddings tables

# 5. Search
curl -X POST http://localhost:3000/search \
  -H "Content-Type: application/json" \
  -d '{"query": "Confimo invoice pilot", "limit": 3}'
```

## Done when
- `GET /health` returns ollama: true, supabase: true
- `POST /ingest` with real text → structured rows in all relevant Supabase tables
- `POST /search` returns semantically relevant results
- Server survives a bad JSON response from qwen2.5:3b without crashing

## Hands off to
**Spoke 3 — Tailscale remote access.** Once server works locally, Spoke 3 exposes it to the internet so update.html can POST from anywhere.
