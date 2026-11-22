/**
 * Structured logging and CloudWatch metrics.
 *
 * Every log line is one JSON object on stdout, which CloudWatch Logs collects
 * from the Fargate task. Metrics use the Embedded Metric Format (EMF): a log
 * line containing an `_aws` block is extracted by CloudWatch into numeric
 * metrics, so publishing a metric costs no extra infrastructure or API calls.
 */

type LogFields = Record<string, unknown>;

function errorText(error: unknown): LogFields {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack?.split("\n").slice(0, 5).join(" | "),
    };
  }
  return { message: String(error) };
}

function write(level: "info" | "warn" | "error", message: string, fields: LogFields): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, msg: message, ...fields }));
}

export function logInfo(message: string, fields: LogFields = {}): void {
  write("info", message, fields);
}

export function logWarn(message: string, error?: unknown, fields: LogFields = {}): void {
  write("warn", message, {
    ...fields,
    ...(error !== undefined ? { error: errorText(error) } : {}),
  });
}

export function logError(message: string, error?: unknown, fields: LogFields = {}): void {
  write("error", message, {
    ...fields,
    ...(error !== undefined ? { error: errorText(error) } : {}),
  });
}

/**
 * Publish numeric metrics as one EMF log line.
 *
 * `metrics` maps metric name to [value, unit]; use "Count" or "Milliseconds".
 * `dimensions` become CloudWatch dimensions and plain attributes on the line.
 */
export function emitMetrics(
  metrics: Record<string, [number, string]>,
  dimensions: Record<string, string> = {},
  namespace = "Shetu",
): void {
  const names = Object.keys(metrics);
  if (names.length === 0) return;
  const line: Record<string, unknown> = { ...dimensions };
  for (const [name, [value]] of Object.entries(metrics)) line[name] = value;
  line._aws = {
    Timestamp: Date.now(),
    CloudWatchMetrics: [
      {
        Namespace: namespace,
        Dimensions: [Object.keys(dimensions)],
        Metrics: names.map((name) => ({ Name: name, Unit: metrics[name][1] })),
      },
    ],
  };
  console.log(JSON.stringify(line));
}
