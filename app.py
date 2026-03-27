import os
import secrets
from functools import wraps
from urllib.parse import urlencode

import requests
from dotenv import load_dotenv, set_key
from flask import Flask, jsonify, redirect, request, send_from_directory, session, render_template

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ENV_PATH = os.path.join(BASE_DIR, ".env")
load_dotenv(ENV_PATH)

app = Flask(__name__, static_folder="static", template_folder="templates")
app.secret_key = os.getenv("FLASK_SECRET", "dev-secret")

GITHUB_API = "https://api.github.com"


def config_complete():
    return all([
        os.getenv("GH_CLIENT_ID"),
        os.getenv("GH_CLIENT_SECRET"),
    ])


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get("access_token"):
            return jsonify({"error": "Unauthorized"}), 401
        return fn(*args, **kwargs)
    return wrapper


def github_headers():
    return {
        "Authorization": f"Bearer {session['access_token']}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def github_request(method, path, **kwargs):
    url = f"{GITHUB_API}/{path.lstrip('/')}"
    headers = kwargs.pop("headers", {})
    headers = {**github_headers(), **headers}
    return requests.request(method, url, headers=headers, timeout=30, **kwargs)


@app.before_request
def setup_guard():
    allowed_prefixes = ("/setup", "/api/setup", "/assets", "/static")
    if not config_complete() and not request.path.startswith(allowed_prefixes):
        return redirect("/setup")


@app.route("/")
def home():
    if not config_complete():
        return redirect("/setup")
    return render_template("index.html")

@app.route("/setup")
def setup_page():
    if config_complete():
        return redirect("/")
    return render_template("setup.html")


@app.route("/login")
def login():
    if not config_complete():
        return redirect("/setup")

    params = urlencode({
        "client_id": os.getenv("GH_CLIENT_ID"),
        "scope": "repo read:org workflow",
    })
    return redirect(f"https://github.com/login/oauth/authorize?{params}")


@app.route("/auth/callback")
def auth_callback():
    code = request.args.get("code")
    if not code:
        return redirect("/login")

    token_resp = requests.post(
        "https://github.com/login/oauth/access_token",
        headers={"Accept": "application/json"},
        json={
            "client_id": os.getenv("GH_CLIENT_ID"),
            "client_secret": os.getenv("GH_CLIENT_SECRET"),
            "code": code,
        },
        timeout=30,
    )

    token_data = token_resp.json()
    access_token = token_data.get("access_token")
    if not access_token:
        return "GitHub OAuth failed", 400

    session["access_token"] = access_token

    user_resp = requests.get(
        f"{GITHUB_API}/user",
        headers={
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        },
        timeout=30,
    )

    user = user_resp.json()
    session["user"] = {
        "login": user.get("login"),
        "name": user.get("name") or user.get("login"),
        "avatar_url": user.get("avatar_url"),
    }

    return redirect("/")


@app.route("/logout")
def logout():
    session.clear()

    if os.path.exists(ENV_PATH):
        os.remove(ENV_PATH)

    os.environ.pop("FLASK_SECRET", None)
    os.environ.pop("GH_CLIENT_ID", None)
    os.environ.pop("GH_CLIENT_SECRET", None)

    app.secret_key = "dev-secret"

    return redirect("/setup")


@app.route("/api/me")
def api_me():
    return jsonify({
        "configured": config_complete(),
        "login": session.get("user", {}).get("login"),
        "name": session.get("user", {}).get("name"),
        "avatar_url": session.get("user", {}).get("avatar_url"),
    })


@app.route("/api/repos")
@login_required
def api_repos():
    org = (request.args.get("org") or "").strip()

    if org:
        resp = github_request("GET", f"/orgs/{org}/repos?per_page=100&type=all&sort=updated")
    else:
        resp = github_request(
            "GET",
            "/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member"
        )

    if not resp.ok:
        return jsonify({"error": resp.text}), resp.status_code

    repos = []
    for repo in resp.json():
        repos.append({
            "id": repo["id"],
            "name": repo["name"],
            "full_name": repo["full_name"],
            "default_branch": repo["default_branch"],
            "private": repo["private"],
            "owner": repo["owner"]["login"],
            "html_url": repo["html_url"],
        })

    repos.sort(key=lambda x: x["full_name"].lower())
    return jsonify(repos)


@app.route("/api/workflows")
@login_required
def api_workflows():
    repo = (request.args.get("repo") or "").strip()
    if not repo:
        return jsonify({"error": "repo is required"}), 400

    resp = github_request("GET", f"/repos/{repo}/actions/workflows?per_page=100")
    if not resp.ok:
        return jsonify({"error": resp.text}), resp.status_code

    workflows = []
    for wf in resp.json().get("workflows", []):
        workflows.append({
            "id": wf["id"],
            "name": wf["name"],
            "path": wf["path"],
            "state": wf["state"],
        })

    return jsonify(workflows)


@app.route("/api/runs")
@login_required
def api_runs():
    repos = request.args.getlist("repo")
    status = (request.args.get("status") or "").strip()
    branch = (request.args.get("branch") or "").strip()

    if not repos:
        return jsonify([])

    all_runs = []

    for repo in repos:
        params = ["per_page=20"]
        if status:
            params.append(f"status={status}")
        if branch:
            params.append(f"branch={branch}")

        resp = github_request("GET", f"/repos/{repo}/actions/runs?{'&'.join(params)}")
        if not resp.ok:
            continue

        for run in resp.json().get("workflow_runs", []):
            all_runs.append({
                "id": run["id"],
                "name": run.get("name") or run.get("display_title"),
                "display_title": run.get("display_title"),
                "status": run.get("status"),
                "conclusion": run.get("conclusion"),
                "event": run.get("event"),
                "head_branch": run.get("head_branch"),
                "created_at": run.get("created_at"),
                "html_url": run.get("html_url"),
                "workflow_id": run.get("workflow_id"),
                "run_number": run.get("run_number"),
                "actor": (run.get("actor") or {}).get("login"),
                "repo": repo,
            })

    all_runs.sort(key=lambda x: x.get("created_at") or "", reverse=True)
    return jsonify(all_runs[:100])


@app.route("/api/trigger", methods=["POST"])
@login_required
def api_trigger():
    data = request.get_json(silent=True) or {}

    repo = (data.get("repo") or "").strip()
    workflow_id = str(data.get("workflowid") or "").strip()
    ref = (data.get("ref") or "").strip() or "main"
    inputs = data.get("inputs") or {}

    if not repo or not workflow_id:
        return jsonify({"error": "repo and workflowid are required"}), 400

    inputs["dashboard_triggered_by"] = session["user"]["login"]

    resp = github_request(
        "POST",
        f"/repos/{repo}/actions/workflows/{workflow_id}/dispatches",
        json={"ref": ref, "inputs": inputs},
    )

    if resp.status_code not in (200, 201, 204):
        return jsonify({"error": resp.text}), resp.status_code

    return jsonify({
        "ok": True,
        "repo": repo,
        "workflowid": workflow_id,
        "ref": ref,
        "triggeredby": session["user"]["login"],
    })


@app.route("/api/setup/generate-secret")
def generate_secret():
    return jsonify({"secret": secrets.token_hex(32)})


@app.route("/api/setup", methods=["POST"])
def save_setup():
    if config_complete():
        return jsonify({"error": "Setup already completed"}), 409

    data = request.get_json(silent=True) or {}
    client_id = (data.get("client_id") or "").strip()
    client_secret = (data.get("client_secret") or "").strip()

    if not client_id or not client_secret:
        return jsonify({"error": "Client ID and Client Secret are required"}), 400

    flask_secret = secrets.token_hex(32)

    if not os.path.exists(ENV_PATH):
        open(ENV_PATH, "a", encoding="utf-8").close()

    set_key(ENV_PATH, "FLASK_SECRET", flask_secret)
    set_key(ENV_PATH, "GH_CLIENT_ID", client_id)
    set_key(ENV_PATH, "GH_CLIENT_SECRET", client_secret)

    os.environ["FLASK_SECRET"] = flask_secret
    os.environ["GH_CLIENT_ID"] = client_id
    os.environ["GH_CLIENT_SECRET"] = client_secret
    app.secret_key = flask_secret

    return jsonify({"ok": True})

if __name__ == "__main__":
    app.run(debug=True, port=5000)