type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
  correlationId?: string;
  userId?: string;
  requestId?: string;
}

class Logger {
  private context: LogContext = {};

  setContext(ctx: LogContext) {
    this.context = { ...this.context, ...ctx };
  }

  private log(level: LogLevel, message: string, meta?: LogContext) {
    const timestamp = new Date().toISOString();
    const logData = {
      timestamp,
      level,
      message,
      ...this.context,
      ...meta,
    };

    const output = JSON.stringify(logData);
    
    if (level === 'error') console.error(output);
    else if (level === 'warn') console.warn(output);
    else console.log(output);
  }

  debug(message: string, meta?: LogContext) {
    this.log('debug', message, meta);
  }

  info(message: string, meta?: LogContext) {
    this.log('info', message, meta);
  }

  warn(message: string, meta?: LogContext) {
    this.log('warn', message, meta);
  }

  error(message: string, error?: Error | unknown, meta?: LogContext) {
    this.log('error', message, {
      ...meta,
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : error,
    });
  }
}

export const logger = new Logger();
