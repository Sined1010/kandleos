package io.github.sined1010.kandleos;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * The armed alarms as the app last sent them (setAlarms) and the triggers found in the background that
 * the app has not collected yet (takeTriggered). One lock for worker, service and plugin.
 */
public final class AlarmStore {
    private static final Object LOCK = new Object();
    private final SharedPreferences prefs;
    // Line tables in a file of their own: SharedPreferences rewrites a whole file on every commit, and record() commits
    // the armed list on every pass (every 15 s in instant mode).
    private final SharedPreferences knotPrefs;

    public AlarmStore(Context c) {
        prefs = c.getApplicationContext().getSharedPreferences("kandleos_alarms", Context.MODE_PRIVATE);
        knotPrefs = c.getApplicationContext().getSharedPreferences("kandleos_alarm_knots", Context.MODE_PRIVATE);
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

    /**
     * From the app; alarms that already fired here but were not collected yet stay out, so none fires twice. A line
     * alarm's table ("knots", up to a year of points) goes to its own entry: record() rewrites the armed list on every
     * pass, every 15 s in instant mode.
     */
    public void setArmed(JSONArray list, boolean instant) {
        synchronized (LOCK) {
            List<String> fired = firedIds();
            JSONArray keep = new JSONArray();
            SharedPreferences.Editor e = prefs.edit();
            SharedPreferences.Editor k = knotPrefs.edit().clear();
            for (int i = 0; i < list.length(); i++) {
                JSONObject a = list.optJSONObject(i);
                if (a == null || fired.contains(a.optString("id"))) continue;
                Object knots = a.remove("knots");
                if (knots != null) k.putString(KNOTS + a.optString("id"), knots.toString());
                keep.put(a);
            }
            k.commit();
            e.putString("armed", keep.toString()).putBoolean("instant", instant).commit();
        }
    }

    private static final String KNOTS = "knots:";

    /** A line alarm's table as times and prices; null for a fixed-price alarm or a broken table. */
    public double[][] knotsOf(String id) {
        synchronized (LOCK) {
            String s = knotPrefs.getString(KNOTS + id, null);
            if (s == null) return null;
            try {
                JSONArray arr = new JSONArray(s);
                double[][] out = new double[2][arr.length()];
                for (int i = 0; i < arr.length(); i++) {
                    JSONArray k = arr.getJSONArray(i);
                    out[0][i] = k.getDouble(0);
                    out[1][i] = k.getDouble(1);
                }
                return arr.length() > 0 ? out : null;
            } catch (Exception ex) {
                return null;
            }
        }
    }

    /** Stops checking an alarm whose line table ran out; the app decides what that means when it opens. */
    public void drop(String id) {
        synchronized (LOCK) {
            try {
                JSONArray armed = new JSONArray(prefs.getString("armed", "[]"));
                JSONArray next = new JSONArray();
                for (int i = 0; i < armed.length(); i++) {
                    JSONObject a = armed.getJSONObject(i);
                    if (!a.getString("id").equals(id)) next.put(a);
                }
                prefs.edit().putString("armed", next.toString()).commit();
                knotPrefs.edit().remove(KNOTS + id).commit();
            } catch (Exception ignored) {
                // a broken list is replaced with the next setAlarms from the app
            }
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
        for (int i = 0; i < armed.length(); i++) {
            JSONObject a = armed.optJSONObject(i);
            if (a == null) continue;
            try {
                // Without a start (bad data from the app) only bars from now on count, never years of old ones.
                long from = a.optLong("checkedUntil", 0);
                if (from <= 0) from = System.currentTimeMillis() / 1000;
                String id = a.getString("id");
                if (a.has("body")) {
                    checkLine(c, store, a, id, from);
                    continue;
                }
                List<AlarmCheck.Bar> bars = AlarmFetch.bars(c, a.getString("source"), a.getString("providerSymbol"), from);
                double price = a.getDouble("price");
                long at = AlarmCheck.hit(a.getString("op"), price, from, false, bars);
                if (at >= 0) {
                    if (store.record(a.getString("id"), at, true, price))
                        Notifier.show(c, Notifier.idOf(a.getString("id")), a.optString("title", a.getString("symbol")), c.getString(R.string.alarm_body));
                } else {
                    // The newest bar may still move, so it is looked at again next time.
                    if (!bars.isEmpty()) store.record(a.getString("id"), bars.get(bars.size() - 1).time, false, price);
                }
            } catch (Exception e) {
                // offline, source error or a broken entry: tried again next time
            }
        }
        // Read again: an alarm the app armed during this pass counts too, so the checks do not stop without it.
        return store.armed().length();
    }

    /** A line alarm: bars against where the line is at each bar; past the end of its table it is no longer checked. */
    private static void checkLine(Context c, AlarmStore store, JSONObject a, String id, long from) throws Exception {
        double[][] k = store.knotsOf(id);
        // No readable table: nothing to check against, so it must not keep the checks running.
        if (k == null) {
            store.drop(id);
            return;
        }
        long[] kt = new long[k[0].length];
        for (int i = 0; i < kt.length; i++) kt[i] = (long) k[0][i];
        double[] kp = k[1];
        if (from > kt[kt.length - 1]) {
            store.drop(id);
            return;
        }
        List<AlarmCheck.Bar> bars = AlarmFetch.bars(c, a.getString("source"), a.getString("providerSymbol"), from);
        long at = AlarmCheck.hitLine(a.getString("op"), from, bars, kt, kp);
        if (at >= 0) {
            double price = AlarmCheck.linePrice(kt, kp, at);
            if (store.record(id, at, true, price)) {
                String body = a.getString("body").replace("{price}", AlarmCheck.formatPrice(price, Locale.getDefault()));
                Notifier.show(c, Notifier.idOf(id), a.optString("title", a.getString("symbol")), body);
            }
        } else if (!bars.isEmpty()) {
            long last = bars.get(bars.size() - 1).time;
            if (last > kt[kt.length - 1]) store.drop(id);
            else store.record(id, last, false, a.getDouble("price"));
        }
    }
}
