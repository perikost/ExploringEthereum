
require('dotenv').config();
const fs = require("fs");
const { io } = require('socket.io-client');
const os = require('os')
const utils = require('../../utils');
const { SingleStateStore } = require('./state');

module.exports = class Client {
    socket;
    methods;
    finished;
    failed;
    state;

    constructor(ip, port, id, user) {
        const destination = `http://${ip || 'localhost'}:${port || 3000}`
        this.user = user || process.env.USER_NAME || os.hostname();
        this.id = id || this._id();
        this.state = new SingleStateStore(`client_${this.id}.json`)
        this.socket = io(destination, {
            auth: {
                user: this.user,
                id: this.id
            }
        });
        this._registerEvents();
    }

    _id() {
        if (process.env.ID) return process.env.ID;

        const id = new Date().getTime().toString();
        const envVar = `ID = ${id}`

        if (fs.existsSync('.env')) {
            const envVars = fs.readFileSync('.env', 'utf-8').split(os.EOL).filter(envVar => !!envVar);
            envVars.push(envVar)
            fs.writeFileSync('.env', envVars.join(os.EOL));
        } else {
            fs.writeFileSync('.env', envVar);
        }

        return id;
    }

    _start(interactive = false) {
        const start = () => {
            console.log('I started the experiment');
            this.socket.emit('start', this.exp);
        }

        if (interactive) {
            // wait for user input to start the experiments
            console.log('\nPress ANY key to start the experiments or CTRL + C to exit')
            utils.core.keypress().then(key => {

                // if keypress is cancelled return
                if (!key) return;

                // if user cancels the experiments exit
                if (key.ctrl && key.name === 'c') process.exit();

                // else start the experiment
                start();
            });
        } else {
            start();
        }
    }

    _registerEvents() {
        this.socket.on('automated-start', () => {
            this._start();
        });

        this.socket.on('interactive-start', () => {
            this._start(true);
        });

        this.socket.on('experiment-finished', () => {
            this.state.clear();
            this.finished('Success');
        });

        this.socket.on('experiment-started', (ack) => {
            utils.core.cancelKeypress();
            ack()
        });

        this.socket.on('download', async (round, identifiers) => {
            try {
                // if content is already downloaded return the cached results, else download it
                if (this.state.event() === 'downloaded' && this.state.round() === round) {
                    this.socket.emit(this.state.event(), ...this.state.args())
                } else {
                    const results = await this.methods.download(identifiers)
                    this.state.event('downloaded').args([{results}]).round(round);
                    console.log('\n' + `Round ${round}: I downloaded the data`);

                    await utils.core.sleep(1)
                    this.socket.emit('downloaded', ...this.state.args())
                }
            } catch (error) {
                console.log('Could not download one of', identifiers)
                console.log(error)
                this.socket.emit('client-error', error.toString());
            }
        });

        this.socket.on('upload', async (round) => {
            try {
                // if content is already uploaded return the cached identifiers, else upload it
                if (this.state.event() === 'uploaded' && this.state.round() === round) {
                    // if (process.env.ID == 1680040960121) process.exit();
                    this.socket.emit('uploaded', ...this.state.args())
                } else {
                    const results = await this.methods.upload();
                    this.state.event('uploaded').args([results]).round(round);
                    console.log(`Round ${round}: I uploaded the data`);

                    // if data is downloaded instantly a timeout error is thrown
                    // wait a minute for the data to reach the nodes responsible for storing it (swarm: area of responsibility)
                    await utils.core.sleep(30);
                    this.socket.emit('uploaded', ...this.state.args())
                }
            } catch (error) {
                console.log(error)
                this.socket.emit('client-error', error.toString());
            }
        });

        this.socket.on('error', (errorMessage = 'Failure') => {
            this.socket.disconnect();
            this.failed(errorMessage);
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
     * @param {string} experiment.nodeAddress - The address of the node in the network
     * @param {Object} experiment.methods - The necessary methods to run the experiments
     * @param {Function} experiment.methods.upload - An async method that uploads data to IPFS/Swarm
     * @param {Function} experiment.methods.download - An async method that downloads data from IPFS/Swarm
     * @return {Promise<string>} A promise which is fulfilled when the experiment ends
     */
    run(experiment) {
        const {methods, ...exp} = experiment;
        this.methods = methods;
        this.exp = exp;
        this.socket.emit('running', exp);

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
