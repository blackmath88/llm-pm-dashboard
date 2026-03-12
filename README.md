# llm-pm-dashboard
LLM-native project management. Update projects by chatting with Claude/ChatGPT,  store structured data in GitHub (version-controlled JSON), view everything in  a modern dashboard. Cloudflare Worker handles auth, validation &amp; caching.  Zero vendor lock-in, runs free on Cloudflare/GitHub free tiers. 

This repository contains the full V4 implementation of the LLM‑driven PM system:

- Cloudflare Worker gateway (secure GitHub API layer)
- Squarespace dashboard HTML (read‑only UI)
- LLM system prompt (write interface)
- Example project JSON (Confimo)
- Setup guides

## Files

- `cloudflare-worker-fixed.js` — Worker gateway (production-ready)
- `pm-index-v4.html` — Projects list (Squarespace page `/pm`)
- `pm-project-v4.html` — Project detail view (`/pm/project`)
- `CHAT-PROMPT-V4.md` — LLM system prompt for updates
- `confimo-ai-2026.json` — Example project data
- `index.json` — Project registry (example)
- `WORKER-SETUP.md` — Cloudflare Worker setup guide
- `SQUARESPACE-GUIDE.md` — Squarespace deployment guide
- `PRODUCTION-FIXES.md` — Summary of fixes + QA checklist

## Quick Start

1. Deploy Worker (`cloudflare-worker-fixed.js`)
2. Upload HTML files to Squarespace
3. Paste system prompt into Claude / ChatGPT / Copilot
4. Update via chat → refresh dashboard

---

You now have a production‑grade PM system backed by GitHub.
