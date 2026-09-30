package in.openhouse.meetings;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
import android.media.MediaRecorder;
import android.os.Build;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.BufferedInputStream;
import java.io.DataInputStream;
import java.io.EOFException;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;

// Replacement for capacitor-voice-recorder that records straight to a file
// in app cache instead of returning the whole clip as base64 across the JS
// bridge. JS then reads the file via Capacitor.convertFileSrc() + fetch(),
// avoiding the 4-5x memory bloat (base64 string + atob string + Uint8Array
// + Blob) that the old flow incurred on long recordings.
//
// Loss protection (a phone call mid-recording used to lose the audio):
//   - The output path is saved to SharedPreferences at start and only cleared
//     on cleanupFile/discard. If the process is killed (OEM battery managers
//     do this during calls), getOrphanRecording() hands the file back on the
//     next launch so JS can offer "Recover previous recording".
//   - An error listener catches the recorder dying (some OEMs error it out
//     when the call takes the mic) and tells JS via the "recorderError" event.
//   - stopRecording() never throws the file away: if stop() fails, whatever
//     was written so far is returned with recovered=true. AAC ADTS has no
//     trailer, so a file cut off mid-recording is still playable.
@CapacitorPlugin(
    name = "MicRecorder",
    permissions = {
        @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "mic")
    }
)
public class MicRecorderPlugin extends Plugin {
    private static final String TAG = "MicRecorder";
    private static final int SAMPLE_RATE = 44100;
    private static final int BIT_RATE = 64000; // 64 kbps mono AAC — voice-grade
    private static final String MIME_TYPE = "audio/aac";
    private static final String PREFS = "mic_recorder";
    private static final String KEY_PATH = "active_path";
    private static final String KEY_STARTED_MS = "active_started_ms";
    private static final int[] ADTS_SAMPLE_RATES = {
        96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350
    };

