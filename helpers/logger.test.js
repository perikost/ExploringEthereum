const fs = require('fs');
const Logger = require('./logger');
const { spawn } = require('child_process');
const path = require('path');


describe('Logger', () => {
    const logsPath = './test_logs';
    const logFile = 'log'

    beforeAll(() => {
        jest.spyOn(console, 'log');
        jest.spyOn(console, 'warn');
        jest.spyOn(console, 'error');

        jest.spyOn(fs, 'appendFileSync')
        jest.spyOn(fs, 'existsSync')
        jest.spyOn(fs, 'writeFileSync')
        jest.spyOn(fs, 'mkdirSync')
        jest.spyOn(fs, 'readdirSync')
    });

    afterEach(() => {
        jest.clearAllMocks();
        if (fs.existsSync(logsPath)) fs.rmSync(logsPath, { recursive: true });
    });


    test('constructor should create log file with initial log entry', () => {
        // Create a new instance of Logger
        new Logger(1, logsPath, logFile);

        // Check if log file exists
        expect(fs.existsSync).toHaveBeenCalledWith(path.join(logsPath, logFile));
        expect(fs.existsSync).toHaveReturnedWith(false);

        // Check if the log file contains the initial log entry
        expect(fs.writeFileSync).toHaveBeenCalledWith(path.join(logsPath, logFile), expect.stringContaining('Log file created at:'));
    });

    test('logs an info message', () => {
        const logger = new Logger(1, logsPath, logFile);
        const logMessage = 'Test info message';

        logger.info(logMessage);

        expect(fs.appendFileSync).toHaveBeenCalledWith(path.join(logsPath, logFile), expect.stringContaining(logMessage));
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining(logMessage));
    });

    test('logs a warn message', () => {
        const logger = new Logger(2, logsPath, logFile);
        const logMessage = 'Test warn message';

        logger.warn(logMessage);

        expect(fs.appendFileSync).toHaveBeenCalledWith(path.join(logsPath, logFile), expect.stringContaining(logMessage));
        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining(logMessage));
    });

    test('logs an error message', () => {
        const logger = new Logger(3, logsPath, logFile);
        const logMessage = 'Test error message';

        logger.error(logMessage);

        expect(fs.appendFileSync).toHaveBeenCalledWith(path.join(logsPath, logFile), expect.stringContaining(logMessage));
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining(logMessage));
    });

    test('logs a debug message', () => {
        const logger = new Logger(4, logsPath, logFile);
        const logMessage = 'Test debug message';

        logger.debug(logMessage);

        expect(fs.appendFileSync).toHaveBeenCalledWith(path.join(logsPath, logFile), expect.stringContaining(logMessage));
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining(logMessage));
    });

    test('logs message with module name', () => {
        const logger = new Logger(1, logsPath, logFile);

        logger.info('test message');

        expect(fs.appendFileSync).toHaveBeenCalledWith(path.join(logsPath, logFile), expect.stringContaining('[INFO] logger.test.js: test message'));
    });

    test('should concatenate message with multiple parts', () => {

        const logger = new Logger(1, logsPath, logFile);
        const logMessageParts = ['test', null, undefined, 5, [1, 2, 3], { test: 1 }];

        logger.info(...logMessageParts);

        expect(fs.appendFileSync).toHaveBeenCalledWith(path.join(logsPath, logFile), expect.stringContaining('test null undefined 5 [1,2,3] {"test":1}'));
        expect(console.log).toHaveBeenCalledWith(...logMessageParts);
    })

    test('does not console log when logLevel is less than required, but persists to log file ', () => {
        const logger = new Logger(2, logsPath, logFile);
        const logMessage = 'Test error message';

        logger.error(logMessage);

        expect(fs.appendFileSync).toHaveBeenCalledWith(path.join(logsPath, logFile), expect.stringContaining(logMessage));
        expect(console.log).not.toHaveBeenCalled();
    });

    test('handles error when writing log to file', () => {
        const logger = new Logger(1, logsPath, logFile);
        const logMessage = 'Test info message';

        fs.appendFileSync.mockImplementationOnce((path, data) => { throw new Error('Write error') });

        logger.info(logMessage);

        expect(fs.appendFileSync).toHaveBeenCalledWith(path.join(logsPath, logFile), expect.stringContaining(logMessage));
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Error writing log to file'));
    });

    test('loggers of the same process should write to the same file', () => {
        jest.spyOn(fs, 'appendFileSync');

        const logger1 = new Logger(2, logsPath);
        const logger2 = new Logger(2, logsPath);

        logger1.info('test message 1');
        logger2.info('test message 2');

        expect(fs.readdirSync(logsPath).length).toBe(1)
        expect(logger1.logFilePath).toBe(logger2.logFilePath)
        expect(console.log).toHaveBeenNthCalledWith(1, 'test message 1');
        expect(console.log).toHaveBeenNthCalledWith(2, 'test message 2');
        expect(fs.appendFileSync).toHaveBeenNthCalledWith(1, logger1.logFilePath, expect.stringContaining('[INFO] logger.test.js: test message 1'));
        expect(fs.appendFileSync).toHaveBeenNthCalledWith(2, logger1.logFilePath, expect.stringContaining('[INFO] logger.test.js: test message 2'));
    });

    test('loggers of the same process may have different log levels', () => {
        const logger1 = new Logger(2, logsPath);
        const logger2 = new Logger(4, logsPath);

        logger1.info('test message');
        logger2.debug('test message');

        expect(console.log).toHaveBeenNthCalledWith(1, 'test message');
        expect(console.log).toHaveBeenNthCalledWith(2, 'test message');
    });

    test('log verbosity level and logs path should be interpreted correctly from the process\'s environment', async () => {
        const proc = spawn('node', ['-e', "const Logger = require('./helpers/logger'); const logger = new Logger(); logger.error('error');"], {
            env: { ...process.env, LOG_LEVEL: 4, LOGS_PATH: './test_logs' }
        });

        proc.stderr.on('data', (data) => {
            console.error(data.toString().trim());
        });

        await new Promise(resolve => setTimeout(resolve, 2000))

        expect(console.error).toHaveBeenCalledTimes(1);
        expect(console.log).toHaveBeenCalledTimes(0);
        expect(fs.existsSync('./test_logs')).toBe(true)

        proc.kill();
    });

    test('different processes should log to different files', async () => {
        const proc1 = spawn('node', ['-e', "const Logger = require('./helpers/logger'); const logger = new Logger(); logger.error('error');"], {
            env: { ...process.env, LOGS_PATH: logsPath }
        });

        const proc2 = spawn('node', ['-e', "const Logger = require('./helpers/logger'); const logger = new Logger(); logger.error('error');"], {
            env: { ...process.env, LOGS_PATH: logsPath }
        });

        await new Promise(resolve => setTimeout(resolve, 2000))

        expect.assertions(4)
        expect(fs.existsSync(logsPath)).toBe(true)
        expect(fs.readdirSync(logsPath).length).toBe(2)
        
        for (const log of fs.readdirSync(logsPath)) {
            const logContent = fs.readFileSync(path.join(logsPath, log), 'utf-8')
            expect(logContent).toMatch('Log file created at:')
        }

        proc1.kill();
        proc2.kill();
    });
});
