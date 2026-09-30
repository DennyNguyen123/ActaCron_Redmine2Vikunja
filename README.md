# ActaCron Scripts Starter Template

[![Validate Scripts](https://github.com/DennyNguyen123/ActaCron-Template/actions/workflows/validate.yml/badge.svg)](https://github.com/DennyNguyen123/ActaCron-Template/actions/workflows/validate.yml)

A standardized, AI-ready starter template repository for building automation scripts, scheduled cron jobs, and dynamic **Model Context Protocol (MCP)** tools running on [ActaCron](https://github.com/DennyNguyen123/ActaCron).

---

## 🚀 Quick Start

### 1. Create your repository
Click the **[Use this template]** button at the top of this repository on GitHub to create your own scripts repo.

### 2. Connect to ActaCron
1. Open your **ActaCron Dashboard** (`http://localhost:8080`).
2. Go to **Workspace** and click **`+ Git`** (or go to **Settings > Git Credentials > Clone Repository**).
3. Paste the Git URL of your repository. ActaCron will clone it into `packages/` and immediately activate your cron jobs, MCP tools, and workspace settings!

---

## ⚙️ Workspace Configuration & Environment

### Workspace Config (`workspace.json`)
You can configure workspace-level properties directly in [`workspace.json`](workspace.json) or via the ActaCron UI (**Packages > ⚙️ Workspace Config**):
```json
{
  "timeout_seconds": 60,
  "description": "ActaCron automation scripts and dynamic MCP tools workspace"
}
```

### Scoped Environment Variables (`.env`)
Environment variables resolve via a **3-tier hierarchy**:
1. **Tier 1:** `packages/<workspace>/.env` (Highest priority - workspace scoped).
2. **Tier 2:** ActaCron Root `.env` (Global fallback).
3. **Tier 3:** Host Operating System Environment.

Copy [`.env.example`](.env.example) to `.env` in this directory to configure workspace-specific secrets.

---

## 🤖 Using AI to Write Scripts

This repository includes an embedded AI skill in [`.agents/skills/actacron-task/`](.agents/skills/actacron-task/).

When opening this repo in **Antigravity**, **Cursor**, or any AI coding assistant, simply prompt:

> *"Create a new ActaCron task that fetches currency rates every morning at 8 AM and exports it as an MCP tool."*

The AI assistant will automatically:
- Generate valid JSDoc headers (`@name`, safe `@cron`, `@mcp true`, `@timeout`, `@param`).
- Implement the `main(params)` function using built-in host APIs (`http.get`, `env()`, `storage`, `shared.*`).
- Avoid syntax bugs like `*/` inside comments.

---

## 🔗 Shared Library Integration

ActaCron automatically provides standard shared utilities under the global `shared` namespace and safe CommonJS require:
- **`shared.datetime`**: `nowISO()`, `formatDate()`, `timeAgo()`, `addDays()`
- **`shared.notify`**: `telegram()`, `discord()`, `slack()`, `webhook()`
- **`shared.utils`**: `uuid()`, `retry()`, `chunk()`, `safeJson()`, `formatBytes()`
- **`shared.constants`**: `HTTP_STATUS`, `REGEX`, `TIME`
- **Safe Require**: `require('_shared/utils')` or `require('./local_module')`

---

## 📁 Repository Contents

```text
├── .agents/skills/actacron-task/  # AI Agent instructions & templates
├── .github/workflows/validate.yml # GitHub Actions CI syntax checker
├── scripts/validate.js            # Zero-dependency local script & config validator
├── workspace.json                 # Workspace configuration (timeout, description)
├── .env.example                   # Environment variable template
├── ACTACRON_SPEC.md               # Technical runtime & API documentation
├── hello_cron.js                  # Demo: Recurring cron job + MCP tool
├── api_fetcher.js                 # Demo: Calling REST APIs via http.get
├── shared_library_demo.js         # Demo: Using shared.*, storage, and scoped env
├── system_backup.js               # Demo: System execution via exec() with @allowExec
└── cross_caller.js                # Demo: Multi-script orchestration with call()
```

---

## 🧪 Local Testing & Validation

To test your scripts and configurations for syntax errors before committing:

```bash
node scripts/validate.js
# or
npm test
```
