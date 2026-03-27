let allRepos = [];
let filteredRepos = [];
let selectedRepos = new Set();
let runsData = [];
let refreshTimer = null;
let countdown = 3600;

document.addEventListener('DOMContentLoaded', async () => {
    bindEvents();

    const triggerModal = document.getElementById('trigger-modal');
    triggerModal?.classList.remove('open');
    document.body.style.overflow = '';

    try {
        const me = await api('/api/me', { allow401: true });
        if (!me || !me.login) {
            window.location.href = '/login';
            return;
        }

        renderUser(me);
        await loadRepos();
        await loadRuns();
        startAutoRefresh();
    } catch (err) {
        showToast(err.message || 'Failed to initialize dashboard', true);
    }
});

function bindEvents() {
    document.getElementById('manual-refresh-btn')?.addEventListener('click', async () => {
        await loadRuns();
        resetRefreshCountdown();
    });

    document.getElementById('open-trigger-btn')?.addEventListener('click', openTriggerModal);
    document.getElementById('trigger-close-btn')?.addEventListener('click', closeTriggerModal);
    document.getElementById('trigger-run-btn')?.addEventListener('click', triggerWorkflow);

    document.getElementById('repo-search')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') filterRepoList();
    });
    document.getElementById('repo-search-btn')?.addEventListener('click', filterRepoList);

    document.getElementById('org-input')?.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
            await loadRepos();
            await loadRuns();
        }
    });

    document.getElementById('status-filter')?.addEventListener('change', loadRuns);
    document.getElementById('branch-filter')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') loadRuns();
    });

    document.getElementById('select-all-btn')?.addEventListener('click', toggleSelectAll);
    document.getElementById('trigger-repo')?.addEventListener('change', loadTriggerWorkflows);
}

async function api(url, options = {}) {
    const { allow401 = false, ...fetchOptions } = options;
    const response = await fetch(url, fetchOptions);

    if (response.status === 401 && !allow401) {
        window.location.href = '/login';
        return null;
    }

    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json')
        ? await response.json()
        : await response.text();

    if (!response.ok) {
        throw new Error(data?.error || 'Request failed');
    }

    return data;
}

function renderUser(user) {
    document.getElementById('user-name').textContent = user.name || user.login || 'GitHub User';
    const avatar = document.getElementById('user-avatar');

    if (user.avatar_url) {
        avatar.src = user.avatar_url;
        avatar.style.display = 'block';
    }
}

function startAutoRefresh() {
    clearInterval(refreshTimer);
    countdown = 3600;
    updateRefreshTimer();

    refreshTimer = setInterval(async () => {
        countdown -= 1;
        updateRefreshTimer();

        if (countdown <= 0) {
            await loadRuns();
            countdown = 3600;
            updateRefreshTimer();
        }
    }, 1000);
}

function resetRefreshCountdown() {
    countdown = 3600;
    updateRefreshTimer();
}

function updateRefreshTimer() {
    const timerEl = document.getElementById('refresh-timer');
    if (!timerEl) return;

    const hours = Math.floor(countdown / 3600);
    const minutes = Math.floor((countdown % 3600) / 60);
    const seconds = countdown % 60;

    if (hours > 0) {
        timerEl.textContent = `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
        timerEl.textContent = `${minutes}m ${seconds}s`;
    } else {
        timerEl.textContent = `${seconds}s`;
    }
}

async function loadRepos() {
    try {
        const org = document.getElementById('org-input').value.trim();
        const url = org ? `/api/repos?org=${encodeURIComponent(org)}` : '/api/repos';

        allRepos = await api(url);
        filteredRepos = [...allRepos];

        if (selectedRepos.size === 0 && allRepos.length) {
            allRepos.slice(0, 5).forEach((repo) => selectedRepos.add(repo.full_name));
        } else {
            selectedRepos = new Set(
                [...selectedRepos].filter((name) => allRepos.some((r) => r.full_name === name))
            );
        }

        renderRepoList(filteredRepos);
        populateTriggerRepos();
    } catch (err) {
        showToast(err.message, true);
        document.getElementById('repo-list').innerHTML = `<div class="empty">${escapeHtml(err.message)}</div>`;
    }
}

function populateTriggerRepos() {
    const select = document.getElementById('trigger-repo');
    if (!select) return;

    select.innerHTML = '';

    allRepos.forEach((repo) => {
        const option = document.createElement('option');
        option.value = repo.full_name;
        option.textContent = repo.full_name;
        select.appendChild(option);
    });
}

function filterRepoList() {
    const term = document.getElementById('repo-search').value.trim().toLowerCase();

    filteredRepos = !term
        ? [...allRepos]
        : allRepos.filter((repo) => repo.full_name.toLowerCase().includes(term));

    renderRepoList(filteredRepos);
}

function renderRepoList(repos) {
    const el = document.getElementById('repo-list');

    if (!repos.length) {
        el.innerHTML = '<div class="empty">No repositories found.</div>';
        return;
    }

    el.innerHTML = repos.map((repo) => {
        const selected = selectedRepos.has(repo.full_name) ? 'selected' : '';
        const badge = repo.private ? 'private' : 'public';
        const repoUrl = repo.html_url || `https://github.com/${repo.full_name}`;

        return `
            <div class="repo-item ${selected}" data-repo="${escapeHtml(repo.full_name)}">
                <div class="repo-item-main">
                    <span class="repo-item-name">${escapeHtml(repo.full_name)}</span>
                </div>
                <div class="repo-item-actions">
                    <span class="repo-badge">${badge}</span>
                    <a class="repo-link" href="${repoUrl}" target="_blank" rel="noopener">Open</a>
                </div>
            </div>
        `;
    }).join('');

    el.querySelectorAll('.repo-item').forEach((item) => {
        item.addEventListener('click', async (e) => {
            if (e.target.closest('.repo-link')) return;

            const repo = item.dataset.repo;
            if (selectedRepos.has(repo)) {
                selectedRepos.delete(repo);
            } else {
                selectedRepos.add(repo);
            }

            renderRepoList(filteredRepos);
            await loadRuns();
        });
    });
}

