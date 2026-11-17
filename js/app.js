// app.js - Gerencia tema claro/escuro global
document.addEventListener('DOMContentLoaded', () => {
  const themeBtn = document.getElementById('themeToggle');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'dark';
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      if (window.revoltsState) {
        window.revoltsState.theme = next;
        if (typeof window.saveCloudDB === 'function') window.saveCloudDB();
      }
    });
  }
});