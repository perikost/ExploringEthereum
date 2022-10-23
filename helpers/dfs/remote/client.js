
const { io } = require('socket.io-client');
const readline = require('readline')
const os = require('os')
const utils = require('../../utils');

readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) process.stdin.setRawMode(true);

module.exports = class Client {
    socket;
    methods;
    finished;

    constructor(ip, port) {
        const destination = `http://${ip || 'localhost'}:${port || 3000}`
        this.socket = io(destination, {
            auth: {
                user: os.hostname()
            }
        });
        this._registerEvents();
    }

    _registerEvents() {

        this.socket.on('experiment-finished', () => {
            this.finished('Success');
        });

        this.socket.on('experiment-started', () => {
            process.stdin.removeAllListeners('keypress');
        });

        this.socket.on('download', async (round, identifiers) => {
            try {
                const results = await this.methods.download(identifiers)
                console.log(`Round ${round}: I downloaded the data`);
                this.socket.emit('downloaded', { results: results })
            } catch (error) {
                console.log(error)
                this.socket.emit('client-error', error.toString());
            }
        });

        this.socket.on('upload', async (round) => {
            try {
                const results = await this.methods.upload()
                console.log(`Round ${round}: I uploaded the data`);

                // if data is downloaded instantly a timeout error is thrown
                // wait 4 minutes for the data to reach the nodes responsible for storing it (swarm: area of responsibility)
                await utils.core.sleep(240);
                this.socket.emit('uploaded', results)
            } catch (error) {
                console.log(error)
                this.socket.emit('client-error', error.toString());
            }
        });

        this.socket.on('error', () => {
            this.socket.disconnect();
            process.stdin.destroy();
        })
    }

    /**
     * Prompts user to start the experiments
     *
     * @method
     * @param {'IPFS' | 'Swarm'} platform
     * @param {Object} methods - The necessary methods to run the experiments
     * @param {Function} methods.upload - An async method that uploads data to IPFS/Swarm
     * @param {Function} methods.download - An async method that downloads data from IPFS/Swarm
     * @return {Promise<string>} A promise which is fulfilled when the experiment ends
     */
    run(platform, methods) {
        this.methods = methods;
        // wait for user input to start the experiments
        console.log('\nPress ENTER to start the experiments or CTRL + C to exit')
        process.stdin.on('keypress', (str, key) => {
            // exit on ctrl + C
            if (key.ctrl && key.name === 'c') process.exit();
            if (key.name === 'return') {
                console.log('I started the experiment');
                this.socket.emit('start', { platform: platform});
            }
        });

        // this promise will be resolved when the experiment is finished
        return new Promise((resolve, reject) => {
            this.finished = resolve;
        });
    }

    disconnect() {
        this.socket.disconnect();
        process.stdin.destroy();
    }
}