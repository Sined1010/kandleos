package io.github.sined1010.kandleos;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import android.Manifest;

import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSArray;
import org.json.JSONArray;
import android.os.Build;

/** KandleOS's own native bits (src/mobile/native.ts): key storage; alarms come in later. */
@CapacitorPlugin(
        name = "KandleNative",
        permissions = @Permission(strings = {Manifest.permission.POST_NOTIFICATIONS}, alias = "notifications"))
public class KandleNativePlugin extends Plugin {
    private SecureStore secure;

    @Override
    public void load() {
        secure = new SecureStore(getContext());
    }

    @PluginMethod
    public void secureGet(PluginCall call) {
        String name = call.getString("name");
        if (name == null) { call.reject("name missing"); return; }
        JSObject ret = new JSObject();
        ret.put("value", secure.get(name));
        call.resolve(ret);
    }

    @PluginMethod
    public void secureSet(PluginCall call) {
        String name = call.getString("name");
        String value = call.getString("value");
        if (name == null || value == null) { call.reject("name or value missing"); return; }
        try {
            secure.set(name, value);
            call.resolve();
        } catch (Exception e) {
            call.reject("could not store key", e);
        }
    }

    @PluginMethod
    public void secureRemove(PluginCall call) {
        String name = call.getString("name");
        if (name == null) { call.reject("name missing"); return; }
        secure.remove(name);
        call.resolve();
    }

    @PluginMethod
    public void showNotification(PluginCall call) {
        Integer id = call.getInt("id");
        String title = call.getString("title");
        String body = call.getString("body", "");
        if (id == null || title == null) { call.reject("id or title missing"); return; }
        Notifier.show(getContext(), id, title, body);
        call.resolve();
    }

    /** Removes a notification; a re-armed alarm would otherwise fire silently into its old one (setOnlyAlertOnce). */
    @PluginMethod
    public void cancelNotification(PluginCall call) {
        Integer id = call.getInt("id");
        if (id == null) { call.reject("id missing"); return; }
        NotificationManagerCompat.from(getContext()).cancel(id);
        call.resolve();
    }

    /** Asks once for the notification permission (Android 13+); resolves with whether it is granted. */
    @PluginMethod
    public void requestNotify(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
            return;
        }
        requestPermissionForAlias("notifications", call, "notifyAnswered");
    }

    /** The armed alarms (with their source) and the instant switch; schedules or stops the background checks. */
    @PluginMethod
    public void setAlarms(PluginCall call) {
        JSArray list = call.getArray("alarms", new JSArray());
        boolean instant = Boolean.TRUE.equals(call.getBoolean("instant", false));
        AlarmStore store = new AlarmStore(getContext());
        store.setArmed(list, instant);
        boolean any = store.armed().length() > 0;
        if (any) AlarmWorker.schedule(getContext());
        else AlarmWorker.cancel(getContext());
        // Only the service stops itself, after its startForeground (stopping it from here before that crashes
        // the app on Android 9+). A running service is started again so it rereads the list and may end.
        if ((any && instant) || AlarmService.running) AlarmService.start(getContext());
        call.resolve();
    }

    /** Triggers found in the background since the last call; the app merges them (shared/alarms.ts). */
    @PluginMethod
    public void takeTriggered(PluginCall call) {
        JSONArray t = new AlarmStore(getContext()).takeTriggered();
        JSObject ret = new JSObject();
        ret.put("list", t);
        call.resolve(ret);
    }

    /** Background check "analysis done?" for a run this phone started on the PC (AnalysisWorker). */
    @PluginMethod
    public void watchAnalysis(PluginCall call) {
        String symbol = call.getString("symbol");
        Long started = call.getLong("started");
        if (symbol == null || started == null) { call.reject("symbol or started missing"); return; }
        AnalysisWorker.watch(getContext(), symbol, started);
        call.resolve();
    }

    /** The app saw the run end itself: no check, no notification. */
    @PluginMethod
    public void unwatchAnalysis(PluginCall call) {
        AnalysisWorker.cancel(getContext());
        call.resolve();
    }

    @PermissionCallback
    private void notifyAnswered(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", getPermissionState("notifications") == PermissionState.GRANTED);
        call.resolve(ret);
    }
}
