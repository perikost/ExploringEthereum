
const { io } = require('socket.io-client');
const readline = require('readline')
const os = require('os')

readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) process.stdin.setRawMode(true);

module.exports = class Client {
    socket;
    methods;
    finished;

    /**
     * @constructor
     * @param {Object} methods - The necessary methods to run the experiments
     * @param {Function} methods.upload - An async method that uploads data to IPFS/Swarm
     * @param {Function} methods.download - An async method that downloads data from IPFS/Swarm
     */
    constructor(methods) {
        this.socket = io('http://localhost:3000', {
            auth: {
                user: os.hostname()
            }
        });

        this.methods = methods;
        this._registerEvents();
    }

    _registerEvents() {

        this.socket.on('experiment-finished', () => {
            this.finished('Success');
            this.socket.disconnect();
        });

        this.socket.on('experiment-started', () => {
            process.stdin.removeAllListeners('keypress');
        });

        this.socket.on('download', async (round, identifiers) => {
            const results = await this.methods.download(identifiers)
            console.log(`Round ${round}: I downloaded the data`);
            this.socket.emit('downloaded', { results: results })
        });

        this.socket.on('upload', async (round) => {
            const results = await this.methods.upload()
            console.log(`Round ${round}: I uploaded the data`);
            this.socket.emit('uploaded', results)
        });
    }

    /**
     * Prompts user to start the experiments
     *
     * @method
     * @param {Object} experiment
     * @param {('IPFS' | 'Swarm')} experiment.platform
     * @param {string} experiment.name
     * @return {Promise<string>} A promise which is fulfilled when the experiment ends
     */
    run(experiment) {
        // wait for user input to start the experiments
        console.log('\nPress ENTER to start the experiments or CTRL + C to exit')
        process.stdin.on('keypress', (str, key) => {
            // exit on ctrl + C
            if (key.ctrl && key.name === 'c') process.exit();
            if (key.name === 'return') {
                console.log('I started the experiment');
                this.socket.emit('start', experiment);
            }
        });

        // this promise will be resolved when the experiment is finished
        return new Promise((resolve, reject) => {
            this.finished = resolve;
        });
    }
}