    private MediaRecorder recorder;
    private File outputFile;
    private boolean isRecording = false;
    private boolean isPaused = false;
    // Set by the MediaRecorder error listener. The recorder has stopped
    // writing; pause/resume/stop will fail, but the file so far is intact.
    private String recorderError = null;

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (getPermissionState("mic") == PermissionState.GRANTED) {
            JSObject result = new JSObject();
            result.put("value", true);
            call.resolve(result);
            return;
        }
        requestPermissionForAlias("mic", call, "micPermissionCallback");
    }

    @PermissionCallback
    private void micPermissionCallback(PluginCall call) {
        boolean granted = getPermissionState("mic") == PermissionState.GRANTED;
        JSObject result = new JSObject();
        result.put("value", granted);
        call.resolve(result);
    }

    @PluginMethod
    public synchronized void startRecording(PluginCall call) {
        if (getPermissionState("mic") != PermissionState.GRANTED) {
            call.reject("MIC_PERMISSION_NOT_GRANTED");
            return;
        }
        if (isRecording) {
            call.reject("Already recording");
            return;
        }
        try {
            File cacheDir = getContext().getCacheDir();
            outputFile = new File(cacheDir, "recording-" + System.currentTimeMillis() + ".aac");

            recorder = new MediaRecorder();
            final MediaRecorder thisRecorder = recorder;
            recorder.setOnErrorListener((mr, what, extra) -> onRecorderError(thisRecorder, what, extra));
            recorder.setAudioSource(MediaRecorder.AudioSource.MIC);
            recorder.setOutputFormat(MediaRecorder.OutputFormat.AAC_ADTS);
            recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
            recorder.setAudioSamplingRate(SAMPLE_RATE);
            recorder.setAudioEncodingBitRate(BIT_RATE);
            recorder.setOutputFile(outputFile.getAbsolutePath());
            recorder.prepare();
            recorder.start();

            isRecording = true;
            isPaused = false;
            recorderError = null;
            prefs().edit()
                .putString(KEY_PATH, outputFile.getAbsolutePath())
                .putLong(KEY_STARTED_MS, System.currentTimeMillis())
                .apply();
            Log.d(TAG, "Recording started at " + outputFile.getAbsolutePath());
            JSObject result = new JSObject();
            result.put("filePath", outputFile.getAbsolutePath());
            call.resolve(result);
        } catch (IOException | IllegalStateException e) {
            Log.e(TAG, "startRecording failed", e);
            cleanup();
            call.reject("startRecording failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public synchronized void pauseRecording(PluginCall call) {
        if (!isRecording || isPaused) {
            call.reject("Not in a state to pause");
            return;
        }
        // MediaRecorder.pause()/resume() require API 24+. On older devices
        // we surface "paused" to the UI but the underlying mic keeps writing.
        // Practically irrelevant since the app's min usable Android is 7+.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) {
            isPaused = true;
            call.resolve();
            return;
        }
        try {
            recorder.pause();
            isPaused = true;
            Log.d(TAG, "Recording paused");
            call.resolve();
        } catch (IllegalStateException e) {
            Log.e(TAG, "pauseRecording failed", e);
            call.reject("pauseRecording failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public synchronized void resumeRecording(PluginCall call) {
        if (!isRecording || !isPaused) {
            call.reject("Not in a state to resume");
            return;
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) {
            isPaused = false;
            call.resolve();
            return;
        }
        try {
            recorder.resume();
            isPaused = false;
            Log.d(TAG, "Recording resumed");
            call.resolve();
        } catch (IllegalStateException e) {
            Log.e(TAG, "resumeRecording failed", e);
            call.reject("resumeRecording failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public synchronized void stopRecording(PluginCall call) {
        if (!isRecording) {
            call.reject("Not recording");
            return;
        }
        String stopError = null;
        try {
            recorder.stop();
        } catch (RuntimeException e) {
            // Typically "stop failed" after the recorder errored out (mic
            // taken by a call). The file up to that point is still good.
            stopError = e.getMessage();
            Log.e(TAG, "stop() failed, salvaging file", e);
        }
        try { recorder.release(); } catch (Exception ignored) {}
        recorder = null;
        isRecording = false;
        isPaused = false;
        File file = outputFile;
        outputFile = null;
        String errorAtStop = recorderError;
        recorderError = null;

        if (file == null || !file.exists() || file.length() == 0) {
            clearActivePath();
            call.reject("stopRecording failed: " + (stopError != null ? stopError : "no audio written"));
            return;
        }

        boolean recovered = stopError != null || errorAtStop != null;
        // Only parse the file when we need the real duration — the JS timer
        // is accurate on the normal path.
        JSObject value = fileInfo(file, recovered);
        value.put("recovered", recovered);
        if (stopError != null) value.put("stopError", stopError);
        if (errorAtStop != null) value.put("recorderError", errorAtStop);
        Log.d(TAG, "Recording stopped, file=" + file.getAbsolutePath() + " size=" + file.length()
            + "B recovered=" + recovered);

        JSObject result = new JSObject();
        result.put("value", value);
        call.resolve(result);
    }

    @PluginMethod
    public synchronized void discardRecording(PluginCall call) {
        if (recorder != null) {
            try { recorder.stop(); } catch (Exception ignored) {}
            try { recorder.release(); } catch (Exception ignored) {}
            recorder = null;
        }
        if (outputFile != null && outputFile.exists()) {
            //noinspection ResultOfMethodCallIgnored
            outputFile.delete();
        }
        // Also covers an orphan from a killed process that the user chose
        // not to recover (outputFile is null then).
        String saved = prefs().getString(KEY_PATH, null);
        if (saved != null) {
            File f = new File(saved);
            //noinspection ResultOfMethodCallIgnored
            f.delete();
        }
        clearActivePath();
        outputFile = null;
        isRecording = false;
        isPaused = false;
        recorderError = null;
        Log.d(TAG, "Recording discarded");
        call.resolve();
    }

    @PluginMethod
    public synchronized void cleanupFile(PluginCall call) {
        // Called by JS after a successful upload so the cache file doesn't
        // linger. Path comes from the JS side since stopRecording() already
        // released our outputFile reference.
        String path = call.getString("filePath");
        if (path != null) {
            File f = new File(path);
            if (f.exists()) {
                //noinspection ResultOfMethodCallIgnored
                f.delete();
                Log.d(TAG, "cleanupFile deleted " + path);
            }
            if (path.equals(prefs().getString(KEY_PATH, null))) clearActivePath();
        }
        call.resolve();
    }

    @PluginMethod
    public synchronized void getStatus(PluginCall call) {
        JSObject result = new JSObject();
        if (!isRecording) {
            result.put("status", "idle");
        } else if (isPaused) {
            result.put("status", "paused");
        } else {
            result.put("status", "recording");
        }
        if (recorderError != null) result.put("recorderError", recorderError);
        call.resolve(result);
    }

    // Recording file left behind by a process that died mid-recording (or
    // before JS cleaned up). Resolves { value: {...} } or {} when none.
    // `sinceMs` is a fallback for recordings started before the path was
    // persisted: the newest recording-<ts>.aac in cache with ts >= sinceMs.
    @PluginMethod
    public synchronized void getOrphanRecording(PluginCall call) {
        JSObject result = new JSObject();
        if (isRecording) {
            call.resolve(result);
            return;
        }
        File file = null;
        String saved = prefs().getString(KEY_PATH, null);
        if (saved != null) {
            file = new File(saved);
        } else {
            Long sinceMs = call.getLong("sinceMs");
            if (sinceMs != null) file = newestRecordingSince(sinceMs);
        }
        if (file == null || !file.exists() || file.length() == 0) {
            clearActivePath();
            call.resolve(result);
            return;
        }
        JSObject value = fileInfo(file, true);
        value.put("startedAtMs", prefs().getLong(KEY_STARTED_MS, 0));
        value.put("lastModifiedMs", file.lastModified());
        result.put("value", value);
        call.resolve(result);
    }

    private synchronized void onRecorderError(MediaRecorder source, int what, int extra) {
        // Ignore late callbacks from a recorder we've already let go of.
        if (source != recorder) return;
        recorderError = "what=" + what + " extra=" + extra;
        Log.e(TAG, "MediaRecorder error " + recorderError);
        JSObject data = new JSObject();
        data.put("what", what);
        data.put("extra", extra);
        notifyListeners("recorderError", data);
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private void clearActivePath() {
        prefs().edit().remove(KEY_PATH).remove(KEY_STARTED_MS).apply();
    }

    private File newestRecordingSince(long sinceMs) {
        File[] files = getContext().getCacheDir().listFiles();
        if (files == null) return null;
        File best = null;
        long bestTs = -1;
        for (File f : files) {
            String n = f.getName();
            if (!n.startsWith("recording-") || !n.endsWith(".aac")) continue;
            try {
                long ts = Long.parseLong(n.substring("recording-".length(), n.length() - ".aac".length()));
                if (ts >= sinceMs && ts > bestTs) {
                    best = f;
                    bestTs = ts;
                }
            } catch (NumberFormatException ignored) {}
        }
        return best;
    }

    // Path/mime/size, plus (when parse=true) the real audio duration and the
    // byte length of complete ADTS frames. A file cut off by a process kill
    // can end in a partial frame; JS trims the blob to validBytes.
    private JSObject fileInfo(File file, boolean parse) {
        JSObject value = new JSObject();
        value.put("filePath", file.getAbsolutePath());
        value.put("mimeType", MIME_TYPE);
        value.put("sizeBytes", file.length());
        if (parse) {
            long[] scan = scanAdts(file);
            value.put("durationSec", scan[1] > 0 ? Math.round(scan[0] * 1024.0 / scan[1]) : 0);
            value.put("validBytes", scan[2]);
        }
        return value;
    }

    // Walks ADTS frame headers. Returns { frames, sampleRate, validBytes }.
    // Paused stretches aren't written to the file, so this is recorded time.
    private static long[] scanAdts(File file) {
        long frames = 0;
        int rate = 0;
        long pos = 0;
        long len = file.length();
        byte[] h = new byte[7];
        try (DataInputStream in = new DataInputStream(
                new BufferedInputStream(new FileInputStream(file), 64 * 1024))) {
            while (pos + 7 <= len) {
                in.readFully(h);
                if ((h[0] & 0xFF) != 0xFF || (h[1] & 0xF0) != 0xF0) break;
                int sfi = (h[2] & 0x3C) >> 2;
                if (rate == 0 && sfi < ADTS_SAMPLE_RATES.length) rate = ADTS_SAMPLE_RATES[sfi];
                int frameLen = ((h[3] & 0x03) << 11) | ((h[4] & 0xFF) << 3) | ((h[5] & 0xE0) >> 5);
                if (frameLen < 7 || pos + frameLen > len) break;
                int toSkip = frameLen - 7;
                while (toSkip > 0) {
                    int skipped = in.skipBytes(toSkip);
                    if (skipped <= 0) throw new EOFException();
                    toSkip -= skipped;
                }
                frames += (h[6] & 0x03) + 1;
                pos += frameLen;
            }
        } catch (IOException e) {
            Log.w(TAG, "ADTS scan stopped at " + pos + ": " + e.getMessage());
        }
        return new long[] { frames, rate, pos };
    }

    private void cleanup() {
        if (recorder != null) {
            try { recorder.release(); } catch (Exception ignored) {}
            recorder = null;
        }
        outputFile = null;
        isRecording = false;
        isPaused = false;
    }
}
