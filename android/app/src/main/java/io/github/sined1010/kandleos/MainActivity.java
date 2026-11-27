package io.github.sined1010.kandleos;

import android.os.Build;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(KandleNativePlugin.class);
        super.onCreate(savedInstanceState);
        // No picture of the watchlist in recent apps (Android 13+); screenshots stay allowed.
        if (Build.VERSION.SDK_INT >= 33) setRecentsScreenshotEnabled(false);
    }
}
