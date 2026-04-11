# Spoke 5 — File watcher — drop-folder ingestion

## What this chat is for
Add a file watcher to the OpenMind server so dropping a .txt file into ~/pm-inbox/ automatically ingests it — no form, no copy-paste. The zero-friction path for Claude conversation exports and long notes.

## Project context
**OpenMind** is a local-first AI-native project operating system. The file watcher is the third input path alongside the web form (pm-update.html) and direct API calls.

This is **Phase 5 of 5** for the core build. Phases 1-4 must be complete.

## What is already true
- Node.js server running with POST /ingest working
- Supabase tables populated with real data
- Frontend working end-to-end

## What to build

### Folder structure
```
~/pm-inbox/           ← drop .txt files here
~/pm-inbox/processed/ ← server moves files here after ingesting
~/pm-inbox/failed/    ← server moves files here if ingest fails
```

Create the folders:
```bash
mkdir -p ~/pm-inbox/processed
mkdir -p ~/pm-inbox/failed
```

### Add chokidar to the server
```bash
cd ~/openmind-server
npm install chokidar
```

### File watcher code — add to server.js
```javascript
import chokidar from 'chokidar';
import fs from 'fs/promises';
import path from 'path';

const INBOX = path.join(process.env.HOME, 'pm-inbox');
const PROCESSED = path.join(INBOX, 'processed');
const FAILED = path.join(INBOX, 'failed');

const watcher = chokidar.watch(INBOX, {
  ignored: [
    path.join(INBOX, 'processed', '**'),
    path.join(INBOX, 'failed', '**'),
    /(^|[\/\\])\../   // hidden files
  ],
  persistent: true,
  awaitWriteFinish: {
    stabilityThreshold: 1000,  // wait 1s after last write before processing
    pollInterval: 200
  }
});

watcher.on('add', async (filePath) => {
  if (!filePath.endsWith('.txt')) return;

  console.log(`[inbox] new file detected: ${filePath}`);

  try {
    const text = await fs.readFile(filePath, 'utf-8');
    const filename = path.basename(filePath);

    // Ingest using the same pipeline as POST /ingest
    await ingestText(text, {
      source: 'file-drop',
      project_hint: extractProjectHintFromFilename(filename)
    });

    // Move to processed
    await fs.rename(filePath, path.join(PROCESSED, filename));
    console.log(`[inbox] processed: ${filename}`);

  } catch (err) {
    console.error(`[inbox] failed: ${filePath}`, err);
    const filename = path.basename(filePath);
    await fs.rename(filePath, path.join(FAILED, filename)).catch(() => {});
  }
});

// Extract project hint from filename convention: "PROJECTCODE_description.txt"
// e.g. "CONFIMO_meeting-notes-apr-11.txt" → project_hint: "CONFIMO"
function extractProjectHintFromFilename(filename) {
  const match = filename.match(/^([A-Z0-9\-]+)_/);
  return match ? match[1] : null;
}

console.log(`[inbox] watching ${INBOX}`);
```

### Refactor ingest logic into a shared function
The POST /ingest route and the file watcher both need the same pipeline. Extract it:

```javascript
// Shared ingest function — called by both the HTTP route and the file watcher
async function ingestText(text, options = {}) {
  const { source = 'unknown', project_hint = null } = options;

  // Run extraction and embedding in parallel
  const [extraction, embedding] = await Promise.all([
    runExtraction(text, project_hint),
    generateEmbedding(text)
  ]);

  // Write to Supabase
  await writeToSupabase(extraction, embedding, text, source);

  return extraction;
}
```

### Filename convention for project hints
Document this for Achim's workflow. When dropping a file, prefix with the project code:
```
CONFIMO_meeting-apr-11.txt      → auto-assigns to Confimo project
IMD-CMT_workshop-notes.txt      → auto-assigns to IMD project
OPENMIND_build-session-2.txt    → auto-assigns to OpenMind project
untitled-notes.txt              → auto-detect from content
```

## Test sequence

```bash
# 1. Verify inbox is being watched
node server.js
# Should log: [inbox] watching /Users/admin/pm-inbox

# 2. Drop a test file
echo "Met with Confimo team. Decided to run pilot with 3 users in May. 
Next step: get IT security sign-off. Harald to send approval request by Friday." \
> ~/pm-inbox/CONFIMO_test-drop.txt

# 3. Watch the server logs — should see:
# [inbox] new file detected: .../CONFIMO_test-drop.txt
# [inbox] processed: CONFIMO_test-drop.txt

# 4. Check ~/pm-inbox/processed/ — file should be there
ls ~/pm-inbox/processed/

# 5. Check Supabase — new rows in updates, tasks, decisions, embeddings
```

## Claude export workflow
The primary use case for the file watcher. At the end of any Claude conversation:

1. Ask Claude: *"Summarise this conversation as a project update for OpenMind"*
2. Copy the output
3. Paste into a .txt file named `PROJECTCODE_description.txt`
4. Drop into `~/pm-inbox/`
5. Done — appears in dashboard within 30 seconds

This is the bridge between ephemeral Claude conversations and persistent project memory.

## Done when
- Drop a .txt file into ~/pm-inbox/ → appears in Supabase within 30 seconds
- Processed files move to ~/pm-inbox/processed/
- Failed files move to ~/pm-inbox/failed/ with error logged
- Filename project hint correctly assigns to the right project
- File watcher survives server restart (launchd handles this — already configured in Spoke 3)

## System is complete when this spoke is done
Full loop verified:
1. Paste via pm-update.html on phone → structured in Supabase ✓
2. Drop .txt file into inbox → structured in Supabase ✓
3. Dashboard shows all projects and recent activity ✓
4. Search returns semantically relevant results ✓

## Next after this
**Spoke 6 — Kindling bridge (deferred).** After 4-6 weeks of real use, integrate the Kindling personal network visualizer. Add `contact_id` FK to projects table. Add `project_id` FK to Kindling person schema. Link people to projects.
