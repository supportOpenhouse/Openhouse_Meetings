import { Capacitor, registerPlugin } from '@capacitor/core';

// JS-side wrapper for the native `MicForeground` plugin in
// android/app/src/main/java/in/openhouse/meetings/MicForegroundPlugin.java.
// The plugin only exists on Android; on web/iOS these helpers no-op so the
// recorder can call them unconditionally.
const MicForeground = registerPlugin('MicForeground');

function isAndroid() {
  try {
    return Capacitor.getPlatform?.() === 'android';
  } catch {
    return false;
  }
}

export async function startMicForeground() {
  if (!isAndroid()) {
    console.log('[MicForeground] skipped (not android), platform =', Capacitor.getPlatform?.());
    return;
  }
  console.log('[MicForeground] calling native start()');
  try {
    await MicForeground.start();
    console.log('[MicForeground] native start() resolved');
  } catch (e) {
    console.error('[MicForeground] start FAILED:', e?.message || e);
  }
}

export async function stopMicForeground() {
  if (!isAndroid()) return;
  console.log('[MicForeground] calling native stop()');
  try {
    await MicForeground.stop();
    console.log('[MicForeground] native stop() resolved');
  } catch (e) {
    console.error('[MicForeground] stop FAILED:', e?.message || e);
  }
}
