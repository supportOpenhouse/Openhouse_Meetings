package in.openhouse.meetings;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final int NOTIFICATION_PERMISSION_REQUEST_CODE = 9034;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        Log.d("MicForeground", "MainActivity.onCreate registering MicForegroundPlugin");
        registerPlugin(MicForegroundPlugin.class);
        super.onCreate(savedInstanceState);

        // Android 13+ gates notifications behind a runtime permission. Without
        // it the foreground-service "Recording in progress" indicator is
        // suppressed even though the service is running, leaving the user no
        // visible cue that the mic is hot. Service works either way; this
        // just makes the indicator visible once the user grants.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
                Log.d("MicForeground", "requesting POST_NOTIFICATIONS at launch");
                requestPermissions(
                    new String[]{ Manifest.permission.POST_NOTIFICATIONS },
                    NOTIFICATION_PERMISSION_REQUEST_CODE
                );
            }
        }
    }
}
