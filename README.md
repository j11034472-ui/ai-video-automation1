# AI Video Automation

বাংলা-first AI video automation-এর MVP scaffold। Topic থেকে scene plan তৈরি করে এবং optional Gemini/Pexels integration ব্যবহার করে।

## Run locally

```bash
pnpm dev
```

Then open `http://localhost:3000`.

Optional `.env` values (never commit this file):

```bash
GEMINI_API_KEY=...
GEMINI_PLAN_MODEL=gemini-3.5-flash-lite
GEMINI_REVIEW_MODEL=gemini-3.1-pro-preview
GEMINI_REVIEW=false
GEMINI_TTS_MODEL=gemini-3.8-flash-tts
PEXELS_API_KEY=...
```

Model roles: Flash-Lite plans quickly and Pro reviews the result. TTS is configured separately so voice generation can be swapped without changing the planner.

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
