import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export enum LogLevel {
  INFO = 'INFO',
  ERROR = 'ERROR',
  WARN = 'WARN',
  DEBUG = 'DEBUG'
}

export class Logger {
  private static instance: Logger;
  private logFile: string;

  private constructor() {
    // Store logs in the app's user data directory
    const userDataPath = app.getPath('userData');
    const logsDir = path.join(userDataPath, 'logs');
    
    // Create logs directory if it doesn't exist
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    this.logFile = path.join(logsDir, 'app.log');
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private formatMessage(level: LogLevel, message: string): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level}] ${message}\n`;
  }

  private writeToFile(message: string): void {
    fs.appendFileSync(this.logFile, message);
  }

  private log(level: LogLevel, message: string, error?: Error): void {
    let logMessage = message;
    
    if (error) {
      logMessage += `\nError: ${error.message}`;
      if (error.stack) {
        logMessage += `\nStack: ${error.stack}`;
      }
    }

    const formattedMessage = this.formatMessage(level, logMessage);
    this.writeToFile(formattedMessage);

    // Also output to console for development
    if (process.env.NODE_ENV === 'development') {
      switch (level) {
        case LogLevel.ERROR:
          console.error(formattedMessage);
          break;
        case LogLevel.WARN:
          console.warn(formattedMessage);
          break;
        default:
          console.log(formattedMessage);
      }
    }
  }

  public info(message: string): void {
    this.log(LogLevel.INFO, message);
  }

  public error(message: string, error?: Error): void {
    this.log(LogLevel.ERROR, message, error);
  }

  public warn(message: string): void {
    this.log(LogLevel.WARN, message);
  }

  public debug(message: string): void {
    if (process.env.NODE_ENV === 'development') {
      this.log(LogLevel.DEBUG, message);
    }
  }

  public getLogPath(): string {
    return this.logFile;
  }
}
