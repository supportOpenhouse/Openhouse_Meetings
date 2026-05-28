package in.openhouse.meetings;

import android.content.Intent;
import android.os.Build;
import android.util.Log;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "MicForeground")
public class MicForegroundPlugin extends Plugin {
    private static final String TAG = "MicForeground";

    @PluginMethod
    public void start(PluginCall call) {
        Log.d(TAG, "Plugin.start() called from JS");
        try {
            Intent intent = new Intent(getContext(), MicForegroundService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Log.d(TAG, "calling startForegroundService(O+)");
                getContext().startForegroundService(intent);
            } else {
                Log.d(TAG, "calling startService(pre-O)");
                getContext().startService(intent);
            }
            Log.d(TAG, "start intent dispatched OK");
            call.resolve();
        } catch (Exception e) {
            Log.e(TAG, "Plugin.start() failed: " + e.getClass().getSimpleName() + ": " + e.getMessage(), e);
            call.reject("MicForeground.start failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Log.d(TAG, "Plugin.stop() called from JS");
        try {
            Intent intent = new Intent(getContext(), MicForegroundService.class);
            getContext().stopService(intent);
            Log.d(TAG, "stop intent dispatched OK");
            call.resolve();
        } catch (Exception e) {
            Log.e(TAG, "Plugin.stop() failed: " + e.getClass().getSimpleName() + ": " + e.getMessage(), e);
            call.reject("MicForeground.stop failed: " + e.getMessage());
        }
    }
}
