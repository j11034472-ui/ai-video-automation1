# AI Video Automation

বাংলা-first AI video automation-এর MVP scaffold। এখন এটি frontend prototype: topic থেকে scene plan ও automation settings দেখায়।

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
