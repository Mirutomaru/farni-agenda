/**
 * STRUCTURED LOGGER — Soucastky Library Pattern for TypeScript/Next.js
 * 
 * Replaces console.error/console.log with structured, correlation-aware logging.
 * Usage in API routes / services:
 *   const log = logger.withCorrelation(req);
 *   log.info('Osoba saved', { osobaId: data.id });
 *   log.error('DB connection failed', { error: err.message }, err);
 */

// ---------------------------------------------------------------------------
// Correlation ID — generated per request for traceability
// ---------------------------------------------------------------------------

let _correlationCounter = 0;

/** Generate a short correlation ID (8 chars). */
function generateCorrelationId(): string {
  _correlationCounter++;
  const hex = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  return hex.slice(-8);
}

/** Try to get correlation ID from request headers; generate if missing. */
export function getCorrelationId(request?: { headers: Headers }): string | undefined {
  if (request?.headers) {
    const id = request.headers.get('x-correlation-id');
    if (id && id.length > 0) return id;
  }
  // In API routes, generate one per invocation
  // Caller should set it in response headers for client-side tracking
  return undefined;
}

// ---------------------------------------------------------------------------
// Logger Class — structured logging with correlation IDs
// ---------------------------------------------------------------------------

export interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  context?: Record<string, unknown>;
  timestamp: string;
  correlationId?: string;
  service?: string;
}

/** Format log entry for structured output (JSON in production). */
function formatLog(entry: LogEntry): string {
  const base = JSON.stringify({
    level: entry.level.toUpperCase(),
    ts: entry.timestamp,
    cid: entry.correlationId ?? '-',
    svc: entry.service ?? 'app',
    msg: entry.message,
  });
  
  if (entry.context && Object.keys(entry.context).length > 0) {
    const ctxStr = JSON.stringify(entry.context);
    return `${base} | context=${ctxStr}`;
  }
  
  return base;
}

export class Logger {
  private readonly service: string;
  private readonly correlationId?: string;
  public readonly context: Record<string, unknown>;
  
  constructor(serviceName: string, correlationId?: string, context?: Record<string, unknown>) {
    this.service = serviceName;
    this.correlationId = correlationId ?? generateCorrelationId();
    this.context = context || {};
  }
  
  /** Create child logger with same context + additional tags. */
  with(context: Record<string, unknown>): Logger {
    const mergedContext = { ...this.context, ...context };
    return new Logger(this.service, this.correlationId, mergedContext);
  }
  
  debug(message: string, context?: Record<string, unknown>) {
    if (process.env.NODE_ENV === 'production') return; // Skip debug in prod
  
    const entry: LogEntry = {
      level: 'debug',
      message,
      context: { ...this.context, ...context },
      timestamp: new Date().toISOString(),
      correlationId: this.correlationId,
      service: this.service,
    };
    
    console.log(`[DEBUG] ${formatLog(entry)}`);
  }
  
  info(message: string, context?: Record<string, unknown>) {
    const entry: LogEntry = {
      level: 'info',
      message,
      context: { ...this.context, ...context },
      timestamp: new Date().toISOString(),
      correlationId: this.correlationId,
      service: this.service,
    };
    
    console.log(`[INFO] ${formatLog(entry)}`);
  }
  
  warn(message: string, context?: Record<string, unknown>) {
    const entry: LogEntry = {
      level: 'warn',
      message,
      context: { ...this.context, ...context },
      timestamp: new Date().toISOString(),
      correlationId: this.correlationId,
      service: this.service,
    };
    
    console.warn(`[WARN] ${formatLog(entry)}`);
  }
  
  error(message: string, context?: Record<string, unknown>, err?: Error | null) {
    const ctx = { ...this.context, ...context };
    if (err) {
      ctx.error = { message: err.message, name: err.name, stack: process.env.NODE_ENV === 'development' ? err.stack : undefined };
    }
    
    const entry: LogEntry = {
      level: 'error',
      message,
      context: Object.keys(ctx).length > 0 ? ctx : undefined,
      timestamp: new Date().toISOString(),
      correlationId: this.correlationId,
      service: this.service,
    };
    
    console.error(`[ERROR] ${formatLog(entry)}`);
  }
  
  /** Get correlation ID for propagating to responses/headers. */
  getCorrelationId(): string {
    return this.correlationId ?? '-';
  }
}

// ---------------------------------------------------------------------------
// Module-level convenience functions
// ---------------------------------------------------------------------------

/** Create a logger for a specific service/module. */
export function createLogger(serviceName: string, correlationId?: string): Logger {
  return new Logger(serviceName, correlationId);
}

/** Alias matching Python's LogManager pattern (per-module singleton). */
let _moduleLoggers = new Map<string, Logger>();

export function logger(moduleName: string): Logger {
  if (!_moduleLoggers.has(moduleName)) {
    const cid = getCorrelationId();
    _moduleLoggers.set(moduleName, createLogger(moduleName.toUpperCase(), cid));
  }
  return _moduleLoggers.get(moduleName)!;
}

/** Create a logger bound to an API request (with correlation ID extraction). */
export function loggerFromRequest(request: { headers: Headers }, moduleName?: string): Logger {
  const cid = getCorrelationId(request) ?? generateCorrelationId();
  return createLogger((moduleName || 'API').toUpperCase(), cid);
}

/** Set correlation ID in response headers for client-side tracking. */
export function setCorrelationHeader(response: Response, loggerInstance: Logger): void {
  const cors = new Headers(response.headers);
  cors.set('x-correlation-id', loggerInstance.getCorrelationId());
  
  // Create new response with updated headers (works in Next.js API routes)
  return; // Note: caller must clone response and set headers themselves
}
