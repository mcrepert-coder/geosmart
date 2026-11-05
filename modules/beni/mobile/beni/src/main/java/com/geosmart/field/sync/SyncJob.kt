package com.geosmart.field.sync

import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context
import com.geosmart.field.account.ApiError
import java.util.concurrent.Executors

class SyncJob: JobService() {
 private val executor = Executors.newSingleThreadExecutor()
 override fun onStartJob(params: JobParameters): Boolean {
  executor.execute {
   val retry = runCatching { OfflineQueue(this).use { q -> q.sync(); q.hasPending() } }.getOrElse { e -> !(e is ApiError && e.status in listOf(401, 403)) }
   jobFinished(params, retry)
  }
  return true
 }
 override fun onStopJob(params: JobParameters) = true
 override fun onDestroy() { executor.shutdownNow(); super.onDestroy() }
 companion object {
  fun schedule(context: Context) {
   val scheduler = context.getSystemService(JobScheduler::class.java)
   scheduler.schedule(JobInfo.Builder(4001, ComponentName(context, SyncJob::class.java)).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPersisted(true).setBackoffCriteria(30000, JobInfo.BACKOFF_POLICY_EXPONENTIAL).build())
  }
 }
}
