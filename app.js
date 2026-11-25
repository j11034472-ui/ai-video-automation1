const form = document.querySelector('#video-form');
const topic = document.querySelector('#topic');
const scenes = document.querySelector('#scene-list');
const preview = document.querySelector('#preview');

fetch('/api/config').then((response) => response.json()).then((config) => {
  const ready = [config.gemini, config.media, config.youtube].filter(Boolean).length;
  document.querySelector('#setup-status').textContent = `${ready}/3 integrations configured · ${config.gemini ? 'Gemini ready' : 'Gemini key missing'} · ${config.media ? 'Media ready' : 'Media key missing'} · ${config.youtube ? 'YouTube ready' : 'YouTube not connected'}`;
}).catch(() => { document.querySelector('#setup-status').textContent = 'Server চালু নেই'; });

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const text = topic.value.trim();
  if (!text) return;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = 'Plan তৈরি হচ্ছে…';
  try {
    const response = await fetch('/api/plan', { method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({
      topic: text,
      language: document.querySelector('#language').value,
      duration: Number(document.querySelector('#duration').value),
      format: document.querySelector('#format').value,
      voice: document.querySelector('#voice').value
    }) });
    if (!response.ok) throw new Error('API unavailable');
    const plan = await response.json();
    scenes.innerHTML = plan.scenes.map((scene, index) => `<div class="scene"><b>0${index + 1}</b><span><strong>${scene.title}</strong><br>${scene.narration}<br><small>${scene.visualQuery}</small></span></div>`).join('');
    preview.innerHTML = `<div class="play">✓</div><p>${plan.mode === 'gemini' ? 'AI plan ready' : 'Demo plan ready'} · ${plan.scenes.length} scenes</p>`;
    document.querySelector('#mode-note').textContent = `${plan.mode === 'gemini' ? 'Gemini AI + media search' : 'Demo mode'} · ${plan.media?.length || 0}টি licensed media result পাওয়া গেছে।`;
    const render = await fetch('/api/render', { method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({ ...plan, duration: Number(document.querySelector('#duration').value), voice: document.querySelector('#voice').value, voiceText: plan.scenes.map((scene) => scene.narration).join(' ') }) });
    if (render.ok) {
      const result = await render.json();
      preview.innerHTML = `<video controls playsinline src="${result.url}"></video><p>${result.duration}s test render ready</p>`;
    }
  } catch (error) {
    preview.innerHTML = '<div class="play">!</div><p>Server চালু করুন: pnpm dev</p>';
  } finally {
    button.disabled = false;
    button.textContent = 'ভিডিও তৈরি শুরু করুন';
  }
});

document.querySelector('#save-schedule').addEventListener('click', () => {
  const count = document.querySelector('#daily').value;
  const time = document.querySelector('#time').value;
  const auto = document.querySelector('#auto').checked ? 'AI topic selection on' : 'নিজের topic ব্যবহার হবে';
  const youtube = document.querySelector('#youtube').checked ? 'YouTube queue on' : 'শুধু draft তৈরি হবে';
  document.querySelector('#schedule-note').textContent = `${count}টি/দিন · ${time} · ${auto} · ${youtube}`;
});
