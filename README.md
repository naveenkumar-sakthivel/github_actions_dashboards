# GitHub Actions Dashboards

A modern GitHub Actions dashboard that lets you **view repositories, workflows, runs, trigger workflows, and inspect logs** from a single UI.  
Built with **Flask** and **vanilla JavaScript**, authenticated via **GitHub OAuth**, and designed to evolve towards a GitHub App + short‑lived tokens + webhooks model.

Repository: https://github.com/naveenkumar-sakthivel/github_actions_dashboards

---

## ✨ Features

- **GitHub Login (OAuth)**
  - Login with your GitHub account
  - Requests scopes to read repos, orgs, and workflows
  - Stores access token in a secure Flask session

- **Repository Browser**
  - List repositories you have access to
  - Filter by organization
  - Search repositories by name
  - Select multiple repos to monitor

- **Workflow & Runs Dashboard**
  - View workflows per repository
  - See recent workflow runs across selected repos
  - Status badges: queued, running, success, failed, cancelled, skipped
  - Filters for status and branch
  - Direct link to each run on GitHub

- **Manual Workflow Trigger**
  - Trigger workflows that support `workflow_dispatch`
  - Choose repo, workflow, and branch (`ref`)
  - Records who triggered it from the dashboard

- **Logs Viewer**
  - Fetch and display logs for a workflow run
  - Multiple log files (per job/step)
  - Search inside logs with highlighting for errors/warnings

- **Nice UX**
  - Auto-refresh with countdown timer
  - Manual refresh
  - Toast notifications for success and errors
  - Responsive layout

---

## 🧱 Architecture (Current)

```text
Browser (index.html + script.js)
        │
        │  HTTP/HTTPS
        ▼
Flask Backend (app.py)
  - GitHub OAuth login (/login, /auth/callback)
  - API endpoints:
      /api/me
      /api/repos
      /api/workflows
      /api/runs
      /api/trigger
      /api/cancel
      /api/logs
  - Uses GitHub REST API with the user's access token
```

The app currently uses a **GitHub OAuth App** to obtain a bearer token, which is then used to call the GitHub REST API for repos, workflows, runs, and logs.

---

## 🚀 Getting Started (Local)

### 1. Clone the Repository

```bash
git clone https://github.com/naveenkumar-sakthivel/github_actions_dashboards.git
cd github_actions_dashboards
```

### 2. Create a GitHub OAuth App

1. Go to **GitHub → Settings → Developer settings → OAuth Apps**
2. Click **New OAuth App**
3. Set:
   - **Application name:** GitHub Actions Dashboard
   - **Homepage URL:** `http://127.0.0.1:5000`
   - **Authorization callback URL:** `http://127.0.0.1:5000/auth/callback`
4. After creating it, note:
   - **Client ID**
   - **Client Secret**

### 3. Create `.env`

In the repo root, create a `.env` file:

```env
FLASK_SECRET=some-long-random-string

# GitHub OAuth App
GH_CLIENT_ID=your-client-id-here
GH_CLIENT_SECRET=your-client-secret-here
```

> Tip: generate `FLASK_SECRET` with:
> ```bash
> python -c "import secrets; print(secrets.token_hex(32))"
> ```

### 4. Create Virtual Environment & Install Dependencies

```bash
python -m venv venv

# Windows
venv\Scripts\activate
# macOS / Linux
source venv/bin/activate

pip install -r requirements.txt
```

(If you don’t have `requirements.txt` yet, generate it with `pip freeze > requirements.txt` after your env is set up.)

### 5. Run the Flask App

From the project root:

```bash
python app.py
# or explicitly:
python test1/app.py   # if app.py is inside a subfolder like test1/
```

You should see something like:

```text
* Running on http://127.0.0.1:5000
```

Open that URL in your browser.

---

## 📦 Project Structure (Typical)

Your structure may look like:

```text
github_actions_dashboards/
├─ app.py                # Flask backend (GitHub API, OAuth, routes)
├─ .env                  # Local secrets (not committed)
├─ requirements.txt
├─ index.html            # Main dashboard UI
├─ setup.html            # Initial config UI
├─ style-3-4.css         # Dashboard styles
├─ setup-3.css           # Setup styles
├─ script-2-7.js         # Main dashboard logic
├─ setup-8.js            # Setup page logic
└─ ...
```

If `app.py` lives under a subfolder (e.g. `test1/app.py`), adjust commands accordingly.

---

## 🔑 GitHub Workflows: Required Config

To let the dashboard **trigger** workflows, each workflow you want to trigger must include `workflow_dispatch`:

```yaml
name: CI

on:
  workflow_dispatch:
    inputs:
      dashboard_triggered_by:
        description: "User who triggered from dashboard"
        required: false
        default: "manual"

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: echo "Hello from CI"
```

Then select that repo and workflow in the dashboard’s **Trigger Workflow** modal.

---

## 🔐 Security Notes (Current & Future)

Current:
- OAuth 2.0 Authorization Code flow with client secret on backend
- Access token stored in Flask session
- Backend-only GitHub API calls (no token exposure to frontend)

Planned / Recommended:
- Add `state` parameter for CSRF protection
- Add PKCE for extra safety
- Reduce scopes from broad `repo` to more minimal where possible
- Migrate to a **GitHub App** with:
  - Short‑lived user tokens + refresh tokens
  - Installation tokens per repo
  - Webhook‑driven updates for workflow_run events

---

## 🧪 Development Tips

- Use **browser dev tools** → Network tab to see calls to:
  - `/api/repos`
  - `/api/runs`
  - `/api/workflows`
  - `/api/logs`
- Use **Flask logs** in terminal to inspect errors from the GitHub API.
- Common fixes:
  - 404 on `/` → ensure `index.html` is in the same directory as `app.py` or adjust `send_from_directory`.
  - Running status not showing → make sure JS checks for `in_progress` (with underscore) when reading `run.status`.

---

## 🤝 Contributing

1. Fork the repo:
   ```bash
   git clone https://github.com/naveenkumar-sakthivel/github_actions_dashboards.git
   ```
2. Create a feature branch:
   ```bash
   git checkout -b feature/my-improvement
   ```
3. Commit and push:
   ```bash
   git commit -am "Improve dashboard feature"
   git push origin feature/my-improvement
   ```
4. Open a Pull Request.

Suggestions welcome: UI tweaks, bug fixes, OAuth hardening, GitHub App migration, webhook support, etc.

---

## 📄 License

This project is for learning and portfolio purposes.  
You can add a proper license (MIT, Apache 2.0, etc.) as `LICENSE` in the repo.

---

## 👤 Author

Built by **Naveen Kumar Sakthivel**  
- GitHub: https://github.com/naveenkumar-sakthivel  
- LinkedIn: (add your profile URL here)
