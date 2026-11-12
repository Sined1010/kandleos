package io.github.sined1010.kandleos;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** 5-minute bars for the background alarm check, from the source the app chose (src/mobile/alarmPlan.ts). */
public final class AlarmFetch {
    private AlarmFetch() {}

    static List<AlarmCheck.Bar> bars(Context c, String source, String symbol, long fromSec) throws Exception {
        String sym = URLEncoder.encode(symbol, "UTF-8");
        // Yahoo: only the bars since the last check (at most 5 days), not 5 days every 15 s.
        long now = System.currentTimeMillis() / 1000;
        switch (source) {
            case "binance": {
                JSONArray a = new JSONArray(get("https://api.binance.com/api/v3/klines?symbol=" + sym
                        + "&interval=5m&limit=1000&startTime=" + (fromSec * 1000), headers()));
                List<AlarmCheck.Bar> out = new ArrayList<>();
                for (int i = 0; i < a.length(); i++) {
                    JSONArray k = a.getJSONArray(i);
                    out.add(new AlarmCheck.Bar(k.getLong(0) / 1000, k.getDouble(2), k.getDouble(3)));
                }
                return out;
            }
            case "yahoo": {
                // Yahoo rejects requests without a browser-like user agent (as in src/data/stocks.ts). Regular session
                // only, like the app's catch-up and its live check against the regular price.
                JSONObject r = new JSONObject(get("https://query1.finance.yahoo.com/v8/finance/chart/" + sym
                        + "?interval=5m&period1=" + Math.max(fromSec, now - 5 * 86400) + "&period2=" + now, headers("User-Agent", "Mozilla/5.0")))
                        .getJSONObject("chart").getJSONArray("result").getJSONObject(0);
                JSONArray ts = r.optJSONArray("timestamp");
                JSONObject q = r.getJSONObject("indicators").getJSONArray("quote").getJSONObject(0);
                JSONArray hi = q.getJSONArray("high"), lo = q.getJSONArray("low");
                List<AlarmCheck.Bar> out = new ArrayList<>();
                for (int i = 0; ts != null && i < ts.length(); i++) {
                    if (hi.isNull(i) || lo.isNull(i)) continue;
                    out.add(new AlarmCheck.Bar(ts.getLong(i), hi.getDouble(i), lo.getDouble(i)));
                }
                return out;
            }
            case "alpaca": {
                String keys = new SecureStore(c).get("alpaca");
                if (keys == null) return new ArrayList<>();
                JSONObject k = new JSONObject(keys);
                JSONObject r = new JSONObject(get("https://data.alpaca.markets/v2/stocks/" + sym
                        + "/bars?timeframe=5Min&limit=1000&feed=iex&start=" + Instant.ofEpochSecond(fromSec),
                        headers("APCA-API-KEY-ID", k.getString("id"), "APCA-API-SECRET-KEY", k.getString("secret"))));
                JSONArray b = r.optJSONArray("bars");
                List<AlarmCheck.Bar> out = new ArrayList<>();
                for (int i = 0; b != null && i < b.length(); i++) {
                    JSONObject x = b.getJSONObject(i);
                    long t = Instant.parse(x.getString("t")).getEpochSecond();
                    if (regularUs(t)) out.add(new AlarmCheck.Bar(t, x.getDouble("h"), x.getDouble("l")));
                }
                return out;
            }
            default:
                return new ArrayList<>();
        }
    }

    /**
     * A 5-minute bar of the regular US session (9:30-16:00 New York, Monday to Friday), as the app keeps them.
     * shortcut: half days count until 16:00 (the app stops at the early close); fine unless alarms on those few
     * afternoons matter.
     */
    static boolean regularUs(long sec) {
        ZonedDateTime d = Instant.ofEpochSecond(sec).atZone(ZoneId.of("America/New_York"));
        int min = d.getHour() * 60 + d.getMinute();
        DayOfWeek w = d.getDayOfWeek();
        return w != DayOfWeek.SATURDAY && w != DayOfWeek.SUNDAY && min >= 570 && min < 960;
    }

    /** Map.of needs Android 11; this works from the app's minimum (Android 8). */
    private static Map<String, String> headers(String... kv) {
        Map<String, String> m = new HashMap<>();
        for (int i = 0; i + 1 < kv.length; i += 2) m.put(kv[i], kv[i + 1]);
        return m;
    }

    private static String get(String url, Map<String, String> headers) throws Exception {
        HttpURLConnection con = (HttpURLConnection) new URL(url).openConnection();
        con.setConnectTimeout(15000);
        con.setReadTimeout(15000);
        for (Map.Entry<String, String> h : headers.entrySet()) con.setRequestProperty(h.getKey(), h.getValue());
        try {
            int code = con.getResponseCode();
            if (code != 200) throw new Exception("HTTP " + code);
            try (InputStream in = con.getInputStream()) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
                return out.toString("UTF-8");
            }
        } finally {
            con.disconnect();
        }
    }
}