async function toggleSelectAll() {
    const visible = filteredRepos.map((r) => r.full_name);
    const allVisibleSelected = visible.every((repo) => selectedRepos.has(repo));

    if (allVisibleSelected) {
        visible.forEach((repo) => selectedRepos.delete(repo));
    } else {
        visible.forEach((repo) => selectedRepos.add(repo));
    }

    renderRepoList(filteredRepos);
    await loadRuns();
}

async function loadRuns() {
    const tbody = document.getElementById('runs-tbody');

    if (!selectedRepos.size) {
        runsData = [];
        tbody.innerHTML = '<tr><td colspan="8" class="empty">Select repositories to view runs.</td></tr>';
        updateStats();
        document.getElementById('run-count').textContent = '0 runs';
        return;
    }

    tbody.innerHTML = '<tr><td colspan="8" class="empty"><span class="spinner"></span></td></tr>';

    try {
        const params = new URLSearchParams();

        [...selectedRepos].forEach((repo) => params.append('repo', repo));

        const statusFilter = document.getElementById('status-filter').value;
        const branch = document.getElementById('branch-filter').value.trim();

        if (branch) params.set('branch', branch);
        if (statusFilter === 'queued') params.set('status', 'queued');
        if (statusFilter === 'success' || statusFilter === 'failure') params.set('status', 'completed');

        let data = await api(`/api/runs?${params.toString()}`);

        if (statusFilter === 'success') {
            data = data.filter((run) => (run.conclusion || '').toLowerCase() === 'success');
        } else if (statusFilter === 'failure') {
            data = data.filter((run) => ['failure', 'timed_out'].includes((run.conclusion || '').toLowerCase()));
        }

        runsData = data;
        renderRuns();
        updateStats();
        document.getElementById('run-count').textContent = `${runsData.length} runs`;
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="8" class="empty">${escapeHtml(err.message)}</td></tr>`;
        showToast(err.message, true);
    }
}

function renderRuns() {
    const tbody = document.getElementById('runs-tbody');

    if (!runsData.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty">No workflow runs found.</td></tr>';
        return;
    }

    tbody.innerHTML = runsData.map((run) => {
        const badge = renderStatusBadge(run);
        const started = formatDate(run.created_at);
        const workflowName = escapeHtml(run.name || 'Workflow');
        const repo = escapeHtml(run.repo);
        const branch = escapeHtml(run.head_branch || '-');
        const trigger = escapeHtml(run.event || '-');
        const actor = escapeHtml(run.actor || '-');
        const repoUrl = `https://github.com/${run.repo}`;
        const runUrl = run.html_url
            ? `<a class="btn inline-link" href="${run.html_url}" target="_blank" rel="noopener">Open Run</a>`
            : '';

        return `
            <tr>
                <td>${badge}</td>
                <td>
                    <div class="run-name">${workflowName}</div>
                    <div class="run-meta">#${escapeHtml(run.run_number || '-')} - ${escapeHtml(run.display_title || '')}</div>
                </td>
                <td><a class="inline-link" href="${repoUrl}" target="_blank" rel="noopener">${repo}</a></td>
                <td>${branch}</td>
                <td>${trigger}</td>
                <td>${actor}</td>
                <td>${started}</td>
                <td>
                    <div class="td-actions">
                        ${runUrl}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function renderStatusBadge(run) {
    const status = (run.status || '').toLowerCase();
    const conclusion = (run.conclusion || '').toLowerCase();

    if (status === 'queued') {
        return '<span class="badge badge-queued">Queued</span>';
    }

    if (status === 'in_progress') {
        return '<span class="badge badge-running">Running</span>';
    }

    if (status === 'completed') {
        if (conclusion === 'success') {
            return '<span class="badge badge-success">Success</span>';
        }
        if (conclusion === 'failure' || conclusion === 'timed_out') {
            return '<span class="badge badge-failure">Failed</span>';
        }
        if (['cancelled', 'skipped'].includes(conclusion)) {
            return `<span class="badge badge-neutral">${escapeHtml(conclusion)}</span>`;
        }
    }

    return `<span class="badge badge-neutral">${escapeHtml(status || '-')}</span>`;
}
function updateStats() {
    let running = 0;
    let queued = 0;
    let success = 0;
    let failure = 0;

    runsData.forEach((run) => {
        const status = (run.status || '').toLowerCase();
        const conclusion = (run.conclusion || '').toLowerCase();

        if (status === 'queued') {
            queued += 1;
        } else if (status === 'in_progress') {
            running += 1;
        } else if (status === 'completed') {
            if (conclusion === 'success') {
                success += 1;
            } else if (conclusion === 'failure' || conclusion === 'timed_out') {
                failure += 1;
            }
        }
    });

    document.getElementById('stat-running').textContent = running;
    document.getElementById('stat-queued').textContent = queued;
    document.getElementById('stat-success').textContent = success;
    document.getElementById('stat-failure').textContent = failure;
}

function openTriggerModal() {
    const overlay = document.getElementById('trigger-modal');
    if (!overlay) return;

    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    loadTriggerWorkflows();
}

function closeTriggerModal() {
    const overlay = document.getElementById('trigger-modal');
    if (!overlay) return;

    overlay.classList.remove('open');
    document.body.style.overflow = '';
}

async function loadTriggerWorkflows() {
    const repo = document.getElementById('trigger-repo')?.value || '';
    const select = document.getElementById('trigger-workflow');

    if (!select) return;

    select.innerHTML = '<option value="">Loading workflows...</option>';

    if (!repo) {
        select.innerHTML = '<option value="">Select a repository</option>';
        return;
    }

    try {
        const workflows = await api(`/api/workflows?repo=${encodeURIComponent(repo)}`);

        if (!workflows.length) {
            select.innerHTML = '<option value="">No workflows found</option>';
            return;
        }

        select.innerHTML = workflows.map((wf) => `
            <option value="${escapeHtml(wf.id)}">${escapeHtml(wf.name || wf.path)}</option>
        `).join('');
    } catch (err) {
        select.innerHTML = '<option value="">Error loading workflows</option>';
        showToast(err.message, true);
    }
}

async function triggerWorkflow() {
    const repo = document.getElementById('trigger-repo')?.value || '';
    const workflowId = document.getElementById('trigger-workflow')?.value || '';
    const ref = document.getElementById('trigger-ref')?.value.trim() || 'main';
    const btn = document.getElementById('trigger-run-btn');

    if (!repo || !workflowId) {
        showToast('Select repo and workflow to trigger.', true);
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Triggering...';

    try {
        const res = await api('/api/trigger', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                repo: repo,
                workflowid: workflowId,
                ref: ref,
                inputs: {}
            })
        });

        showToast(`Triggered on ${res.ref} by ${res.triggeredby || 'user'}`);
        closeTriggerModal();
        await loadRuns();
        resetRefreshCountdown();
    } catch (err) {
        showToast(err.message || 'Trigger failed', true);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Run';
    }
}

function showToast(message, isError = false) {
    const el = document.getElementById('toast');
    el.textContent = message;
    el.style.borderColor = isError ? 'var(--danger)' : 'var(--border)';
    el.classList.add('show');

    clearTimeout(el.hideTimer);
    el.hideTimer = setTimeout(() => {
        el.classList.remove('show');
    }, 3500);
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatDate(value) {
    if (!value) return '-';
    const d = new Date(value);
    if (isNaN(d.getTime())) return value;
    return d.toLocaleString();
}