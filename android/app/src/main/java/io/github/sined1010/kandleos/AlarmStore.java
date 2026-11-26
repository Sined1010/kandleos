package io.github.sined1010.kandleos;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
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
        return record(id, checkedUntil, fired, price, -1);
    }

    /** Like above; a box alarm also keeps when its entry was first touched ({@code entryAt} >= 0), and reports it. */
    public boolean record(String id, long checkedUntil, boolean fired, double price, long entryAt) {
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
                        if (entryAt >= 0 && !a.has("entryAt")) a.put("entryAt", entryAt);
                        if (!fired) next.put(a.put("checkedUntil", Math.max(a.optLong("checkedUntil"), checkedUntil)));
                    }
                }
                if (!found) return false;
                SharedPreferences.Editor e = prefs.edit().putString("armed", next.toString());
                if (fired) {
                    JSONArray t = new JSONArray(prefs.getString("triggered", "[]"));
                    JSONObject trig = new JSONObject().put("id", id).put("triggeredAt", checkedUntil).put("triggeredPrice", price).put("checkedUntil", checkedUntil);
                    if (entryAt >= 0) trig.put("entryAt", entryAt);
                    t.put(trig);
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
        Set<String> done = new HashSet<>();
        for (int i = 0; i < armed.length(); i++) {
            JSONObject a = armed.optJSONObject(i);
            if (a == null) continue;
            try {
                // Without a start (bad data from the app) only bars from now on count, never years of old ones.
                long from = startOf(a);
                String id = a.getString("id");
                if (done.contains(id)) continue;
                if (a.has("entry")) {
                    checkBox(c, store, a, find(armed, a.optString("pair")), done);
                    continue;
                }
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

    private static long startOf(JSONObject a) {
        long from = a.optLong("checkedUntil", 0);
        return from > 0 ? from : System.currentTimeMillis() / 1000;
    }

    private static JSONObject find(JSONArray armed, String id) {
        for (int i = 0; i < armed.length(); i++) {
            JSONObject x = armed.optJSONObject(i);
            if (x != null && id.equals(x.optString("id"))) return x;
        }
        return null;
    }

    /** One side of a position box: its table and the box fields from the app. */
    private static final class Side {
        final JSONObject a;
        final String id;
        final long[] kt;
        final double[] kp;
        long[] scan = {-1, -1};

        Side(JSONObject a, double[][] k) throws Exception {
            this.a = a;
            id = a.getString("id");
            kt = new long[k[0].length];
            for (int i = 0; i < kt.length; i++) kt[i] = (long) k[0][i];
            kp = k[1];
        }
    }

    /**
     * A position box's target and stop against the same bars (src/renderer/src/lib/alarmCore.ts catchUpBox): the
     * earlier hit decides (the stop on a tie); the other side leaves the armed list quietly, and the app switches it off.
     */
    private static void checkBox(Context c, AlarmStore store, JSONObject a, JSONObject p, Set<String> done) throws Exception {
        done.add(a.getString("id"));
        if (p != null) done.add(p.getString("id"));
        List<Side> sides = new ArrayList<>();
        for (JSONObject x : p == null ? new JSONObject[] {a} : new JSONObject[] {a, p}) {
            double[][] k = store.knotsOf(x.getString("id"));
            // No readable table, or checked past its end: nothing left to check against (as in checkLine).
            if (k == null || startOf(x) > (long) k[0][k[0].length - 1]) store.drop(x.getString("id"));
            else sides.add(new Side(x, k));
        }
        if (sides.isEmpty()) return;
        long from = Long.MAX_VALUE;
        for (Side s : sides) from = Math.min(from, startOf(s.a));
        List<AlarmCheck.Bar> bars = AlarmFetch.bars(c, a.getString("source"), a.getString("providerSymbol"), from);
        long target = -1, stop = -1;
        for (Side s : sides) {
            s.scan = AlarmCheck.boxScan(s.a.getString("op"), startOf(s.a), bars, s.kt, s.kp, s.a.getDouble("entry"), s.a.optBoolean("wait"), s.a.optBoolean("near"),
                    s.a.optLong("entryAt", -1));
            if ("target".equals(s.a.optString("part"))) target = s.scan[0];
            else stop = s.scan[0];
        }
        int won = AlarmCheck.pairWinner(target, stop);
        // Either side may have seen the entry (they can be armed at different times).
        long seen = -1;
        for (Side s : sides) if (s.scan[1] >= 0) seen = seen < 0 ? s.scan[1] : Math.min(seen, s.scan[1]);
        if (won > 0) {
            String part = won == 1 ? "target" : "stop";
            for (Side s : sides) {
                if (!part.equals(s.a.optString("part"))) continue;
                double price = AlarmCheck.linePrice(s.kt, s.kp, s.scan[0]);
                if (!store.record(s.id, s.scan[0], true, price, seen)) return;
                // shortcut: no "same candle" note in the background check; add a third text if users ask for it.
                String body = seen < 0 && s.a.has("bodyNoEntry") ? s.a.getString("bodyNoEntry") : s.a.getString("body");
                Notifier.show(c, Notifier.idOf(s.id), s.a.optString("title", s.a.getString("symbol")),
                        body.replace("{price}", AlarmCheck.formatPrice(price, Locale.getDefault())));
            }
            for (Side s : sides) if (!part.equals(s.a.optString("part"))) store.drop(s.id);
            return;
        }
        if (bars.isEmpty()) return;
        long last = bars.get(bars.size() - 1).time;
        for (Side s : sides) {
            if (last > s.kt[s.kt.length - 1]) store.drop(s.id);
            else store.record(s.id, last, false, s.a.getDouble("price"), seen);
        }
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
