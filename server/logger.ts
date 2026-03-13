/**
 * Structured Logger
 * 
 * Provides consistent logging across the application with different log levels
 * and structured output for easier debugging and monitoring.
 */

export enum LogLevel {
  DEBUG = "DEBUG",
  INFO = "INFO",
  WARN = "WARN",
  ERROR = "ERROR",
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

class Logger {
  private minLevel: LogLevel;

  constructor(minLevel: LogLevel = LogLevel.INFO) {
    this.minLevel = minLevel;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    return levels.indexOf(level) >= levels.indexOf(this.minLevel);
  }

  private formatEntry(entry: LogEntry): string {
    const { timestamp, level, message, context, error } = entry;

    let output = `[${timestamp}] ${level}: ${message}`;

    if (context && Object.keys(context).length > 0) {
      output += ` | ${JSON.stringify(context)}`;
    }

    if (error) {
      output += ` | Error: ${error.name}: ${error.message}`;
      if (process.env.NODE_ENV === "development" && error.stack) {
        output += `\n${error.stack}`;
      }
    }

    return output;
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>, error?: Error): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
    };

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    const formatted = this.formatEntry(entry);

    // Use appropriate console method
    switch (level) {
      case LogLevel.DEBUG:
        console.debug(formatted);
        break;
      case LogLevel.INFO:
        console.info(formatted);
        break;
      case LogLevel.WARN:
        console.warn(formatted);
        break;
      case LogLevel.ERROR:
        console.error(formatted);
        break;
    }
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, context);
  }

  error(message: string, error?: Error, context?: Record<string, unknown>): void {
    this.log(LogLevel.ERROR, message, context, error);
  }

  /**
   * Log API request
   */
  logRequest(method: string, path: string, context?: Record<string, unknown>): void {
    this.info(`${method} ${path}`, context);
  }

  /**
   * Log API response
   */
  logResponse(method: string, path: string, statusCode: number, duration: number, context?: Record<string, unknown>): void {
    this.info(`${method} ${path} ${statusCode}`, {
      duration_ms: duration,
      ...context,
    });
  }

  /**
   * Log prediction request
   */
  logPrediction(filename: string, fileSize: number, format: string, context?: Record<string, unknown>): void {
    this.info("Prediction request", {
      filename,
      file_size_bytes: fileSize,
      format,
      ...context,
    });
  }

  /**
   * Log prediction result
   */
  logPredictionResult(label: string, prob: number, duration: number, context?: Record<string, unknown>): void {
    this.info("Prediction result", {
      label,
      probability: prob,
      duration_ms: duration,
      ...context,
    });
  }
}

// Export singleton instance
export const logger = new Logger(
  process.env.NODE_ENV === "development" ? LogLevel.DEBUG : LogLevel.INFO
);

export default logger;
