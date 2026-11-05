package io.github.sined1010.kandleos;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(KandleNativePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
