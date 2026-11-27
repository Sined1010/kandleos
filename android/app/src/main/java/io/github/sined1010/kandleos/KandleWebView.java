package io.github.sined1010.kandleos;

import android.content.Context;
import android.util.AttributeSet;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;

import com.getcapacitor.CapacitorWebView;

/**
 * Capacitor's WebView that asks the keyboard not to learn from what is typed (symbols, names, notes, a pasted pairing
 * code): Gboard and others then type as in incognito mode. Used through res/layout/capacitor_bridge_layout_main.xml,
 * which takes the place of Capacitor's own layout.
 */
public class KandleWebView extends CapacitorWebView {
    public KandleWebView(Context context, AttributeSet attrs) {
        super(context, attrs);
    }

    @Override
    public InputConnection onCreateInputConnection(EditorInfo outAttrs) {
        InputConnection ic = super.onCreateInputConnection(outAttrs);
        outAttrs.imeOptions |= EditorInfo.IME_FLAG_NO_PERSONALIZED_LEARNING;
        return ic;
    }
}
