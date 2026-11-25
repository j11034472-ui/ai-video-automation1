import http from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 3000);
const renderDir = join(root, 'renders');
const assetDir = join(renderDir, 'assets');
const envFile = join(root, '.env');
const dataDir = join(root, 'data');
const jobsFile = join(dataDir, 'jobs.json');
const schedulesFile = join(dataDir, 'schedules.json');

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
  const model = process.env.GEMINI_PLAN_MODEL || process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
  const prompt = `Create a concise video plan in ${input.language || 'English'} for: ${input.topic}. Duration: ${input.duration || 20} seconds. Return JSON only with scenes, each containing title, narration, and visualQuery. Use 3 to 8 scenes and keep narration suitable for the requested duration.`;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  });
  if (!response.ok) throw new Error(`Gemini returned ${response.status}`);
  const data = await response.json();
  const raw = data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
  const json = JSON.parse(raw.replace(/^```json\s*/i, '').replace(/\s*```$/, ''));
  const scenes = Array.isArray(json.scenes) ? json.scenes : demoPlan(input).scenes;
  return { mode: 'gemini', model, scenes, media: [], review: await reviewPlan(input, scenes) };
}

async function reviewPlan(input, scenes) {
  const key = process.env.GEMINI_API_KEY;
  if (!key || process.env.GEMINI_REVIEW !== 'true') return { enabled: false, passed: true };
  const model = process.env.GEMINI_REVIEW_MODEL || 'gemini-3.1-pro-preview';
  const prompt = `Review this ${input.language || 'English'} video plan for factual clarity, repetition, unsafe claims, and whether each visualQuery matches its narration. Return JSON only: {"passed":true|false,"notes":"short note","fixes":["..."]}. Plan: ${JSON.stringify(scenes)}`;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  });
  if (!response.ok) return { enabled: true, passed: true, skipped: true, model };
  const data = await response.json();
  const raw = data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '{}';
  try { return { enabled: true, model, ...JSON.parse(raw.replace(/^```json\s*/i, '').replace(/\s*```$/, '')) }; }
  catch { return { enabled: true, model, passed: true, skipped: true }; }
}

async function searchPexels(scenes) {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return [];
  const media = [];
  for (const [sceneIndex, scene] of scenes.slice(0, 8).entries()) {
    const query = encodeURIComponent(scene.visualQuery);
    const [videoResponse, photoResponse] = await Promise.all([
      fetch(`https://api.pexels.com/videos/search?query=${query}&per_page=2`, { headers: { Authorization: key } }),
      fetch(`https://api.pexels.com/v1/search?query=${query}&per_page=2`, { headers: { Authorization: key } })
    ]);
    if (videoResponse.ok) {
      const data = await videoResponse.json();
      for (const video of data.videos || []) media.push({ type: 'video', sceneIndex, id: video.id, source: 'Pexels', url: video.url, preview: video.image, duration: video.duration, creator: video.user?.name, query: scene.visualQuery, licenseUrl: 'https://www.pexels.com/license/' });
    }
    if (photoResponse.ok) {
      const data = await photoResponse.json();
      for (const photo of data.photos || []) media.push({ type: 'photo', sceneIndex, id: photo.id, source: 'Pexels', url: photo.url, preview: photo.src?.large2x || photo.src?.large, creator: photo.photographer, query: scene.visualQuery, licenseUrl: 'https://www.pexels.com/license/' });
    }
  }
  return media;
}

async function searchPixabay(scenes) {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) return [];
  const media = [];
  for (const [sceneIndex, scene] of scenes.slice(0, 8).entries()) {
    const query = encodeURIComponent(scene.visualQuery);
    const [photoResponse, videoResponse] = await Promise.all([
      fetch(`https://pixabay.com/api/?key=${encodeURIComponent(key)}&q=${query}&image_type=photo&safesearch=true&per_page=2`),
      fetch(`https://pixabay.com/api/videos/?key=${encodeURIComponent(key)}&q=${query}&safesearch=true&per_page=2`)
    ]);
    if (photoResponse.ok) {
      const data = await photoResponse.json();
      for (const photo of data.hits || []) media.push({ type: 'photo', provider: 'Pixabay', sceneIndex, id: photo.id, url: photo.pageURL, preview: photo.largeImageURL || photo.webformatURL, creator: photo.user, query: scene.visualQuery, licenseUrl: 'https://pixabay.com/service/license-summary/' });
    }
    if (videoResponse.ok) {
      const data = await videoResponse.json();
      for (const video of data.hits || []) media.push({ type: 'video', provider: 'Pixabay', sceneIndex, id: video.id, url: video.pageURL, preview: video.videos?.medium?.thumbnail, downloadUrl: video.videos?.medium?.url, creator: video.user, query: scene.visualQuery, licenseUrl: 'https://pixabay.com/service/license-summary/' });
    }
  }
  return media;
}

