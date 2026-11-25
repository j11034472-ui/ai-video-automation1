const form = document.querySelector('#video-form');
const topic = document.querySelector('#topic');
const scenes = document.querySelector('#scene-list');
const preview = document.querySelector('#preview');

const sectionTitles = { overview: 'Overview', create: 'Create video', library: 'Library', automation: 'Automation', settings: 'Settings' };
document.querySelectorAll('[data-section]').forEach((button) => button.addEventListener('click', () => {
  const target = button.dataset.section;
  document.querySelectorAll('.page-section').forEach((section) => section.classList.toggle('active', section.id === `section-${target}`));
  document.querySelectorAll('.nav-item[data-section]').forEach((item) => item.classList.toggle('active', item.dataset.section === target));
  document.querySelector('#page-title').textContent = sectionTitles[target] || 'Overview';
  window.location.hash = target;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}));

const initialSection = window.location.hash.slice(1);
if (sectionTitles[initialSection]) document.querySelector(`[data-section="${initialSection}"]`)?.click();

fetch('/api/jobs').then((response) => response.json()).then((jobs) => {
  document.querySelector('#stat-videos').textContent = jobs.length;
  document.querySelector('#stat-ready').textContent = jobs.filter((job) => job.status === 'ready').length;
  const recent = document.querySelector('#recent-videos');
  if (jobs.length) recent.innerHTML = jobs.slice(0, 3).map((job) => `<div class="quick-step"><b>${job.status === 'ready' ? '✓' : '!'}</b><span><strong>${job.status === 'ready' ? 'Video ready' : 'Render failed'}</strong><small>${job.duration || 0}s · ${new Date(job.createdAt).toLocaleString()}</small></span></div>`).join('');
}).catch(() => {});

fetch('/api/schedules').then((response) => response.json()).then((schedules) => { document.querySelector('#stat-scheduled').textContent = schedules.filter((schedule) => schedule.enabled).length; }).catch(() => {});

fetch('/api/config').then((response) => response.json()).then((config) => {
  const ready = [config.gemini, config.media, config.youtube].filter(Boolean).length;
  document.querySelector('#setup-status').textContent = `${ready}/3 integrations configured · ${config.gemini ? 'Gemini ready' : 'Gemini key missing'} · ${config.media ? `${config.mediaProvider} ready` : 'Media key missing'} · ${config.youtube ? 'YouTube ready' : 'YouTube not connected'}`;
}).catch(() => { document.querySelector('#setup-status').textContent = 'Static demo mode · backend connect করলে AI/API চালু হবে'; });

document.querySelector('#save-keys').addEventListener('click', async () => {
  const button = document.querySelector('#save-keys');
  const note = document.querySelector('#save-note');
  button.disabled = true;
  try {
    const response = await fetch('/api/settings', { method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({
      GEMINI_API_KEY: document.querySelector('#gemini-key').value,
      PIXABAY_API_KEY: document.querySelector('#pixabay-key').value,
      YOUTUBE_CLIENT_ID: '',
      YOUTUBE_CLIENT_SECRET: ''
    }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Save failed');
    note.textContent = 'Settings saved. Key value এখানে দেখানো হবে না।';
    ['#gemini-key','#pixabay-key'].forEach((selector) => { document.querySelector(selector).value = ''; });
    window.location.reload();
  } catch (error) { note.textContent = error.message; }
  finally { button.disabled = false; }
});

// End of client app.
document.querySelector('#save-schedule').addEventListener('click', async () => {
  const note = document.querySelector('#schedule-note');
  const payload = {
    daily: document.querySelector('#daily').value,
    time: document.querySelector('#time').value,
    autoTopic: document.querySelector('#auto').checked,
    youtubeQueue: document.querySelector('#youtube').checked
  };
  const response = await fetch('/api/schedules', { method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(payload) });
  const schedule = await response.json();
  note.textContent = `Saved: ${schedule.daily}টি/দিন · ${schedule.time} · ${schedule.autoTopic ? 'AI topic' : 'নিজের topic'} · ${schedule.youtubeQueue ? 'YouTube queue' : 'draft only'}`;
});

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
    scenes.innerHTML = plan.scenes.map((scene, index) => {
      const media = (plan.media || []).filter((item) => item.sceneIndex === index).slice(0, 2);
      const mediaText = media.length ? ` · ${media.length}টি ${media.map((item) => item.type).join(' + ')}` : ' · demo visual fallback';
      return `<div class="scene"><b>0${index + 1}</b><span><strong>${scene.title}</strong><br>${scene.narration}<br><small>${scene.visualQuery}${mediaText}</small></span></div>`;
    }).join('');
    preview.innerHTML = `<div class="play">✓</div><p>${plan.mode === 'gemini' ? 'AI plan ready' : 'Demo plan ready'} · ${plan.scenes.length} scenes</p>`;
    document.querySelector('#mode-note').textContent = `${plan.mode === 'gemini' ? 'Gemini AI + media search' : 'Demo mode'} · ${plan.media?.length || 0}টি licensed media result পাওয়া গেছে।`;
    const render = await fetch('/api/render', { method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({ ...plan, duration: Number(document.querySelector('#duration').value), voice: document.querySelector('#voice').value, voiceText: plan.scenes.map((scene) => scene.narration).join(' ') }) });
    if (render.ok) {
      const result = await render.json();
      preview.innerHTML = `<video controls playsinline src="${result.url}"></video><p>${result.duration}s test render ready</p>`;
    }
  } catch (error) {
    const localParts = [`Hook: ${text}`, `মূল বিষয় ব্যাখ্যা: ${text}`, 'উদাহরণ ও matching visual', 'শেষ কথা ও call to action'];
    scenes.innerHTML = localParts.map((part, index) => `<div class="scene"><b>0${index + 1}</b><span>${part}</span></div>`).join('');
    preview.innerHTML = '<div class="play">✓</div><p>Static demo plan ready · backend ছাড়া MP4 render হবে না</p>';
  } finally {
    button.disabled = false;
    button.textContent = 'ভিডিও তৈরি শুরু করুন';
  }
});
// EOF
// end
