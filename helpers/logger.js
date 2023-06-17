const fs = require('fs');
const path = require('path')
const os = require('os')

function getModuleName() {
    const callingFile = module.parent.filename;
    return path.basename(callingFile);
}

function convertToString(input) {
    if (typeof input === 'string') return input;
    if (typeof input === 'object') return JSON.stringify(input);

    return String(input);
}

function parseMessage(messageParts) {
    return messageParts.map(convertToString).join(' ');
}


module.exports = class Logger {

    constructor(logLevel = 1, logsPath = './.logs', logName = null) {
        this.logLevel = process.env.LOG_LEVEL || logLevel;

        logsPath = process.env.LOGS_PATH || logsPath;
        this.configLogPath(logName, logsPath)
    }

    configLogPath(log, dir = './.logs') {
        if (log && fs.existsSync(path.join(dir, log))) {
            this.logFilePath = path.join(dir, log);
        } else if (fs.existsSync(dir)) {
            const log = fs.readdirSync(dir).find(log => log.includes(process.pid));
            this.logFilePath = log && path.join(dir, log)
        }

        if (!this.logFilePath) {
            const timestamp = new Date();
            log = log || `log_${timestamp.toISOString().replace(/[:.]/g, '')}_${process.pid}`;
            this.logFilePath = path.join(dir, log);

            // Create logs directory if it doesn't exist
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

            // Create log file
            const initialLog = `Log file created at: ${timestamp.toString().substring(0, 24).replace(/ |:/g, '_')}`;
            fs.writeFileSync(this.logFilePath, initialLog + os.EOL);
        }
    }

    logToFile(logMessage) {
        try {
            fs.appendFileSync(this.logFilePath, logMessage + os.EOL);            
        } catch (error) {
            console.error(`Error writing log to file: ${error}`);
        }
    }

    info(...message) {
        if (this.logLevel >= 1) {
            console.log(...message);
        }

        const moduleName = getModuleName();
        const parsedMessage = parseMessage(message);
        const logMessage = `[INFO] ${moduleName}: ${parsedMessage}`;

        this.logToFile(logMessage);
    }

    warn(...message) {
        if (this.logLevel >= 2) {
            console.warn(...message);
        }

        const moduleName = getModuleName();
        const parsedMessage = parseMessage(message);
        const logMessage = `[WARN] ${moduleName}: ${parsedMessage}`;

        this.logToFile(logMessage);
    }

    error(error) {
        let message;

        if (error instanceof Error) {
            message = error.message;
        } else {
            message = `Unknown error occurred: ${error}`;
        }

        if (this.logLevel >= 3) {
            console.error(message);
        }

        const moduleName = getModuleName();
        const logMessage = `[ERROR] ${moduleName}: ${message}`;

        this.logToFile(logMessage);
    }

    debug(...message) {
        if (this.logLevel >= 4) {
            console.log(...message);
        }

        const moduleName = getModuleName();
        const parsedMessage = parseMessage(message);
        const logMessage = `[DEBUG] ${moduleName}: ${parsedMessage}`;

        this.logToFile(logMessage);
    }
}
