# Spoke 3 — Tailscale remote access

## What this chat is for
Expose the OpenMind Node.js server to the internet via Tailscale so pm-update.html on GitHub Pages can POST to it from anywhere — phone, client site, anywhere with 4G. Short session, ~30 minutes.

## Project context
**OpenMind** is a local-first AI-native project operating system. The Node.js server runs on a dedicated Mac Mini M1. Tailscale creates a private mesh VPN so the server is reachable from any device on the same Tailscale account.

This is **Phase 3 of 5**. Phase 2 (Node.js server working locally) must be complete before starting this.

## What is already true
- Tailscale v1.96.4 installed on Mac Mini
- Node.js server running on port 3000
- Auth status unknown — first step is to check

## Step 1 — Check Tailscale status
```bash
tailscale status
```

**If already authenticated:** you'll see your Mac Mini listed with a 100.x.x.x IP. Skip to Step 3.

**If not authenticated:**
```bash
tailscale up
```
Follow the browser auth flow. Log in with your Tailscale account (or create one at tailscale.com — free for personal use).

## Step 2 — Install Tailscale on your other devices
Install Tailscale on:
- Your laptop (if not already)
- Your iPhone — Tailscale app from App Store

Log in with the same account on all devices. They all join the same private mesh automatically.

## Step 3 — Get the Mac Mini's Tailscale IP
```bash
tailscale ip -4
```
Returns something like `100.x.x.x`. This is your permanent private IP — it never changes even if your home router IP changes.

Note it down. This goes into pm-update.html and pm-search.html as the server URL:
```
http://100.x.x.x:3000
```

## Step 4 — Test from Mac Mini itself
```bash
curl http://$(tailscale ip -4):3000/health
```
Should return the same health JSON as `localhost:3000/health`.

## Step 5 — Test from your phone on 4G
Turn off WiFi on your phone. Make sure Tailscale is running.
Open the browser and navigate to:
```
http://100.x.x.x:3000/health
```
Should return health JSON. If it does, remote access is working.

## Step 6 — CORS configuration
The Node.js server needs to allow requests from GitHub Pages. Add this to server.js if not already present:

```javascript
import cors from 'cors';

app.use(cors({
  origin: [
    'https://blackmath88.github.io',
    'http://localhost:8080'  // for local dev
  ],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));
```

Restart the server after adding this:
```bash
# Stop current server (Ctrl+C if running in foreground)
node server.js
```

## Step 7 — Auto-start on boot (launchd)
This is what makes the Mac Mini a real server. Without this, the server dies on reboot.

Create a launchd plist for the Node server:
```bash
nano ~/Library/LaunchAgents/com.openmind.server.plist
```

Paste this (replace YOUR_USERNAME with your Mac username — `admin` based on the terminal prompt):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.openmind.server</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/Users/admin/openmind-server/server.js</string>
  </array>
  <key>WorkingDirectory</key>
  <string>/Users/admin/openmind-server</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/Users/admin/openmind-server/logs/stdout.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/admin/openmind-server/logs/stderr.log</string>
</dict>
</plist>
```

Create the logs folder and load the service:
```bash
mkdir -p ~/openmind-server/logs
launchctl load ~/Library/LaunchAgents/com.openmind.server.plist
launchctl start com.openmind.server
```

Verify it's running:
```bash
launchctl list | grep openmind
curl http://localhost:3000/health
```

## Step 8 — Also ensure Ollama starts on boot
Check if Ollama has a launchd service already:
```bash
launchctl list | grep ollama
```

If not running as a service, add it:
```bash
# Ollama installs its own launchd agent via brew services
brew services start ollama
brew services list | grep ollama
```

## Done when
- `tailscale status` shows Mac Mini with a stable 100.x.x.x IP
- `curl http://100.x.x.x:3000/health` works from phone on 4G with WiFi off
- CORS configured for GitHub Pages origin
- Node server and Ollama both start automatically on reboot
- Test reboot: restart Mac Mini, wait 60 seconds, curl /health from phone

## Hands off to
**Spoke 4 — Frontend.** Once the server is reachable from anywhere, Spoke 4 builds the three HTML pages that talk to it.

Note the Tailscale IP for Spoke 4:
```
SERVER_URL=http://100.x.x.x:3000
```
