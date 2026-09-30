const HANA_AVATAR = '/assets/hana/hana-avatar.webp';
const GT_MARK = '/assets/brand/gt-mark.webp';

const views = [...document.querySelectorAll('.view')];
const nav = [...document.querySelectorAll('[data-view]')];
const messages = document.getElementById('messages');
const form = document.getElementById('chatForm');
const input = document.getElementById('chatInput');
const toast = document.getElementById('toast');
const accountDialog = document.getElementById('accountDialog');
let toastTimer;

function showToast(text) {
  clearTimeout(toastTimer);
  toast.textContent = text;
  toast.classList.add('show');
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}

function showView(name) {
  views.forEach((view) => {
    const active = view.id === `view-${name}`;
    view.classList.toggle('active', active);
    view.hidden = !active;
  });
  nav.forEach((button) => {
    const active = button.dataset.view === name;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  document.getElementById('workspace')?.focus?.({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

nav.forEach((button) => button.addEventListener('click', () => showView(button.dataset.view)));

document.querySelectorAll('#quickGrid button').forEach((button) => {
  button.addEventListener('click', () => {
    input.value = button.textContent.trim();
    input.focus();
  });
});

function createAvatar(role) {
  if (role === 'assistant') {
    const img = document.createElement('img');
    img.className = 'avatar assistant-avatar';
    img.src = HANA_AVATAR;
    img.alt = 'Hana AI Pro assistant';
    img.width = 38;
    img.height = 38;
    return img;
  }
  const user = document.createElement('div');
  user.className = 'avatar user-avatar';
  user.textContent = 'U';
  user.setAttribute('aria-hidden', 'true');
  return user;
}

function addMessage(role, text, options = {}) {
  const article = document.createElement('article');
  article.className = `message ${role}${options.pending ? ' pending' : ''}${options.error ? ' error' : ''}`;
  const avatar = createAvatar(role);
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  const strong = document.createElement('strong');
  strong.textContent = role === 'assistant' ? 'Hana' : 'You';
  const p = document.createElement('p');
  p.textContent = text;
  bubble.append(strong, p);
  article.append(avatar, bubble);
  messages.append(article);
  messages.scrollTop = messages.scrollHeight;
  return article;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text) return;

  addMessage('user', text);
  input.value = '';
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = 'جاري التحليل...';
  messages.setAttribute('aria-busy', 'true');
  const pending = addMessage('assistant', 'جاري تحليل الطلب هندسيًا…', { pending: true });

  try {
    const mode = document.getElementById('modeSelect').value;
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b',
        reasoning: 'high',
        mode,
        messages: [
          { role: 'user', content: text }
        ]
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Hana AI backend is unavailable.');
    pending.remove();
    addMessage('assistant', payload.reply || 'No response.');
  } catch (error) {
    pending.remove();
    addMessage('assistant', `تعذر تنفيذ الطلب الآن: ${error.message}`, { error: true });
  } finally {
    messages.setAttribute('aria-busy', 'false');
    button.disabled = false;
    button.textContent = 'إرسال إلى Hana';
  }
});

document.getElementById('auditForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const url = document.getElementById('auditUrl').value.trim();
  const result = document.getElementById('auditResult');
  const safeUrl = url.replace(/[<>&"']/g, '');
  result.replaceChildren();
  const mark = document.createElement('img');
  mark.src = GT_MARK;
  mark.alt = '';
  mark.width = 52;
  mark.height = 52;
  mark.setAttribute('aria-hidden', 'true');
  const copy = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = 'تم تجهيز الهدف فقط.';
  const description = document.createElement('p');
  description.textContent = `Audit API غير مفعّل بعد، لذلك لن ندّعي تنفيذ فحص لم يحدث. الهدف المسجل: ${safeUrl}`;
  copy.append(title, description);
  result.append(mark, copy);
  showToast('Audit target prepared — no scan executed.');
});

const accountButton = document.getElementById('accountButton');
const accountClose = document.getElementById('accountClose');
const accountAcknowledge = document.getElementById('accountAcknowledge');

accountButton.addEventListener('click', () => {
  if (typeof accountDialog.showModal === 'function') accountDialog.showModal();
  else showToast('GARHY ID integration remains staged.');
});
accountClose.addEventListener('click', () => accountDialog.close());
accountAcknowledge.addEventListener('click', () => accountDialog.close());
accountDialog.addEventListener('click', (event) => {
  const rect = accountDialog.getBoundingClientRect();
  const inDialog = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
  if (!inDialog) accountDialog.close();
});

document.getElementById('languageButton').addEventListener('click', () => showToast('English localization is staged for a future release.'));

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, { once: true });
}
