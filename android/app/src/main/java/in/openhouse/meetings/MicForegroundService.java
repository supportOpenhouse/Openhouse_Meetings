package in.openhouse.meetings;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;

import androidx.core.app.NotificationCompat;

// Foreground service that keeps the OS from killing the process while the
// `capacitor-voice-recorder` plugin is capturing audio with the screen off
// or the app backgrounded. The service itself doesn't touch the mic — it
// just shows the user-visible notification + foregroundServiceType=microphone
// the OS requires to honour the "don't kill me" contract.
public class MicForegroundService extends Service {
    public static final String CHANNEL_ID = "openhouse_meeting_recording";
    public static final int NOTIFICATION_ID = 1042;
    private static final String TAG = "MicForeground";

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Log.d(TAG, "Service.onStartCommand fired, sdk=" + Build.VERSION.SDK_INT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm =
                (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null && nm.getNotificationChannel(CHANNEL_ID) == null) {
                NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Meeting recording",
                    NotificationManager.IMPORTANCE_LOW
                );
                channel.setDescription(
                    "Keeps the microphone recording when the screen is off."
                );
                channel.setShowBadge(false);
                nm.createNotificationChannel(channel);
            }
        }

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Recording in progress")
            .setContentText("Openhouse is recording the meeting.")
            .setSmallIcon(R.drawable.ic_mic)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build();

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
                );
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
            Log.d(TAG, "startForeground() completed, notification should be visible");
        } catch (Exception e) {
            Log.e(TAG, "startForeground() threw " + e.getClass().getSimpleName() + ": " + e.getMessage(), e);
        }

        return START_NOT_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
