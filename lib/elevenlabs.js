export async function transcribeWithElevenLabs(audioBuffer, mimeType, language) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not set');

  const fd = new FormData();
  const blob = new Blob([audioBuffer], { type: mimeType || 'audio/webm' });
  fd.append('file', blob, 'meeting.webm');
  fd.append('model_id', 'scribe_v2');
  fd.append('diarize', 'true');
  fd.append('tag_audio_events', 'false');
  if (language) fd.append('language_code', language);

  const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: { 'xi-api-key': apiKey },
    body: fd,
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`ElevenLabs error (${res.status}): ${t.slice(0, 300)}`);
  }
  return await res.json();
}
