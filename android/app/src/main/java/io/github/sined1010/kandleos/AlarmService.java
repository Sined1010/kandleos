package io.github.sined1010.kandleos;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * "Instant alarms": checks every 15 s while armed alarms exist, shown by a permanent notification
 * ("KandleOS is watching n prices"). Ends itself when no alarm is left.
 */
public class AlarmService extends Service {
    private static final String CHANNEL = "watching";
    private static final int ID = 1;
    private ScheduledExecutorService loop;
    /** The newest start; the loop stops the service only if no later one came in. */
    private volatile int lastStart;

    /** Android 12+ refuses a start from the background; WorkManager keeps checking then. */
    static void start(Context c) {
        try {
            ContextCompat.startForegroundService(c, new Intent(c, AlarmService.class));
        } catch (RuntimeException e) {
            // ForegroundServiceStartNotAllowedException (API 31+): fall back to the 15-minute worker
        }
    }

    /** Set while the service exists; the plugin then sends it the new alarm list instead of stopping it. */
    static volatile boolean running;

    @Override
    public void onCreate() {
        super.onCreate();
        running = true;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        int n = new AlarmStore(this).armed().length();
        Notification note = watching(n);
        try {
            if (Build.VERSION.SDK_INT >= 34) startForeground(ID, note, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            else startForeground(ID, note);
        } catch (RuntimeException e) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (n == 0 || !new AlarmStore(this).instant()) {
            stopSelf();
            return START_NOT_STICKY;
        }
        lastStart = startId;
        if (loop == null) {
            loop = Executors.newSingleThreadScheduledExecutor();
            loop.scheduleWithFixedDelay(() -> {
                int left = AlarmStore.checkAll(this);
                // Only if no newer start came in meanwhile (the app armed alarms again).
                if (left == 0 || !new AlarmStore(this).instant()) stopSelfResult(lastStart);
                else getSystemService(NotificationManager.class).notify(ID, watching(left));
            }, 0, 15, TimeUnit.SECONDS);
        }
        // Not sticky: a restart after the process was killed would come from the background and be refused.
        return START_NOT_STICKY;
    }

    private Notification watching(int n) {
        if (Build.VERSION.SDK_INT >= 26) {
            getSystemService(NotificationManager.class).createNotificationChannel(
                    new NotificationChannel(CHANNEL, getString(R.string.channel_watching), NotificationManager.IMPORTANCE_LOW));
        }
        return new NotificationCompat.Builder(this, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_alarm)
                .setContentTitle(getResources().getQuantityString(R.plurals.watching_title, n, n))
                .setOngoing(true)
                .setContentIntent(Notifier.openApp(this))
                .build();
    }

    @Override
    public void onDestroy() {
        running = false;
        if (loop != null) loop.shutdownNow();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
