package in.openhouse.meetings;

import android.Manifest;
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

import java.io.File;
import java.io.IOException;

// Replacement for capacitor-voice-recorder that records straight to a file
// in app cache instead of returning the whole clip as base64 across the JS
// bridge. JS then reads the file via Capacitor.convertFileSrc() + fetch(),
// avoiding the 4-5x memory bloat (base64 string + atob string + Uint8Array
// + Blob) that the old flow incurred on long recordings.
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

    private MediaRecorder recorder;
    private File outputFile;
    private boolean isRecording = false;
    private boolean isPaused = false;

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
            Log.d(TAG, "Recording started at " + outputFile.getAbsolutePath());
            call.resolve();
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
        try {
            recorder.stop();
            recorder.release();
            recorder = null;
            isRecording = false;
            isPaused = false;

            String filePath = outputFile.getAbsolutePath();
            long sizeBytes = outputFile.length();
            Log.d(TAG, "Recording stopped, file=" + filePath + " size=" + sizeBytes + "B");

            JSObject value = new JSObject();
            value.put("filePath", filePath);
            value.put("mimeType", MIME_TYPE);
            value.put("sizeBytes", sizeBytes);

            JSObject result = new JSObject();
            result.put("value", value);
            call.resolve(result);
        } catch (IllegalStateException | RuntimeException e) {
            Log.e(TAG, "stopRecording failed", e);
            cleanup();
            call.reject("stopRecording failed: " + e.getMessage());
        }
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
        outputFile = null;
        isRecording = false;
        isPaused = false;
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
        call.resolve(result);
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