async function makePlan(input) {
  const plan = await geminiPlan(input);
  plan.media = process.env.PIXABAY_API_KEY ? await searchPixabay(plan.scenes) : await searchPexels(plan.scenes);
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

async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
}

async function writeJson(file, value) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(file, JSON.stringify(value, null, 2), { mode: 0o600 });
}

async function recordJob(job) {
  const jobs = await readJson(jobsFile, []);
  jobs.unshift({ ...job, createdAt: new Date().toISOString() });
  await writeJson(jobsFile, jobs.slice(0, 100));
}

async function renderPlan(plan) {
  await mkdir(renderDir, { recursive: true });
  await mkdir(assetDir, { recursive: true });
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const file = join(renderDir, `${id}.mp4`);
  const scenes = (plan.scenes || []).slice(0, 12);
  const seconds = Math.max(2, Math.min(30, Number(plan.duration || 20) / Math.max(1, scenes.length)));
  const colors = ['#102a43', '#243b53', '#334e68', '#486581', '#0b525b', '#144552', '#1b3a4b', '#212f45'];
  const assets = await Promise.all(scenes.map((scene, i) => {
    const match = (plan.media || []).find((item) => item.sceneIndex === i && item.type === 'photo' && item.preview);
    return match ? downloadAsset(match.preview, `${id}-${i}-${match.id}`) : null;
  }));
  const inputs = scenes.map((_, i) => assets[i] ? ['-loop', '1', '-i', assets[i]] : ['-f', 'lavfi', '-i', `color=c=${colors[i % colors.length]}:s=720x1280:r=30:d=${seconds}`]).flat();
  const filters = scenes.map((scene, i) => {
    const text = `SCENE ${i + 1}`;
    const source = assets[i] ? `[${i}:v]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,setsar=1,trim=duration=${seconds},setpts=PTS-STARTPTS,` : `[${i}:v]`;
    return `${source}drawtext=fontcolor=white:fontsize=42:x=(w-text_w)/2:y=(h-text_h)/2:text='${text}',format=yuv420p[v${i}]`;
  }).join(';');
  const concat = scenes.map((_, i) => `[v${i}]`).join('') + `concat=n=${scenes.length}:v=1:a=0[outv]`;
  const silent = join(renderDir, `${id}-silent.mp4`);
  await run('ffmpeg', [...inputs, '-filter_complex', `${filters};${concat}`, '-map', '[outv]', '-movflags', '+faststart', '-y', silent]);
  let audioFile;
  if (process.env.GEMINI_API_KEY && plan.voiceText) audioFile = await generateTts(plan.voiceText, plan.voice);
  if (audioFile) await run('ffmpeg', ['-i', silent, '-i', audioFile, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-shortest', '-movflags', '+faststart', '-y', file]);
  else await run('ffmpeg', ['-i', silent, '-c', 'copy', '-movflags', '+faststart', '-y', file]);
  return { id, url: `/renders/${id}.mp4`, duration: Math.round(seconds * scenes.length), scenes: scenes.length, audio: Boolean(audioFile) };
}

async function downloadAsset(url, name) {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const type = response.headers.get('content-type') || '';
    if (!type.startsWith('image/')) return null;
    const ext = type.includes('png') ? 'png' : 'jpg';
    const file = join(assetDir, `${name}.${ext}`);
    await writeFile(file, Buffer.from(await response.arrayBuffer()));
    return file;
  } catch { return null; }
}

async function generateTts(text, selectedVoice) {
  const voice = selectedVoice?.includes('Warm') ? 'Aoede' : selectedVoice?.includes('English') ? 'Puck' : 'Kore';
  const model = process.env.GEMINI_TTS_MODEL || 'gemini-3.8-flash-tts';
  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({ model, input: [{ type: 'user_input', content: [{ type: 'text', text, annotations: [{ type: 'speech_metadata', style: 'clear, warm and engaging' }] }] }], response_format: { type: 'audio' }, generation_config: { speech_config: [{ voice }] } })
  });
  if (!response.ok) throw new Error(`TTS returned ${response.status}`);
  const data = await response.json();
  const audioData = data.output_audio?.data || data.steps?.flatMap((step) => step.content || []).reverse().find((part) => part.type === 'audio')?.data;
  if (!audioData) throw new Error('TTS returned no audio');
  const file = join(renderDir, `tts-${Date.now()}.wav`);
  await writeFile(file, Buffer.from(audioData, 'base64'));
  return file;
}

