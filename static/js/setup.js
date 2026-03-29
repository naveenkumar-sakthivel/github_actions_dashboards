function showError(msg) {
  const box = document.getElementById('error-box');
  if (!box) return;
  box.textContent = msg;
  box.style.display = 'block';
}

function clearError() {
  const box = document.getElementById('error-box');
  if (!box) return;
  box.textContent = '';
  box.style.display = 'none';
}

function showSuccess(msg) {
  const box = document.getElementById('success-box');
  if (!box) return;
  box.textContent = msg;
  box.style.display = 'block';
}

async function saveSetup() {
  clearError();

  const btn = document.getElementById('save-btn');
  const clientId = document.getElementById('client-id')?.value.trim();
  const clientSecret = document.getElementById('client-secret')?.value.trim();

  if (!clientId || !clientSecret) {
    showError('Client ID and Client Secret are required.');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    const r = await fetch('/api/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret
      })
    });

    let data;
    try {
      data = await r.json();
    } catch {
      data = {};
    }

    if (!r.ok) {
      throw new Error(data.error || `Setup failed (${r.status})`);
    }

    showSuccess('Configuration saved! Redirecting to GitHub login...');

    setTimeout(() => {
      window.location.href = '/login';
    }, 1200);

  } catch (e) {
    showError(e.message || 'Network error. Is Flask running?');
    btn.disabled = false;
    btn.textContent = 'Save & Connect to GitHub';
  }
}

document.addEventListener('DOMContentLoaded', () => {

  const btn = document.getElementById('save-btn');

  btn?.addEventListener('click', saveSetup);

  ['client-id', 'client-secret'].forEach((id) => {
    const el = document.getElementById(id);
    el?.addEventListener('input', clearError);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveSetup();
  });
});
