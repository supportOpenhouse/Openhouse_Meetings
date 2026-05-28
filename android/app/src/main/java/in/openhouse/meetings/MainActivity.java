package in.openhouse.meetings;

import android.os.Bundle;
import android.util.Log;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        Log.d("MicForeground", "MainActivity.onCreate registering MicForegroundPlugin");
        registerPlugin(MicForegroundPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