async function body(request) {
  let value = '';
  for await (const chunk of request) value += chunk;
  return JSON.parse(value || '{}');
}

const server = http.createServer(async (request, response) => {
  try {
    if (request.method === 'GET' && request.url === '/api/health') return send(response, 200, { ok: true, gemini: Boolean(process.env.GEMINI_API_KEY), media: Boolean(process.env.PEXELS_API_KEY) });
    if (request.method === 'GET' && request.url === '/api/config') return send(response, 200, {
      gemini: Boolean(process.env.GEMINI_API_KEY), media: Boolean(process.env.PIXABAY_API_KEY || process.env.PEXELS_API_KEY),
      mediaProvider: process.env.PIXABAY_API_KEY ? 'Pixabay' : process.env.PEXELS_API_KEY ? 'Pexels' : 'Demo fallback',
      youtube: Boolean(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET),
      models: { plan: process.env.GEMINI_PLAN_MODEL || 'gemini-3.5-flash-lite', review: process.env.GEMINI_REVIEW_MODEL || 'gemini-3.1-pro-preview', tts: process.env.GEMINI_TTS_MODEL || 'gemini-3.8-flash-tts' }
    });
    if (request.method === 'GET' && request.url === '/api/jobs') return send(response, 200, await readJson(jobsFile, []));
    if (request.method === 'GET' && request.url === '/api/schedules') return send(response, 200, await readJson(schedulesFile, []));
    if (request.method === 'POST' && request.url === '/api/schedules') {
      const input = await body(request);
      const schedules = await readJson(schedulesFile, []);
      const schedule = { id: Date.now().toString(36), daily: Math.max(1, Math.min(20, Number(input.daily || 1))), time: String(input.time || '18:00'), autoTopic: Boolean(input.autoTopic), youtubeQueue: Boolean(input.youtubeQueue), enabled: true, createdAt: new Date().toISOString() };
      schedules.unshift(schedule);
      await writeJson(schedulesFile, schedules.slice(0, 20));
      return send(response, 200, schedule);
    }
    if (request.method === 'POST' && request.url === '/api/settings') {
      const input = await body(request);
      const allowed = ['GEMINI_API_KEY', 'PIXABAY_API_KEY', 'PEXELS_API_KEY', 'YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET'];
      const values = Object.fromEntries(allowed.map((name) => [name, String(input[name] || '').trim() || process.env[name] || '']));
      for (const name of allowed) if (values[name]) process.env[name] = values[name];
      const lines = allowed.filter((name) => values[name]).map((name) => `${name}=${values[name]}`);
      if (lines.length) await writeFile(envFile, `${lines.join('\n')}\n`, { mode: 0o600 });
      return send(response, 200, { ok: true, configured: { gemini: Boolean(process.env.GEMINI_API_KEY), media: Boolean(process.env.PIXABAY_API_KEY || process.env.PEXELS_API_KEY), youtube: Boolean(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET) } });
    }
    if (request.method === 'POST' && request.url === '/api/plan') return send(response, 200, await makePlan(await body(request)));
    if (request.method === 'POST' && request.url === '/api/render') {
      const input = await body(request);
      const started = Date.now();
      try {
        const result = await renderPlan(input);
        await recordJob({ id: result.id, status: 'ready', url: result.url, duration: result.duration, scenes: result.scenes, audio: result.audio, elapsedMs: Date.now() - started });
        return send(response, 200, result);
      } catch (error) {
        await recordJob({ id: `failed-${Date.now()}`, status: 'failed', error: error.message });
        throw error;
      }
    }
    if (request.method === 'POST' && request.url === '/api/tts') {
      const input = await body(request);
      if (!process.env.GEMINI_API_KEY) return send(response, 400, { error: 'GEMINI_API_KEY is not configured' });
      const file = await generateTts(String(input.text || ''), input.voice);
      return send(response, 200, { url: `/${file.slice(root.length).replaceAll('\\', '/')}` });
    }
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
