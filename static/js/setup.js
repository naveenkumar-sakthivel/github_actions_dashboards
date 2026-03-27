function showError(msg) {
  const box = document.getElementById('error-box');
  if (!box) return;
  box.textContent = msg;
  box.classList.add('show');
}

function clearError() {
  const box = document.getElementById('error-box');
  if (!box) return;
  box.textContent = '';
  box.classList.remove('show');
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
  const clientId = document.getElementById('client-id')?.value.trim() || '';
  const clientSecret = document.getElementById('client-secret')?.value.trim() || '';

  if (!clientId || !clientSecret) {
    showError('Client ID and Client Secret are required.');
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Saving...';
  }

  try {
    const r = await fetch('/api/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret
      })
    });

    const data = await r.json();

    if (!r.ok) {
      throw new Error(data.error || 'Setup failed');
    }

    showSuccess('Configuration saved! Redirecting to GitHub login...');
    setTimeout(() => {
      window.location.href = '/login';
    }, 1000);
  } catch (e) {
    showError(e.message || 'Network error. Is Flask running?');
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Save & Connect to GitHub';
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  ['client-id', 'client-secret'].forEach((id) => {
    const el = document.getElementById(id);
    el?.addEventListener('input', clearError);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveSetup();
  });
});