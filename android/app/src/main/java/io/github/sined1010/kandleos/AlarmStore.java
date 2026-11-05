package io.github.sined1010.kandleos;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * The armed alarms as the app last sent them (setAlarms) and the triggers found in the background that
 * the app has not collected yet (takeTriggered). One lock for worker, service and plugin.
 */
public final class AlarmStore {
    private static final Object LOCK = new Object();
    private final SharedPreferences prefs;

    public AlarmStore(Context c) {
        prefs = c.getApplicationContext().getSharedPreferences("kandleos_alarms", Context.MODE_PRIVATE);
    }

    /** Armed alarms: {id, symbol, op, price, checkedUntil, source, providerSymbol}. */
    public JSONArray armed() {
        synchronized (LOCK) {
            try {
                return new JSONArray(prefs.getString("armed", "[]"));
            } catch (Exception e) {
                return new JSONArray();
            }
        }
    }

    /** From the app; alarms that already fired here but were not collected yet stay out, so none fires twice. */
    public void setArmed(JSONArray list, boolean instant) {
        synchronized (LOCK) {
            List<String> fired = firedIds();
            JSONArray keep = new JSONArray();
            for (int i = 0; i < list.length(); i++) {
                JSONObject a = list.optJSONObject(i);
                if (a != null && !fired.contains(a.optString("id"))) keep.put(a);
            }
            prefs.edit().putString("armed", keep.toString()).putBoolean("instant", instant).commit();
        }
    }

    public boolean instant() {
        return prefs.getBoolean("instant", false);
    }

    /**
     * After a check: fired alarms leave the armed list and wait for the app; others remember how far they got.
     * Returns false when the alarm is no longer armed (fired elsewhere, or removed by the app meanwhile): then
     * nothing is recorded and nobody should be notified.
     */
    public boolean record(String id, long checkedUntil, boolean fired, double price) {
        synchronized (LOCK) {
            try {
                JSONArray armed = new JSONArray(prefs.getString("armed", "[]"));
                JSONArray next = new JSONArray();
                boolean found = false;
                for (int i = 0; i < armed.length(); i++) {
                    JSONObject a = armed.getJSONObject(i);
                    if (!a.getString("id").equals(id)) next.put(a);
                    else {
                        found = true;
                        if (!fired) next.put(a.put("checkedUntil", Math.max(a.optLong("checkedUntil"), checkedUntil)));
                    }
                }
                if (!found) return false;
                SharedPreferences.Editor e = prefs.edit().putString("armed", next.toString());
                if (fired) {
                    JSONArray t = new JSONArray(prefs.getString("triggered", "[]"));
                    t.put(new JSONObject().put("id", id).put("triggeredAt", checkedUntil).put("triggeredPrice", price).put("checkedUntil", checkedUntil));
                    e.putString("triggered", t.toString());
                }
                e.commit();
                return true;
            } catch (Exception ignored) {
                // a broken entry is dropped with the next setAlarms from the app
                return false;
            }
        }
    }

    /** Hands the background triggers to the app and forgets them. */
    public JSONArray takeTriggered() {
        synchronized (LOCK) {
            String s = prefs.getString("triggered", "[]");
            prefs.edit().remove("triggered").commit();
            try {
                return new JSONArray(s);
            } catch (Exception e) {
                return new JSONArray();
            }
        }
    }

    private List<String> firedIds() {
        List<String> ids = new ArrayList<>();
        try {
            JSONArray t = new JSONArray(prefs.getString("triggered", "[]"));
            for (int i = 0; i < t.length(); i++) ids.add(t.getJSONObject(i).getString("id"));
        } catch (Exception ignored) {
            // nothing collected yet
        }
        return ids;
    }

    /** One pass over all armed alarms; returns how many are still armed. Shared by worker and service. */
    public static int checkAll(Context c) {
        AlarmStore store = new AlarmStore(c);
        JSONArray armed = store.armed();
        int left = 0;
        for (int i = 0; i < armed.length(); i++) {
            JSONObject a = armed.optJSONObject(i);
            if (a == null) continue;
            try {
                long from = a.optLong("checkedUntil");
                List<AlarmCheck.Bar> bars = AlarmFetch.bars(c, a.getString("source"), a.getString("providerSymbol"), from);
                double price = a.getDouble("price");
                long at = AlarmCheck.hit(a.getString("op"), price, from, false, bars);
                if (at >= 0) {
                    if (store.record(a.getString("id"), at, true, price))
                        Notifier.show(c, Notifier.idOf(a.getString("id")), a.optString("title", a.getString("symbol")), c.getString(R.string.alarm_body));
                } else {
                    left++;
                    // The newest bar may still move, so it is looked at again next time.
                    if (!bars.isEmpty()) store.record(a.getString("id"), bars.get(bars.size() - 1).time, false, price);
                }
            } catch (Exception e) {
                left++; // offline or source error: tried again next time
            }
        }
        return left;
    }
}
