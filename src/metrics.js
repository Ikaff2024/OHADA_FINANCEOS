// Minimal zero-dependency Prometheus metrics (text exposition format 0.0.4).
// Labels are intentionally low-cardinality (method, status class) to avoid
// unbounded series growth.

const startedAt = Date.now();
const requestsTotal = new Map(); // key: `${method}|${statusClass}` -> count
const durationBuckets = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const durationBucketCounts = new Array(durationBuckets.length + 1).fill(0);
let durationSum = 0;
let durationCount = 0;

function statusClass(status) {
  if (status >= 500) return "5xx";
  if (status >= 400) return "4xx";
  if (status >= 300) return "3xx";
  if (status >= 200) return "2xx";
  return "1xx";
}

export function recordRequest(method, status, durationMs) {
  const key = `${String(method || "UNKNOWN").toUpperCase()}|${statusClass(status)}`;
  requestsTotal.set(key, (requestsTotal.get(key) || 0) + 1);

  const seconds = durationMs / 1000;
  durationSum += seconds;
  durationCount += 1;
  for (let i = 0; i < durationBuckets.length; i += 1) {
    if (seconds <= durationBuckets[i]) {
      durationBucketCounts[i] += 1;
      return;
    }
  }
  durationBucketCounts[durationBuckets.length] += 1;
}

export function renderMetrics() {
  const memory = process.memoryUsage();
  const lines = [];

  lines.push("# HELP process_uptime_seconds Process uptime in seconds.");
  lines.push("# TYPE process_uptime_seconds gauge");
  lines.push(`process_uptime_seconds ${((Date.now() - startedAt) / 1000).toFixed(3)}`);

  lines.push("# HELP nodejs_heap_used_bytes Heap memory used in bytes.");
  lines.push("# TYPE nodejs_heap_used_bytes gauge");
  lines.push(`nodejs_heap_used_bytes ${memory.heapUsed}`);

  lines.push("# HELP nodejs_rss_bytes Resident set size in bytes.");
  lines.push("# TYPE nodejs_rss_bytes gauge");
  lines.push(`nodejs_rss_bytes ${memory.rss}`);

  lines.push("# HELP http_requests_total Total HTTP requests by method and status class.");
  lines.push("# TYPE http_requests_total counter");
  for (const [key, count] of requestsTotal.entries()) {
    const [method, status] = key.split("|");
    lines.push(`http_requests_total{method="${method}",status="${status}"} ${count}`);
  }

  lines.push("# HELP http_request_duration_seconds HTTP request latency in seconds.");
  lines.push("# TYPE http_request_duration_seconds histogram");
  let cumulative = 0;
  for (let i = 0; i < durationBuckets.length; i += 1) {
    cumulative += durationBucketCounts[i];
    lines.push(`http_request_duration_seconds_bucket{le="${durationBuckets[i]}"} ${cumulative}`);
  }
  cumulative += durationBucketCounts[durationBuckets.length];
  lines.push(`http_request_duration_seconds_bucket{le="+Inf"} ${cumulative}`);
  lines.push(`http_request_duration_seconds_sum ${durationSum.toFixed(6)}`);
  lines.push(`http_request_duration_seconds_count ${durationCount}`);

  return `${lines.join("\n")}\n`;
}
