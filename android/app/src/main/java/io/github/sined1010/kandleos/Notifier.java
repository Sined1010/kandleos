package io.github.sined1010.kandleos;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

/** Notifications for price alarms (and later finished analyses); a tap opens the app. */
public final class Notifier {
    public static final String ALARMS = "alarms";

    static void channels(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel(ALARMS, c.getString(R.string.channel_alarms), NotificationManager.IMPORTANCE_HIGH));
    }

    static PendingIntent openApp(Context c) {
        Intent i = new Intent(c, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(c, 0, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    /** Same number as src/mobile/alarmWatch.ts notificationId: one notification per alarm, wherever it fired. */
    public static int idOf(String alarmId) {
        return Integer.parseInt(alarmId.replace("-", "").substring(0, 7), 16);
    }

    /** Shows one notification; `id` keeps the same alarm from stacking up. Silently skipped without permission. */
    public static void show(Context c, int id, String title, String body) {
        channels(c);
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, ALARMS)
                .setSmallIcon(R.drawable.ic_stat_alarm)
                .setContentTitle(title)
                .setContentText(body)
                .setAutoCancel(true)
                .setOnlyAlertOnce(true)
                .setContentIntent(openApp(c))
                .setPriority(NotificationCompat.PRIORITY_HIGH);
        try {
            NotificationManagerCompat.from(c).notify(id, b.build());
        } catch (SecurityException e) {
            // no notification permission: the alarm still shows as reached in the app
        }
    }
}
