# My CLI — Project Proposal v2

**SEHH3140 Programming Project — Group 8**

24121627A YU Shing Hei · 24129268A CHEN Jian Hong · 24160192A HUANG Chi Yeung · 24079654A WONG Kam Yiu

---

## 1. What Is My CLI?

**My CLI (My Clean Logging Interface) is an offline-first personal terminal — a web app that lets you write, communicate, and broadcast through a single retro CRT interface, with a plugin system that brings AI capabilities directly into your workflow.**

Think of it as your own digital command station. Open any browser, start typing — no install, no account required. Your data stays on your device unless you choose to sync it.

### One-liner

> A privacy-first, offline-capable writing terminal with versioned timelines, real-time P2P messaging, public broadcasting, and built-in AI — all in a browser.

### App Category

**Extensible Personal Productivity Terminal** — combining personal information management, peer-to-peer communication, and public content distribution in one unified interface with a modular plugin (MOD) architecture.

---

## 2. The Problem We Are Solving

### 2.1 The real problem in 2026

The problem is NOT "there are no note-taking apps." There are hundreds. The problem is:

**Modern productivity tools demand too much from the user before they deliver any value.**

| Barrier | Examples |
|---------|----------|
| **Mandatory account + data collection** | Notion requires email. Google Keep requires a Google account. Evernote requires email + phone. All collect behavioral data and share with third parties. |
| **No real offline capability** | Notion goes blank without internet. Google Docs needs online for collaboration. Most "offline" modes are degraded read-only states. |
| **Feature overload** | Notion has databases, wikis, calendars, Gantt charts. Users who want to jot down a thought must navigate through feature overwhelm. |
| **No text versioning** | You wrote something yesterday, edited it today — the old version is gone. Google Docs has "version history" buried in menus, limited to 30 days for free users. No branching. No forking. |
| **Communication is always separate** | Your notes are in one app, your messages in another, your announcements in a third. Context-switching between apps breaks focus. |
| **AI requires subscription or cloud dependency** | ChatGPT, Notion AI, Grammarly — all require paid subscriptions, internet connection, and sending your text to external servers. |

### 2.2 What we believe

We believe a personal tool should:

1. **Work instantly** — open a URL, start writing. Zero friction.
2. **Respect your privacy** — data lives on YOUR device. Sync is optional and explicit.
3. **Remember everything** — every version of every thought, automatically timestamped.
4. **Do more than one thing** — notes, messages, and broadcasts in one place.
5. **Be extensible** — if you need AI, translation, or speech-to-text, add it as a plugin.
6. **Be delightful** — tools should feel good to use, not just functional.

---

## 3. Who Is This For?

### 3.1 Primary audience

**Privacy-conscious digital writers who value speed, simplicity, and control over their data.**

This includes:

- **Students** who switch between personal devices and school/library computers (where installing software is impossible)
- **Journalists and researchers** who need to jot notes in the field, sometimes without internet, and cannot risk their drafts being stored on corporate servers
- **Developers and power users** who appreciate a terminal aesthetic and keyboard-driven workflows
- **Creative writers** who benefit from branching timelines — drafting multiple versions of the same piece without losing any of them

### 3.2 User personas

#### Persona A: "The Student" — Emily, 20, University sophomore

**Context:** Emily uses the campus library computers between classes. She cannot install apps on these shared machines. She takes notes on her phone during lectures and needs to continue editing on the library PC.

**Pain point:** WeChat "Message to Self" is chaotic — lecture notes are mixed with shopping links and memes. Google Keep requires her Google login on a shared computer (security risk). USB drives get lost.

