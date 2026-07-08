const chat = document.getElementById('chat');
const welcome = document.getElementById('welcome');
const messagesEl = document.getElementById('messages');
const composer = document.getElementById('composer');
const input = document.getElementById('input');
const sendBtn = document.getElementById('send-btn');
const resetBtn = document.getElementById('reset-btn');
const suggestions = document.getElementById('suggestions');

// history kept in the shape the backend expects: [{role, text}]
let history = [];

function scrollToBottom() {
  chat.scrollTop = chat.scrollHeight;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Very small markdown-ish formatter: turns "- " lines into <li>, keeps line breaks.
function formatText(text) {
  const escaped = escapeHtml(text);
  const lines = escaped.split('\n');
  let html = '';
  let inList = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${trimmed.slice(2)}</li>`;
    } else {
      if (inList) { html += '</ul>'; inList = false; }
      html += trimmed.length ? `${line}<br>` : '<br>';
    }
  }
  if (inList) html += '</ul>';
  return html;
}

function addMessage(role, text) {
  welcome.style.display = 'none';

  const wrapper = document.createElement('div');
  wrapper.className = `msg msg--${role === 'model' ? 'assistant' : 'user'}`;

  const avatar = document.createElement('div');
  avatar.className = 'msg__avatar';

  const bubble = document.createElement('div');
  bubble.className = 'msg__bubble';
  bubble.innerHTML = formatText(text);

  if (role === 'model') {
    wrapper.appendChild(avatar);
    wrapper.appendChild(bubble);
  } else {
    wrapper.appendChild(bubble);
  }

  messagesEl.appendChild(wrapper);
  scrollToBottom();
  return bubble;
}

function addTypingIndicator() {
  const wrapper = document.createElement('div');
  wrapper.className = 'msg msg--assistant msg--typing';
  wrapper.id = 'typing-indicator';

  const avatar = document.createElement('div');
  avatar.className = 'msg__avatar';

  const bubble = document.createElement('div');
  bubble.className = 'msg__bubble';
  bubble.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';

  wrapper.appendChild(avatar);
  wrapper.appendChild(bubble);
  messagesEl.appendChild(wrapper);
  scrollToBottom();
}

function removeTypingIndicator() {
  const el = document.getElementById('typing-indicator');
  if (el) el.remove();
}

async function sendMessage(text) {
  const trimmed = text.trim();
  if (!trimmed) return;

  input.value = '';
  sendBtn.disabled = true;

  addMessage('user', trimmed);
  history.push({ role: 'user', text: trimmed });
  addTypingIndicator();

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: trimmed, history: history.slice(0, -1) }),
    });

    const data = await res.json();
    removeTypingIndicator();

    if (!res.ok) {
      const bubble = addMessage('model', data.error || 'Something went wrong. Please try again.');
      bubble.classList.add('error');
      return;
    }

    addMessage('model', data.reply);
    history.push({ role: 'model', text: data.reply });
  } catch (err) {
    removeTypingIndicator();
    const bubble = addMessage('model', 'I couldn\'t reach the server. Please check your connection and try again.');
    bubble.classList.add('error');
  } finally {
    sendBtn.disabled = false;
    input.focus();
  }
}

composer.addEventListener('submit', (e) => {
  e.preventDefault();
  sendMessage(input.value);
});

suggestions.addEventListener('click', (e) => {
  const btn = e.target.closest('.chip');
  if (!btn) return;
  sendMessage(btn.textContent);
});

resetBtn.addEventListener('click', () => {
  history = [];
  messagesEl.innerHTML = '';
  welcome.style.display = '';
  input.value = '';
  input.focus();
});

input.focus();
