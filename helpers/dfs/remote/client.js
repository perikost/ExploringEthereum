
const { io } = require('socket.io-client');
const os = require('os')
const utils = require('../../utils');


module.exports = class Client {
    socket;
    methods;
    finished;
    failed;

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
            utils.core.cancelKeypress();
        });

        this.socket.on('download', async (round, identifiers) => {
            try {
                const results = await this.methods.download(identifiers)
                console.log('\n' + `Round ${round}: I downloaded the data`);
                this.socket.emit('downloaded', { results: results })
            } catch (error) {
                console.log('Could not download one of', identifiers)
                console.log(error)
                this.socket.emit('client-error', error.toString());
            }
        });

        this.socket.on('upload', async (round) => {
            try {
                const results = await this.methods.upload();
                console.log(`Round ${round}: I uploaded the data`);

                // if data is downloaded instantly a timeout error is thrown
                // wait a minute for the data to reach the nodes responsible for storing it (swarm: area of responsibility)
                await utils.core.sleep(60);
                this.socket.emit('uploaded', results)
            } catch (error) {
                console.log(error)
                this.socket.emit('client-error', error.toString());
            }
        });

        this.socket.on('error', () => {
            this.socket.disconnect();
            this.failed('Failure');
        })
    }

    /**
     * Prompts user to start the experiments
     *
     * @method
     * @param {Object} experiment
     * @param {string} experiment.name - The name of the experiment
     * @param {string} experiment.description - A description of the experiment
     * @param {string} experiment.network - The network on which the experiment is executed
     * @param {Object} experiment.methods - The necessary methods to run the experiments
     * @param {Function} experiment.methods.upload - An async method that uploads data to IPFS/Swarm
     * @param {Function} experiment.methods.download - An async method that downloads data from IPFS/Swarm
     * @return {Promise<string>} A promise which is fulfilled when the experiment ends
     */
    run(experiment) {
        const {methods, ...exp} = experiment;
        this.methods = methods;
        // wait for user input to start the experiments
        console.log('\nPress ANY key to start the experiments or CTRL + C to exit')
        utils.core.keypress().then(key => {

            // if keypress is cancelled return
            if (!key) return;

            // if user cancels the experiments exit
            if (key.ctrl && key.name === 'c') process.exit();

            // else start the experiment
            console.log('I started the experiment');
            this.socket.emit('start', exp);

        });

        // this promise will be resolved when the experiment is finished
        return new Promise((resolve, reject) => {
            this.finished = resolve;
            this.failed = reject;
        });
    }

    disconnect() {
        this.socket.disconnect();
    }
}