**How My CLI helps:** Emily opens `mycli.app` in the library browser. Her notes are already there (cached offline from her phone's PWA). She writes, branches a new timeline for exam revision notes, and syncs to the server when she gets home. No login needed for local use. When she does log in, she uses a simple UID + passcode — no email, no phone number.

#### Persona B: "The Field Reporter" — Kevin, 32, Freelance journalist

**Context:** Kevin covers events in areas with unreliable internet. He needs to take notes, send drafts to his editor, and sometimes publish quick updates publicly.

**Pain point:** His notes app requires internet to sync. His messaging app compresses images. He cannot broadcast updates without posting to social media (which he wants to keep separate from work).

**How My CLI helps:** Kevin writes his field notes on the Blackboard (offline-first, auto-saved). He uses Walkie-Typie to exchange drafts with his editor in real-time when he has connection. He publishes breaking updates via Broadcast channels. The AI MOD helps him polish drafts and translate quotes. One app, three workflows.

#### Persona C: "The Tinkerer" — Alex, 25, CS graduate

**Context:** Alex wants a personal tool he can self-host, customize, and extend. He runs a home server and values data sovereignty.

**How My CLI helps:** Alex deploys My CLI via Docker Compose on his home server, exposed via Cloudflare Tunnel. He builds a custom MOD that integrates his local Ollama LLM for summarizing his daily notes. The MOD system gives him a sandboxed API to extend the platform without touching the core.

---

## 4. Core Concepts — How the App Works

### 4.1 The "Log" philosophy

The name "My Clean Logging Interface" uses "log" in its original meaning — **a chronological record**, like a captain's log, a ship's log, or a personal diary.

Every piece of text in My CLI is a **log entry**: automatically timestamped, immutable once saved, and organized in chronological order. You don't "save files" or "create documents." You **write entries** and **navigate through time**.

This is the core interaction:

```
[PUSH ▲] — Go forward in time (newer entries) / Create new blank entry
[  TEXT  ] — Write here. Auto-saved every 200ms.
[PULL ▼] — Go back in time (older entries)
```

It is intentionally simple. The complexity comes from what you can do with these timelines.

### 4.2 The Board model — one concept, three scopes

Everything in My CLI is a **Board** — a versioned timeline of text entries with optional file attachments. The ONLY difference between the three main features is **who can see the board**:

| Feature | Scope | Who can read | Who can write |
|---------|-------|-------------|---------------|
| **Blackboard** | SELF | Only you | Only you |
| **Walkie-Typie** | PAIR | You + one partner | Each person writes to their own board |
| **Broadcast** | PUBLIC | Everyone | Only the channel owner |

This means learning one feature teaches you all three. The PUSH/PULL navigation, branching, and sync operations work identically across all scopes.

### 4.3 Branches — parallel timelines

Each Board can have multiple **branches** — independent timelines that share no entries. Think of them as separate notebooks within the same scope.

- **Create** a new branch to start a fresh timeline
- **Fork** an existing branch to duplicate all its entries into a new independent timeline (useful for "what if" drafts)
- **Switch** between branches with one click

**This is the "logging" dimension that no other note app offers.** In Google Keep, you have notes. In Notion, you have pages. In My CLI, you have **branching timelines** — every thought you ever wrote, organized by time, with the ability to fork alternative versions.

### 4.4 Local-first storage with manual sync

```
         YOUR DEVICE                         SERVER
    ┌──────────────────┐              ┌──────────────────┐
    │   IndexedDB      │── COMMIT ──▶ │   PostgreSQL     │
    │   (primary)      │◀─ CHECKOUT ──│   (backup)       │
    └──────────────────┘              └──────────────────┘
         always works                   requires login
```

- **No account:** Your data lives in the browser's IndexedDB. Works offline, works without registration.
- **With account:** COMMIT uploads your branch to the server. CHECKOUT downloads a server branch to your device. You control when sync happens.
- **Multi-device:** Enable auto-sync and changes committed on one device appear on others via WebSocket — no manual refresh needed.

### 4.5 Operations glossary

| Operation | What it does | Analogy |
|-----------|-------------|---------|
| **PUSH** | Navigate to a newer entry / create blank entry at the top | Flipping forward in a diary |
| **PULL** | Navigate to an older entry | Flipping backward in a diary |
| **COMMIT** | Upload this branch to the server | Backing up your diary to a safe |
| **CHECKOUT** | Switch to a different branch / download from server | Picking up a different notebook |
| **FORK** | Duplicate all entries into a new independent branch | Photocopying your notebook |
| **DROP** | Delete the server copy of a branch | Removing the backup |
| **CLEAN** | Erase all entries in a branch | Tearing out all pages |

---

## 5. Feature Walkthrough

### 5.1 Blackboard — Your Personal Log (Core)

The Blackboard is the heart of My CLI. It is a **versioned, branch-able personal writing space** that works entirely offline.

**Sub-pages:**

| Page | Purpose |
|------|---------|
| **LOG** | Full-screen text editor with PUSH/PULL navigation and a left-side position indicator |
| **BRANCH** | Branch manager — list of all branches with COMMIT / CHECKOUT / FORK / DROP operations |
| **AUTH** | Account registration and login (UID + passcode, no email required) |
| **MISC** | Settings — language, audio, entry limits, auto-sync toggle |

**Key capabilities:**
- Write text entries with auto-save (200ms debounce to IndexedDB)
- Navigate through time with PUSH (newer) and PULL (older)
- Create new entries by PUSHing past the newest position (enters "virtual" blank state — type anything to create a new entry)
- Manage multiple branches as parallel timelines
- Attach files (drag-and-drop, up to 1GB per file) with local/synced/cloud status indicators
- Editable branch names for organization
- Search/filter branches by name
- Configurable limits: max entries per branch (auto-prune oldest), auto-clean blank entries, timestamp-on-edit behavior

**What this looks like:**

A full-screen monospace text editor with green-on-black CRT styling. A vertical indicator on the left reads `SAVED:branch_name:0` showing your current position. PUSH/PULL buttons at top and bottom edges. Sound effects (retro cassette clicks) accompany every action. A "PRESS START" overlay appears after inactivity, like a CRT screen saver.

### 5.2 Walkie-Typie — Private Paired Boards (DLC 1)

Walkie-Typie is a **peer-to-peer real-time text exchange** system built on the Board model. It requires login.

**Sub-pages:**

| Page | Purpose |
|------|---------|
| **LINK** | Connection list — add/remove partners by UID |
| **TEXT** | Split-screen: partner's board (read-only, top) + your board (editable, bottom) |
| **CONFIG** | Walkie-Typie-specific settings |

**Key capabilities:**
- Connect with any user by entering their UID
- **Real-time keystroke streaming** — your partner sees what you type as you type it (50ms WebSocket whisper, no server persistence)
- **Persistent history** — every 2 seconds, text is committed to the server for permanent storage
- Independent PUSH/PULL navigation on both boards — browse your own history AND your partner's history
- Swappable board positions (your board on top or bottom)
- Browser notifications when partner sends a message while app is in background
- Editable partner nicknames
- File attachments on your board

**How it differs from chat apps:** There are no message bubbles. No "read" receipts. No typing indicators (the text IS the indicator — you literally watch them type). It is two living whiteboards in the same room — persistent, versioned, and navigable through time. This is closer to collaborative document editing than instant messaging.

### 5.3 Broadcast — Public Channels (DLC 2)

Broadcast is a **one-to-many public content distribution system** built on the Board model. Writing requires login; reading is open to everyone.

**Sub-pages:**

| Page | Purpose |
|------|---------|
| **Channel** | Full-screen view of the selected channel with PUSH/PULL navigation |
| **CHANNELS** | Channel list — create, pin, cast (publish), delete |
| **CONFIG** | Broadcast-specific settings |

**Key capabilities:**
- Create local channels (offline, private drafts)
- CAST a channel to make it publicly available on the server
- PIN favorite channels to the top of the list
- Real-time updates via WebSocket when a channel owner publishes new content
- Readers can browse the full history of a channel (PUSH/PULL through time)
- Channel owners can rename channels
- Search/filter channels by name

**Use cases:** News feeds, study group announcements, creative writing publications, public journals, music playlists (as text descriptions), meeting notes shared with a team.

### 5.4 MOD System — Extensible Plugin Architecture

The MOD system is what makes My CLI a **platform**, not just an app. It allows adding new capabilities as self-contained plugins without modifying the core.

**How it works from a user's perspective:**

1. Go to **MODS > LIST** page
2. Browse the **Available MODs** catalog
3. Click a MOD template and press **ADD** to create an instance
4. A new **feature button** appears on the right edge of relevant pages
5. Click the button to activate the MOD's functionality (usually opens a side panel)
6. Configure each instance independently in **MODS > CONFIG**
7. **DELETE** an instance to remove it. There is no "off" toggle — existence = enabled.

**Key architecture decisions:**
- **1 instance = 1 button = 1 behavior.** You can create multiple instances of the same MOD with different configurations (e.g., three Translate buttons for three target languages).
- **Page-aware visibility.** MOD buttons only appear on pages where they are relevant.
- **Sandboxed API.** Each MOD gets a `ctx` object with controlled access to board data, UI elements, storage, events, and network. MODs cannot interfere with each other or the core.

---

## 6. Official MOD Templates (5 Built-In)

### 6.1 LLM — AI Text Processing (Flagship MOD)

**The most significant MOD.** It brings AI text processing directly into the writing workflow.

**Three provider options:**

| Provider | Where it runs | Privacy | Requirements |
|----------|--------------|---------|-------------|
| **CLIENT (BROWSER)** | In your browser via WebGPU | Full privacy — text never leaves your device | Modern GPU, Chrome/Edge |
| **SERVER (OLLAMA)** | Local network Ollama server | Text stays on your network | Self-hosted Ollama instance |
| **API KEY (CLOUD)** | OpenAI / Anthropic cloud | Text sent to cloud provider | Your own API key |

**Client-side AI (WebGPU) is the standout feature.** Using WebLLM, the app downloads and runs Qwen3 language models (0.6B / 1.7B / 4B parameters) directly in the browser. No server, no API key, no internet needed after the initial model download. This means:

- A student in a library with no internet can still use AI to polish their essay
- A journalist can use AI to summarize their field notes without sending sensitive text to any server
- A privacy-conscious user gets AI assistance with zero data exposure

**Configurable per instance:**
- **Prompt:** Free text + preset chips (Summarize, Translate, Polish, Explain)
- **Target scope:** Current text, full branch history, all branches, dialogue (WT), channel history (BC)
- **Icon:** Visual icon picker (6 options)
- **Temperature:** 0.0 — 1.0

**Example setup:** A user creates three LLM instances:
1. "Summarize" button (icon: clipboard) — summarizes the current text
2. "Translate" button (icon: globe) — translates to Chinese
3. "Analyze Branch" button (icon: branch) — analyzes the entire branch history

Each button appears on the sidebar. One click processes the text and streams the AI response into the slide-out panel.

### 6.2 Translate — One-Click Translation

- Translates the current text area content with one button click
- Providers: Google Cloud API (default) or LibreTranslate (self-hosted, fully offline)
- Unlimited instances — create a button for each target language
- CRT-themed feedback messages: "DECRYPTING LINGUISTICS... STANDBY."

### 6.3 Speech-to-Text — Voice Input

- Records audio from the microphone
- Transcribes via Google Speech API
- Inserts transcribed text at cursor position in the Blackboard
- Visual feedback: button turns red (recording) → orange (processing) → default (done)

### 6.4 Markdown Preview — Live Rendering

- Renders the text area content as formatted Markdown in real-time (300ms debounce)
- Client-side only (uses `marked` library, no server needed)
- Supports headings, bold, lists, links, code blocks, tables

### 6.5 Light Theme — Alternative Visual Mode

- Toggles the CRT aesthetic off, switching to clean black-on-white
- Removes all glow effects, scanlines, noise animations, and the banner image
- For users who prefer a minimalist, high-readability interface

---

## 7. UI/UX Design Philosophy

### 7.1 The CRT terminal aesthetic — why it exists

The CRT design is not decoration. It serves three purposes:

1. **Focus.** The monochrome palette with a single accent color eliminates visual noise. Unlike modern "design system" apps with 50+ colors, gradients, and illustrations, the CRT terminal creates a **distraction-free writing environment**. There is nothing to look at except your text.

2. **Identity.** In a market of apps that all look like Notion clones (white background, sans-serif font, pastel accent), the CRT terminal is immediately recognizable. Users remember the app after seeing it once.

3. **Affordance.** The terminal metaphor communicates: "this is a tool for getting things done." The green-on-black monospace text, the sound effects (cassette clicks, Pip-Boy chirps), the "PRESS START" screen, the glitch transitions — they create a sense of operating a purpose-built machine, not browsing a website.

### 7.2 Visual design elements

| Element | Implementation | Purpose |
|---------|---------------|---------|
| **Phosphor green text** on black background | `#32FF32` on `#000`, multi-layer text-shadow glow | Core visual identity |
| **CRT scanlines** | Fixed overlay with 8px repeating linear gradient | Period-accurate CRT simulation |
| **Glitch transitions** | 1.2s noise + hue-rotate + displacement on tab switch | Contextual feedback for navigation |
| **Screen saver** | "PRESS START" overlay after 60s inactivity, with CRT power-on/off animation | Prevents screen burn-in (thematic), signals idle state |
| **Retro sound effects** | 10 MP3s mapped to all interactions (select, cancel, erase, focus, OK) | Tactile feedback reinforcing the terminal metaphor |
| **Head indicator** | Vertical text on left edge: `SAVED:branch:position` | Persistent context without occupying screen space |
| **Accent colors** | Orange (warnings), Red (errors), Cyan (info), Yellow (highlights) | CRT-appropriate limited palette for status communication |

### 7.3 Navigation design

```
┌─────────────────────────────────────────────┐
│          [BLACKBOARD] [WALKIE-TYPIE]        │  ← Main navigation (4 tabs)
│          [BROADCAST]  [MODS]                │
├─────────────────────────────────────────────┤
│     LOG  |  BRANCH  |  AUTH  |  MISC        │  ← Sub-navigation (scrollable)
├─────────────────────────────────────────────┤
│  ┌─────────────────────────────────────┐ ┌┐ │
│  │                                     │ ││ │  ← Feature buttons (MOD instances)
│  │                                     │ ││ │
│  │          TEXT AREA                  │ ││ │
│  │          (the Board)               │ ││ │
│  │                                     │ ││ │
│  │                                     │ ││ │
│  └─────────────────────────────────────┘ └┘ │
│  [  PUSH ▲  ]              [  PULL ▼  ]     │
└─────────────────────────────────────────────┘
```

- **Main navigation:** 4 sections (Blackboard, Walkie-Typie, Broadcast, MODs)
- **Sub-navigation:** Context-sensitive tabs per section; switchable by click, mouse wheel, or swipe
- **Feature buttons:** MOD instances on the right sidebar, page-aware visibility
- **Content area:** Full-width text area or list view, maximizing writing space
- **Responsive:** `clamp(300px, 86vw, 512px)` container width, mobile-first

### 7.4 Interaction patterns

| Pattern | Implementation |
|---------|---------------|
| **Write** | Type in the text area. Auto-saved 200ms after last keystroke. |
| **Navigate time** | PUSH (newer) / PULL (older) buttons at screen edges |
| **Use a MOD** | Click feature button on right sidebar → shelf panel slides in |
| **Manage branches** | Switch to BRANCH sub-tab → scrollable list with inline operations |
| **Switch context** | Click main nav tab → CRT glitch transition → new section |
| **Multi-step destructive actions** | First click arms the button (changes color + label), second click confirms. Auto-resets after 3 seconds. |

---

## 8. What Makes This Unique — Competitive Analysis

### 8.1 Feature comparison matrix

| Capability | Google Keep | Notion | Telegram | Discord | **My CLI** |
|-----------|-----------|--------|----------|---------|-----------|
| Zero-install, browser-only | Web version (needs account) | Web version (needs account) | Web + native | Web + native | **PWA, no account needed** |
| Full offline functionality | Limited | Minimal | No | No | **Full (IndexedDB)** |
| No mandatory data collection | Google account + telemetry | Email + telemetry | Phone number + telemetry | Email + telemetry | **Optional UID only** |
| Text versioning / history | No | 30-day page history | No | No | **Unlimited, per-branch** |
| Branching / forking text | No | No | No | No | **Yes** |
| P2P real-time messaging | No | No | Yes | Yes | **Yes (keystroke-level)** |
| Public broadcasting | No | Published pages | Channels | Channels | **Versioned channels** |
| In-browser AI (no server) | No | No | No | No | **Yes (WebGPU LLM)** |
| Plugin / extension system | No | Integrations | Bots | Bots | **Full MOD architecture** |
| Self-hostable | No | No | No | No | **Docker Compose** |
| Privacy-first design | No | No | No | No | **Yes** |
| Installable PWA | No | Desktop app | Both | Both | **Yes** |

### 8.2 Unique differentiators (no existing product offers these together)

1. **Versioned text timelines with branching** — No mainstream writing tool lets you fork a piece of text into parallel versions and navigate each independently through time.

2. **Three visibility scopes in one interface** — Personal notes, private P2P messaging, and public broadcasting all use the same Board model. Learn once, use everywhere.

3. **In-browser AI with zero data exposure** — WebGPU-powered LLM runs entirely in the browser. Your text never leaves your device. No other writing tool offers this.

4. **Plugin system designed for composition** — MODs are not afterthoughts. They are first-class citizens with a sandboxed API, independent configuration, and page-aware visibility.

5. **True offline-first** — Not "offline mode." The app is DESIGNED for offline. The server is the backup, not the primary. This is an architectural choice, not a degraded state.

---

## 9. Extensibility and Growth Potential

### 9.1 The MOD system as a platform

The MOD system transforms My CLI from a fixed application into an **extensible platform**. Any developer can create new capabilities by:

1. Creating a template folder with `mod.js` + locale files
2. Adding one line to the manifest
3. Implementing `init()` and `activate()` using the sandboxed `ctx` API

The MOD API provides access to:
- **Board data** — read text, get branch info, get file attachments
- **UI** — toast messages, shelf panel, custom config field types
- **Storage** — per-instance sandboxed key-value store
- **Events** — subscribe/unsubscribe with automatic cleanup
- **Network** — authenticated API calls
- **Tools** — register capabilities that other MODs or AI agents can invoke

### 9.2 Planned roadmap

| Phase | Description | Status |
|-------|-------------|--------|
| **Phase 1: Foundation** | Core Board model (BB + WT + BC), auth, sync, MOD framework | **Complete** |
| **Phase 2: AI Integration** | LLM MOD (client/server/cloud), translate, speech-to-text, markdown | **Complete** |
| **Phase 3: AI Agent Loop** | Multi-turn LLM tool calling — AI can chain translate → summarize → write back | Planned |
| **Phase 4: Hook System** | Event-driven pipelines — auto-translate on typing, AI reactions to new content | Planned |
| **Phase 5: Board Write API** | MODs can create new entries and branches programmatically | Planned |

### 9.3 What could be built as MODs (examples)

- **Code syntax highlighter** — render code blocks with syntax coloring
- **Pomodoro timer** — integrated focus timer that logs sessions to a branch
- **Encryption** — client-side AES encryption of board content
- **Export** — PDF/DOCX/TXT export of branches
- **RSS reader** — pull RSS feeds into Broadcast channels
- **Handwriting recognition** — tablet stylus input converted to text
- **Collaborative whiteboard** — real-time canvas drawing over Walkie-Typie

---

## 10. Demonstration Plan (20-Minute Script)

### Pre-setup (before the demo starts)

- Pre-populate Blackboard with ~3 branches: "Meeting Notes" (5 entries), "Story Draft" (8 entries with a fork), "Daily Log" (10 entries)
- Have a Walkie-Typie partner connected (second device / browser tab)
- Have a Broadcast channel "Class Announcements" with 5 entries
- Install MODs: LLM (Summarize), LLM (Translate), Translate (zh-TW), Markdown Preview

### Script

| Time | Action | What the audience sees | Value demonstrated |
|------|--------|----------------------|-------------------|
| 0:00 | Open app cold (no login) | "PRESS START" → CRT boot animation → Blackboard LOG page | **Zero-friction access** — no login, instantly usable |
| 0:30 | Type a paragraph about today's lecture | Green text appearing in real-time, auto-save indicator flashing | **Distraction-free writing** |
| 1:30 | PUSH to create a new entry, type something else | New blank page, type, indicator shows position 0 | **Versioned timeline** — entries stack chronologically |
| 2:30 | PULL back through 3-4 entries | Scrolling back through time, position indicator counting up | **Navigate through history** like a time machine |
| 3:30 | Switch to BRANCH page, show 3 pre-populated branches | Branch list with names, timestamps, sync status | **Branches as parallel notebooks** |
| 4:30 | FORK the "Story Draft" branch | New branch appears with identical content | **Forking** — duplicate for "what if" experiments |
| 5:30 | COMMIT a branch to server | Upload animation, sync status changes | **Manual sync** — you control when data leaves your device |
| 6:30 | Click Markdown Preview MOD button | Shelf slides in showing rendered markdown | **MOD system** — one click extends functionality |
| 7:30 | Click "Summarize" LLM MOD button | AI processes the text, streams response in shelf | **In-browser AI** — no server, no API key |
| 9:00 | Click "Translate" MOD button | Translation appears in shelf: "DECRYPTING LINGUISTICS..." | **Multi-language support** with themed feedback |
| 10:00 | Switch to WALKIE-TYPIE, show LINK page | Partner list with nicknames and last signal | **P2P Communication** |
| 10:30 | Switch to TEXT page | Split screen: partner's board (top) + your board (bottom) | **Twin blackboard** concept |
| 11:00 | Type on both devices simultaneously | Both sides see keystrokes in real-time | **Real-time keystroke streaming** — not messages, live text |
| 12:00 | PULL back on partner's board | Browse partner's older entries | **Persistent, navigable history** on both sides |
| 13:00 | Switch to BROADCAST | Channel list with pre-populated channels | **Public broadcasting** |
| 13:30 | Show "Class Announcements" channel | Read-only view with PUSH/PULL | **Versioned public content** |
| 14:00 | Create a new channel, CAST it to server | Channel goes public | **Instant publishing** |
| 14:30 | Switch to MODS page | Template catalog + active instances | **The platform story** |
| 15:00 | ADD a new LLM instance, configure it | Config page with prompt, icon, target, provider selection | **Per-instance configuration** |
| 16:00 | Show the instance as a new sidebar button | New icon appears on the relevant page | **1 instance = 1 button** |
| 16:30 | Switch to MISC settings | Language toggle, audio controls, entry limits | **Customizable** |
| 17:00 | Toggle language to Chinese | Entire UI switches to Traditional Chinese | **Full i18n** |
| 17:30 | LOG IN on a second device, enable auto-sync | Second device receives committed branches automatically | **Multi-device sync** |
| 18:30 | Switch to Light Theme | CRT aesthetic disappears, clean white interface | **Light Theme MOD** — accessibility |
| 19:00 | Switch back to CRT theme, show "PRESS START" screen saver | CRT power-on animation | **Immersive experience** |
| 19:30 | Summary slide | — | Wrap-up |

---

## 11. Test Cases

### 11.1 Blackboard — Core functionality

| # | Test Case | Precondition | Steps | Expected Result |
|---|-----------|-------------|-------|-----------------|
| BB-01 | Create new entry | On LOG page, position 0 | PUSH | Blank text area, position indicator shows VIRTUAL state |
| BB-02 | Auto-save | New entry created | Type text, wait 200ms | Head indicator changes from UNSAVED to SAVED |
| BB-03 | Navigate history | 3+ entries exist | PULL twice, then PUSH once | Position increments to 2, then decrements to 1. Correct text displayed at each position. |
| BB-04 | Create branch | On BRANCH page | Enter branch name, confirm | New branch appears in list with timestamp |
| BB-05 | Switch branch | 2+ branches exist | Click branch, press CHECKOUT | LOG page shows entries from selected branch |
| BB-06 | Fork branch | Branch with 5 entries | Select branch, press FORK | New branch appears with identical 5 entries, independent of original |
| BB-07 | COMMIT to server | Logged in, branch has entries | Select branch, press COMMIT | Sync status changes to "synced", server contains branch data |
| BB-08 | CHECKOUT from server | Server has branch not on device | Press CHECKOUT | Branch downloads to local IndexedDB, entries available offline |
| BB-09 | DROP server branch | Branch synced to server | Press DROP | Server copy deleted, local copy status changes to "local" |
| BB-10 | File attachment | On LOG page | Drag and drop a file | File chip appears with LOCAL status above text area |
| BB-11 | Offline operation | No internet connection | Create entries, switch branches, fork | All operations succeed using IndexedDB |
| BB-12 | Entry limit enforcement | Max entries set to 5, branch has 5 entries | Create new entry | Oldest entry pruned, branch still has 5 entries |

### 11.2 Walkie-Typie — P2P Communication

| # | Test Case | Precondition | Steps | Expected Result |
|---|-----------|-------------|-------|-----------------|
| WT-01 | Connect to partner | Both users logged in | Enter partner UID, press ADD | Connection appears in both users' LINK lists |
| WT-02 | Real-time text streaming | Connected, both on TEXT page | Type on Device A | Text appears on Device B's "THEIR BOARD" within 100ms |
| WT-03 | Persistent commit | Connected, text entered | Wait 2 seconds | Text committed to server, retrievable after refresh |
| WT-04 | Navigate partner history | Partner has 3+ entries | PULL on "THEIR BOARD" | Older entries from partner displayed |
| WT-05 | Disconnect | Connected | Press CUT | Connection removed from both users' lists |
| WT-06 | Background notification | App in background, partner sends text | Partner types new text | Browser notification appears: "New message from [partner]" |
| WT-07 | Board swap | On TEXT page | Press swap button | Board positions exchange (your board moves to top) |

### 11.3 Broadcast — Public Channels

| # | Test Case | Precondition | Steps | Expected Result |
|---|-----------|-------------|-------|-----------------|
| BC-01 | Create channel | Logged in | Enter channel name, press CREATE | Local channel appears in CHANNELS list |
| BC-02 | CAST channel | Local channel exists | Select channel, press CAST | Channel becomes public, visible to all users |
| BC-03 | PIN channel | Channel exists | Press PIN | Channel moves to top of list with PIN indicator |
| BC-04 | Read channel (non-owner) | Public channel exists | Select channel | Read-only text area showing latest entry |
| BC-05 | Navigate channel history | Channel has 5+ entries | PULL through entries | Older entries displayed with correct timestamps |
| BC-06 | Real-time update | Subscribed to channel | Owner publishes new entry | New entry appears automatically without refresh |
| BC-07 | Delete channel | Own a channel | Press DELETE (2-step confirm) | Channel removed from list and server |
| BC-08 | Rename channel | Own a channel | Edit channel name inline | Name updated in list and on server |

### 11.4 MOD System

| # | Test Case | Precondition | Steps | Expected Result |
|---|-----------|-------------|-------|-----------------|
| MOD-01 | Add MOD instance | On MODS > LIST page | Select template, press ADD | Instance appears in active list, feature button appears on relevant pages |
| MOD-02 | Configure instance | Instance exists | Switch to CONFIG, change a setting | Setting persists across page refreshes |
| MOD-03 | Delete instance | Instance exists | Press DELETE (2-step confirm) | Instance removed from list, feature button disappears |
| MOD-04 | Reorder instances | 2+ instances exist | Press UP/DOWN | Button order changes on sidebar |
| MOD-05 | Page-aware visibility | LLM instance targeting BB | Navigate to Broadcast page | LLM button not visible; navigate back to BB, button reappears |
| MOD-06 | LLM — Client processing | Client LLM instance configured, model loaded | Click LLM button on LOG page | AI processes text, response streams into shelf panel |
| MOD-07 | LLM — Server processing | Ollama running, server instance configured | Click LLM button | Request sent to Ollama, response displayed |
| MOD-08 | Translate | Translate instance added | Click translate button on LOG page | Translation appears in shelf: "DECRYPTING LINGUISTICS..." |
| MOD-09 | Speech-to-text | STT instance added, mic available | Click mic button, speak, click again | Transcribed text inserted at cursor position |
| MOD-10 | Markdown preview | MD instance added | Click markdown button | Shelf shows rendered markdown, updates live as you type |
| MOD-11 | Max instances cap | Template has maxInstances: 1, 1 instance exists | Try to ADD another | Operation denied or ADD button hidden |

### 11.5 Cross-Cutting Concerns

| # | Test Case | Precondition | Steps | Expected Result |
|---|-----------|-------------|-------|-----------------|
| CC-01 | PWA install | Accessed via HTTPS | Click browser's install prompt | App installed to home screen / desktop, works as standalone window |
| CC-02 | Full offline mode | App cached (PWA) | Disconnect internet, use BB | All BB features work: write, push, pull, branch, fork |
| CC-03 | i18n switch | — | Toggle language in MISC settings | All UI text switches between English and Traditional Chinese |
| CC-04 | Light theme | Light theme MOD installed | Toggle theme | All CRT effects removed, clean white/black interface |
| CC-05 | Multi-device sync | Logged in on 2 devices, auto-sync ON | COMMIT on device A | Device B receives updated branch via WebSocket |
| CC-06 | Screen saver | App idle | Wait 60 seconds | "PRESS START" overlay appears with CRT animation; click to resume |
| CC-07 | Sound effects | Audio enabled in settings | Perform various actions | Appropriate retro sound effects play (select, cancel, erase, focus) |

---

## 12. Technical Architecture (Summary)

### 12.1 Stack overview

| Layer | Technology |
|-------|-----------|
| **Frontend** | Vanilla HTML + CSS + ES Modules (zero framework dependencies) |
| **Backend** | Laravel 12 (PHP-FPM) |
| **Database** | PostgreSQL 16 |
| **Real-time** | Laravel Reverb (WebSocket) |
| **Cache / Queue** | Redis |
| **Search** | — (not needed for current scope) |
| **Container** | Docker Compose (11 services) |
| **Tunnel** | Cloudflare (public access without port forwarding) |
| **Client AI** | WebLLM (WebGPU) with Qwen3 models |
| **Server AI** | Ollama (self-hosted) |
| **PWA** | Service Worker with stale-while-revalidate caching |

### 12.2 Docker services (11)

`nginx` (static files + reverse proxy) · `api` (Laravel PHP-FPM) · `reverb` (WebSocket server) · `queue` (background jobs) · `scheduler` (cron tasks) · `db` (PostgreSQL 16) · `redis` · `pgadmin` (DB admin UI) · `mailpit` (email testing) · `tunnel` (Cloudflare) · `libretranslate` (optional, self-hosted translation)

### 12.3 Key architectural decisions

| Decision | Rationale |
|----------|----------|
| **Vanilla JS, no framework** | Zero build step. Edit a file, refresh the browser. Minimal dependency surface. Proves that modern SPAs do not require React/Vue/Angular. |
| **IndexedDB as primary storage** | True offline-first. The browser IS the database. Server is a backup you opt into. |
| **WebSocket for real-time** | Sub-100ms keystroke streaming for Walkie-Typie. Long polling cannot achieve this. |
| **Docker Compose for deployment** | One command (`docker compose up`) to run the entire stack. Reproducible across any machine. |
| **MOD system with sandboxed API** | Extensibility without compromising core stability. Each MOD operates through a controlled context object. |
| **WebGPU for client-side AI** | Runs LLM inference directly in the browser. No data leaves the device. Future-proof as WebGPU adoption grows. |

### 12.4 Data flow

```
User types → IndexedDB (200ms) → [if sync enabled] → WebSocket → PostgreSQL
                                                    ↕
                                              Partner device
                                            (real-time whisper)
```

### 12.5 Security measures

- **Rate limiting:** AI endpoints (10/min), write operations (30/min), reads (120/min)
- **CSRF protection:** Laravel sanctum for API authentication
- **File validation:** 1GB limit, mime-type checking, orphaned file cleanup after 24h
- **No PII required:** Registration needs only a UID and passcode — no email, no phone
- **Local-first storage:** Sensitive data stays in browser IndexedDB by default

---

## 13. Development Methodology

### 13.1 Agile XP with LLM-Assisted Development

This project uses **Extreme Programming (XP)** principles augmented with **LLM pair programming**:

- **Pair programming:** Claude Code (Anthropic's AI coding assistant) as the pair partner for all implementation — providing real-time code review, suggesting patterns, and catching bugs during development
- **Short iterations:** Feature-level commits with before/after WIP markers
- **Continuous integration:** Docker-based environment ensures consistent behavior across development and production
- **Refactoring:** Regular code simplification sessions guided by AI analysis

### 13.2 Custom quality assurance agents

Three specialized AI audit agents run after code changes:

| Agent | Purpose | Trigger |
|-------|---------|---------|
| **CSS Auditor** | Checks CRT theme consistency, flex layout correctness, dark/light mode compatibility | After any CSS change |
| **i18n Checker** | Verifies all UI strings use the translation system, checks locale file key parity | After adding UI text |
| **Event Flow Tracer** | Traces custom event chains to catch race conditions and orphaned listeners | After event dispatch/listener changes |

---

## 14. Summary

My CLI is not "just another notes app." It is an **extensible personal terminal** that unifies three modes of text interaction — personal writing, private messaging, and public broadcasting — under one consistent Board model, with an offline-first architecture that puts the user in complete control of their data.

The project demonstrates:

1. **A complete full-stack application** — 11 Docker services, WebSocket real-time, PostgreSQL persistence, service worker caching, PWA installation
2. **A unified data model** — one Board concept scaling across three visibility scopes
3. **A plugin architecture** — the MOD system proves the platform can grow beyond its initial features
4. **Client-side AI** — WebGPU-powered LLM inference in the browser, with zero server dependency
5. **Intentional design** — the CRT aesthetic is a deliberate UX choice that creates a focused, memorable experience
6. **Privacy by design** — local-first storage, optional sync, no mandatory data collection

**The core question this project answers:** Can a single web app, running entirely in a browser with no install and no mandatory account, provide personal note-taking, private communication, public broadcasting, AND AI assistance — all while keeping your data on your device?

**The answer is yes.** My CLI proves it.
