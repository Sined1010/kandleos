package io.github.sined1010.kandleos;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.work.Constraints;
import androidx.work.Data;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;

/**
 * "Analysis done?" (Android Abschnitt 3): only while an analysis this phone started runs on the PC. Asks the PC
 * after 15, 30 and then every 60 minutes, at most 3 hours, and notifies once it has ended. Same sealed request as
 * src/mobile/linkClient.ts, op agents.job.
 */
public class AnalysisWorker extends Worker {
    private static final String NAME = "kandleos-analysis";
    private static final long[] DELAY_MIN = {15, 30, 60};
    private static final long MAX_MS = 3 * 60 * 60 * 1000L;
    // Above the alarm notification ids (7 hex digits, Notifier.idOf): one notification per analysis.
    private static final int NOTIFICATION_ID = 0x10000001;
    private static final int TIMEOUT_MS = 4000;

    public AnalysisWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    /** Starts the checks for a run the PC began at `started` (PC clock); replaces any earlier one. */
    static void watch(Context c, String symbol, long started) {
        Data d = new Data.Builder()
                .putString("symbol", symbol)
                .putLong("started", started)
                .putInt("attempt", 0)
                .putLong("until", System.currentTimeMillis() + MAX_MS)
                .build();
        WorkManager.getInstance(c).enqueueUniqueWork(NAME, ExistingWorkPolicy.REPLACE, request(d, DELAY_MIN[0] * 60_000));
    }

    static void cancel(Context c) {
        WorkManager.getInstance(c).cancelUniqueWork(NAME);
    }

    private static OneTimeWorkRequest request(Data d, long delayMs) {
        return new OneTimeWorkRequest.Builder(AnalysisWorker.class)
                .setInitialDelay(delayMs, TimeUnit.MILLISECONDS)
                .setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setInputData(d)
                .build();
    }

    @NonNull
    @Override
    public Result doWork() {
        Context c = getApplicationContext();
        Data d = getInputData();
        String symbol = d.getString("symbol");
        long started = d.getLong("started", 0);
        JSONObject job = ask(c, started);
        JSONObject last = job == null ? null : job.optJSONObject("last");
        if (last != null && last.optLong("started") == started) {
            report(c, symbol, last);
            return Result.success();
        }
        // Not done, or the PC was not reachable: ask again later; the last check falls on the 3 hours themselves.
        int attempt = d.getInt("attempt", 0) + 1;
        long delayMs = Math.min(DELAY_MIN[Math.min(attempt, DELAY_MIN.length - 1)] * 60_000, d.getLong("until", 0) - System.currentTimeMillis());
        if (delayMs > 0) {
            Data next = new Data.Builder().putAll(d).putInt("attempt", attempt).build();
            // Appended: replacing would cancel this very run while it is still finishing.
            WorkManager.getInstance(c).enqueueUniqueWork(NAME, ExistingWorkPolicy.APPEND_OR_REPLACE, request(next, delayMs));
        }
        return Result.success();
    }

    private static void report(Context c, String symbol, JSONObject last) {
        String error = last.optString("error", "");
        if (!error.isEmpty()) {
            // Only the first line, short: the full text (Python output, paths) is for the app, not the lock screen.
            String line = error.split("\\r?\\n", 2)[0];
            Notifier.show(c, NOTIFICATION_ID, c.getString(R.string.analysis_failed, symbol),
                    line.length() > 120 ? line.substring(0, 120) + " …" : line, Notifier.ANALYSES);
            return;
        }
        Notifier.show(c, NOTIFICATION_ID, c.getString(R.string.analysis_done, symbol, rating(c, last.optString("rating"))),
                c.getString(R.string.analysis_body), Notifier.ANALYSES);
    }

    private static String rating(Context c, String r) {
        switch (r) {
            case "Buy": return c.getString(R.string.rating_buy);
            case "Overweight": return c.getString(R.string.rating_overweight);
            case "Hold": return c.getString(R.string.rating_hold);
            case "Underweight": return c.getString(R.string.rating_underweight);
            case "Sell": return c.getString(R.string.rating_sell);
            default: return r;
        }
    }

    /** The PC's answer to agents.job for the run begun at `started`, or null (not paired, PC off, not ours). */
    private static JSONObject ask(Context c, long started) {
        try {
            SecureStore store = new SecureStore(c);
            String raw = store.get("link");
            if (raw == null) return null;
            JSONObject p = new JSONObject(raw);
            String device = p.getString("deviceId");
            byte[] key = LinkCrypto.fromB64url(p.getString("key"));
            // Strictly growing and saved before sending, shared with the app (linkClient.ts nextCtr).
            long ctr = Math.max(System.currentTimeMillis(), p.optLong("lastCtr", 0) + 1);
            p.put("lastCtr", ctr);
            store.set("link", p.toString());
            String[] nc = LinkCrypto.seal(key, device, new JSONObject().put("ctr", ctr).put("op", "agents.job").put("args", started).toString(), "req");
            String env = new JSONObject().put("d", device).put("n", nc[0]).put("c", nc[1]).toString();
            JSONArray addrs = p.getJSONArray("addrs");
            int port = p.getInt("port");
            for (int i = 0; i < addrs.length(); i++) {
                String addr = addrs.getString(i);
                String reply = post("http://" + (addr.contains(":") ? "[" + addr + "]" : addr) + ":" + port + "/k", env);
                if (reply == null) continue;
                JSONObject r = new JSONObject(reply);
                String body = LinkCrypto.open(key, device, r.optString("n"), r.optString("c"), "res");
                if (body == null) continue;
                JSONObject b = new JSONObject(body);
                // Only the answer to this very message counts.
                if (b.optLong("ctr") != ctr) continue;
                return b.optJSONObject("res");
            }
        } catch (Exception e) {
            // Unreadable pairing or reply: the next check tries again.
        }
        return null;
    }

    private static String post(String url, String body) {
        HttpURLConnection con = null;
        try {
            con = (HttpURLConnection) new URL(url).openConnection();
            con.setConnectTimeout(TIMEOUT_MS);
            con.setReadTimeout(TIMEOUT_MS);
            con.setRequestMethod("POST");
            con.setDoOutput(true);
            con.setRequestProperty("Content-Type", "application/json");
            try (OutputStream out = con.getOutputStream()) {
                out.write(body.getBytes(StandardCharsets.UTF_8));
            }
            if (con.getResponseCode() != 200) return null;
            try (InputStream in = con.getInputStream()) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
                return out.toString("UTF-8");
            }
        } catch (Exception e) {
            return null;
        } finally {
            if (con != null) con.disconnect();
        }
    }
}
