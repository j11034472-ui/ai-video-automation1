const form = document.querySelector('#video-form');
const topic = document.querySelector('#topic');
const scenes = document.querySelector('#scene-list');
const preview = document.querySelector('#preview');

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = topic.value.trim();
  if (!text) return;
  const parts = [
    `Hook: ${text}`,
    `মূল বিষয় ব্যাখ্যা: ${text}`,
    'উদাহরণ ও matching licensed visual',
    'সংক্ষিপ্ত উপসংহার ও call to action'
  ];
  scenes.innerHTML = parts.map((part, index) => `<div class="scene"><b>0${index + 1}</b><span>${part}</span></div>`).join('');
  preview.innerHTML = '<div class="play">✓</div><p>Scene plan ready — render worker যুক্ত হলে ভিডিও তৈরি হবে</p>';
});

document.querySelector('#save-schedule').addEventListener('click', () => {
  const count = document.querySelector('#daily').value;
  const time = document.querySelector('#time').value;
  const auto = document.querySelector('#auto').checked ? 'AI topic selection on' : 'নিজের topic ব্যবহার হবে';
  const youtube = document.querySelector('#youtube').checked ? 'YouTube queue on' : 'শুধু draft তৈরি হবে';
  document.querySelector('#schedule-note').textContent = `${count}টি/দিন · ${time} · ${auto} · ${youtube}`;
});
