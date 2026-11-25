# AI Video Automation

বাংলা-first AI video automation-এর MVP scaffold। Topic থেকে scene plan তৈরি করে এবং optional Gemini/Pexels integration ব্যবহার করে।

## Run locally

```bash
cp .env.example .env
# .env খুলে নিজের key বসান, তারপর:
pnpm dev
```

Then open `http://localhost:3000`.

## Public deployment

Use Render as a Docker Web Service. Connect this GitHub repository, keep the Docker runtime, and add the secret environment variables in the Render dashboard. GitHub Pages cannot run the backend, scheduler or FFmpeg worker.

Optional `.env` values (never commit this file):

```bash
GEMINI_API_KEY=...
GEMINI_PLAN_MODEL=gemini-3.5-flash-lite
GEMINI_REVIEW_MODEL=gemini-3.1-pro-preview
GEMINI_REVIEW=false
GEMINI_TTS_MODEL=gemini-3.8-flash-tts
PIXABAY_API_KEY=...
PEXELS_API_KEY=...
```

Model roles: Flash-Lite plans quickly and Pro reviews the result. Gemini 3.8 Flash TTS generates an optional WAV voice track, which FFmpeg can mux into the MP4. Pixabay is the primary in-app media provider and Pexels is the fallback. See the [official TTS guide](https://ai.google.dev/gemini-api/docs/speech-generation).

## Planned modules

- Gemini script generation with quality filtering
- Licensed photo/video retrieval with source and license records
- Scene-level visual matching
- TTS voice generation
- FFmpeg/Remotion render worker
- Queue, retry and scheduled jobs
- YouTube OAuth upload/scheduling

## Security

API keys, OAuth tokens and database credentials কখনো source code-এ রাখবেন না। এগুলো deployment secret manager-এ রাখতে হবে।
