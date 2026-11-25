import http from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 3000);
const renderDir = join(root, 'renders');

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };

function demoPlan(input) {
  const topic = String(input.topic || '').trim();
  return {
    mode: 'demo',
    scenes: [
      { title: 'Hook', narration: topic, visualQuery: topic },
      { title: 'মূল ব্যাখ্যা', narration: `${topic} বিষয়টি সহজভাবে ব্যাখ্যা করা হবে।`, visualQuery: topic },
      { title: 'উদাহরণ', narration: 'একটি বাস্তব উদাহরণ ও relevant visual দেখানো হবে।', visualQuery: `${topic} example` },
      { title: 'শেষ কথা', narration: 'মূল শিক্ষাটি সংক্ষেপে বলা হবে।', visualQuery: `${topic} conclusion` }
    ],
    media: []
  };
}

async function geminiPlan(input) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return demoPlan(input);
  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const prompt = `Create a concise video plan in ${input.language || 'English'} for: ${input.topic}. Duration: ${input.duration || 20} seconds. Return JSON only with scenes, each containing title, narration, and visualQuery. Use 3 to 8 scenes and keep narration suitable for the requested duration.`;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  });
  if (!response.ok) throw new Error(`Gemini returned ${response.status}`);
  const data = await response.json();
  const raw = data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
  const json = JSON.parse(raw.replace(/^```json\s*/i, '').replace(/\s*```$/, ''));
  return { mode: 'gemini', scenes: Array.isArray(json.scenes) ? json.scenes : demoPlan(input).scenes, media: [] };
}

async function searchPexels(scenes) {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return [];
  const media = [];
  for (const scene of scenes.slice(0, 8)) {
    const response = await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(scene.visualQuery)}&per_page=2`, { headers: { Authorization: key } });
    if (!response.ok) continue;
    const data = await response.json();
    for (const video of data.videos || []) media.push({ id: video.id, source: 'Pexels', url: video.url, duration: video.duration, creator: video.user?.name, query: scene.visualQuery });
  }
  return media;
}

async function makePlan(input) {
  const plan = await geminiPlan(input);
  plan.media = await searchPexels(plan.scenes);
  return plan;
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let error = '';
    child.stderr.on('data', (chunk) => { error += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(error.slice(-1200) || `ffmpeg exited ${code}`)));
  });
}

async function renderPlan(plan) {
  await mkdir(renderDir, { recursive: true });
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const file = join(renderDir, `${id}.mp4`);
  const scenes = (plan.scenes || []).slice(0, 12);
  const seconds = Math.max(2, Math.min(30, Number(plan.duration || 20) / Math.max(1, scenes.length)));
  const colors = ['#102a43', '#243b53', '#334e68', '#486581', '#0b525b', '#144552', '#1b3a4b', '#212f45'];
  const inputs = scenes.map((_, i) => ['-f', 'lavfi', '-i', `color=c=${colors[i % colors.length]}:s=720x1280:r=30:d=${seconds}`]).flat();
  const filters = scenes.map((_, i) => `[${i}:v]drawtext=fontcolor=white:fontsize=42:x=(w-text_w)/2:y=(h-text_h)/2:text='SCENE ${i + 1}',format=yuv420p[v${i}]`).join(';');
  const concat = scenes.map((_, i) => `[v${i}]`).join('') + `concat=n=${scenes.length}:v=1:a=0[outv]`;
  await run('ffmpeg', [...inputs, '-filter_complex', `${filters};${concat}`, '-map', '[outv]', '-movflags', '+faststart', '-y', file]);
  return { id, url: `/renders/${id}.mp4`, duration: Math.round(seconds * scenes.length), scenes: scenes.length };
}

async function body(request) {
  let value = '';
  for await (const chunk of request) value += chunk;
  return JSON.parse(value || '{}');
}

const server = http.createServer(async (request, response) => {
  try {
    if (request.method === 'GET' && request.url === '/api/health') return send(response, 200, { ok: true, gemini: Boolean(process.env.GEMINI_API_KEY), media: Boolean(process.env.PEXELS_API_KEY) });
    if (request.method === 'POST' && request.url === '/api/plan') return send(response, 200, await makePlan(await body(request)));
    if (request.method === 'POST' && request.url === '/api/render') return send(response, 200, await renderPlan(await body(request)));
    if (request.method !== 'GET') return send(response, 405, { error: 'Method not allowed' });
    const requested = request.url === '/' ? '/index.html' : request.url.split('?')[0];
    const file = normalize(join(root, requested));
    if (!file.startsWith(root)) return send(response, 403, { error: 'Forbidden' });
    const content = await readFile(file);
    response.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream' });
    response.end(content);
  } catch (error) {
    send(response, 500, { error: error.message || 'Server error' });
  }
});

function send(response, status, value) { response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' }); response.end(JSON.stringify(value)); }
server.listen(port, () => console.log(`AI Video Automation running at http://localhost:${port}`));
