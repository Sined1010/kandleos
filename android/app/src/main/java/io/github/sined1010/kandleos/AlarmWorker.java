package io.github.sined1010.kandleos;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import java.util.concurrent.TimeUnit;

/** The 15-minute background check (Android's shortest period; longer when the phone dozes). */
public class AlarmWorker extends Worker {
    private static final String NAME = "kandleos-alarms";

    public AlarmWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        if (AlarmStore.checkAll(getApplicationContext()) == 0) cancel(getApplicationContext());
        return Result.success();
    }

    /** Runs only while armed alarms exist; KEEP leaves a running schedule alone. */
    static void schedule(Context c) {
        PeriodicWorkRequest req = new PeriodicWorkRequest.Builder(AlarmWorker.class, 15, TimeUnit.MINUTES)
                .setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build();
        WorkManager.getInstance(c).enqueueUniquePeriodicWork(NAME, ExistingPeriodicWorkPolicy.KEEP, req);
    }

    static void cancel(Context c) {
        WorkManager.getInstance(c).cancelUniqueWork(NAME);
    }
}
