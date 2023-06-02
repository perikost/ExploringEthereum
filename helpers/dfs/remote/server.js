const { Server: ioServer } = require('socket.io');
const { CSV } = require('../../csvModule.js');
const IpfsBase = require('../ipfs');
const SwarmBase = require('../swarm');
const { MultiStateStore } = require('./state');


const ROUND = {
    id: 0,
    leader: null,
    workers: [],
    workersFinished: 0
};

const EXPERIMENT = {
    network: '',
    name: '',
    description: '',
    round: ROUND,
    workers: [],
    totalRounds: 0
};

const eventsResponseMap = {
    'download': 'downloaded',
    'upload': 'uploaded',
}


module.exports.Server = class Server {
    experiment;

    constructor(port = 3000, auto = false, connections = 0, csvFolderPath = 'csv_records') {
        if (auto && !connections) {
            throw new Error('Can\'t start in auto mode. Specify the number of clients that are expected to connect.')
        }
        this.auto = auto;
        this.connections = connections;
        this.runningClients = 0;
        this.csv = new CSV(csvFolderPath);
        this.state = new MultiStateStore('server.json')
        this.io = new ioServer(port);
        this.networks = {
            ipfs: new IpfsBase(),
            swarm: new SwarmBase()
        };
        this.sockets = []

        this.io.on('connection', (socket) => {
            this.sockets.push(socket);
            this.handleConnection(socket);

            socket.on('disconnect', () => {
                console.log(`User ${socket.data.user} disconnected`);
                
                // update running clients counter when a client disconnects  
                if (this.runningClients && socket.data.participant) this.runningClients--;

                // remove socket from the socket array
                this.sockets = this.sockets.filter(s => s.id !== socket.id)
            });

            socket.on('running', async (exp, ack) => {
                // Clients get registered when the experiment starts, so if the client is found (reconnection) they are in "ready" state
                if (!this.getClient(socket)) {
                    // If the address of the node is given, check if the node is reachable
                    // If it's not, declare the node as a non-participant and return
                    if (exp.nodeAddress && exp.network && !await this.nodeIsReachable(exp.nodeAddress, exp.network)) {
                        this.io.to(socket.id).emit('error', `Could not connect to your ${exp.network} address.`);
                        socket.data.participant = false;
                        return;
                    }

                    if (this.auto) {
                        this.runningClients++;

                        // force start the experiment if all nodes are running
                        if (this.runningClients === this.connections) {
                            this.forceStart();
                            this.runningClients = 0; // TODO: investigate whether it should be set to zero
                        }
                    } else {
                        this.io.to(socket.id).emit('interactive-start');
                    }
                    socket.data.participant = true;
                }

                if (typeof ack === 'function') {
                    ack();
                }
            })

            socket.on('start', (experiment) => {
                console.log(`\nUser ${socket.data.user} started the experiment: `, experiment);
   
                this.io.timeout(10000).emit("experiment-started", (err, responses) => {
                    if (err) {
                        // some clients did not acknowledge the event in the given delay
                    } else if (responses.length === this.sockets.length) {
                        this.configExperimentData(experiment);
                        this.nextRound();
                    }
                });
            });

            socket.on('uploaded', (identifiers) => {
                // everyone gets it but the sender
                socket.broadcast.emit('download', this.experiment.round.id, identifiers);
            });

            socket.on('downloaded', (data) => {
                const round = this.experiment.round;
                const worker = round.workers.find(worker => worker.id === socket.data.id);
                worker.results = data.results;
                round.workersFinished++;

                // if all workers are finished write the results and start the next round
                if (round.workersFinished === round.workers.length) {
                    // write the results
                    this.writeRoundResults()

                    console.log(`Round ${round.id}: All nodes downloaded the data`);

                    // start next round
                    this.nextRound();
                }
            });

            socket.on('client-error', (err) => {
                console.log(`\nUser ${socket.data.user} encountered the following error: `, err);
                this.io.emit('error');
            });

            // TODO: investigate if prepending the catch-all listeners is preferred

            // Register a catch-all listener for incoming events
            socket.prependAny((event, ...args) => {
                const client = this.getClient(socket);
                if (client && event === client.state.response()) {
                    client.state.status('got').args(args);
                }
            });

            // Register a catch-all listener for outgoing events.
            socket.prependAnyOutgoing((event, ...args) => { 
                const client = this.getClient(socket);
                if (client && eventsResponseMap[event]) {
                    client.state.response(eventsResponseMap[event]).event(event).status('sent').args(args).round(this.experiment.round)
                }
            });
        });
    }

    /**
    * Configures the experiment's initial data
    * @param {Object} experiment - Basic info about the experiment provided by the client that started the experiment.
    */
    configExperimentData(experimentInfo) {
        // merge an empty experiment object with the provided basic info
        const emptyExperiment = JSON.parse(JSON.stringify(EXPERIMENT))
        this.experiment = { ...emptyExperiment, ...experimentInfo };

        // update rest of the data
        // const sockets = await this.io.fetchSockets();
        this.experiment.workers = this.sockets.filter(socket => socket.data.participant).map(socket => ({
            user: socket.data.user,
            id: socket.data.id,
            socket: socket.id,
            state: this.state.add(socket.data.id)
        }));
        this.experiment.totalRounds = this.experiment.workers.length;
    }

    forceStart() {
        this.io.to(this.sockets[0].id).emit('automated-start');
        // this.io.fetchSockets().then(sockets => this.io.to(sockets[0].id).emit('automated-start'));
    }

    nextRound() {
        const round = this.experiment.round;
        if (this.experiment.totalRounds > round.id) {
            round.leader = this.experiment.workers[round.id];
            round.workers = this.experiment.workers.filter(worker => worker.id !== round.leader.id);
            round.workersFinished = 0;
            round.id++;
            // emit an upload event only to the leader
            this.io.to(round.leader.socket).emit('upload', round.id);
        } else {
            this.state.clear();
            this.experiment = JSON.parse(JSON.stringify(EXPERIMENT));
            console.log('Experiment finished\n');
            this.io.emit('experiment-finished')
        }
    }

    writeRoundResults() {
        for (const worker of this.experiment.round.workers) {
            for (const stat of worker.results) {
                this.csv.writeStats(stat, this.experiment.network, 'retrieve', worker.user, null, this.experiment.name);
            }
        }
    }

    async nodeIsReachable(address, network) {
        try {
            if (this.networks.hasOwnProperty(network) && address) {
                return await this.networks[network].peerReachable(address)
            }
            return false;
        } catch (error) {
            console.log(error.toString());
        }
    }

    getClient(socket) {
        if (!this.experiment || !this.experiment.round.leader || !this.experiment.round.workers.length) return undefined;
        return this.experiment.round.leader.id === socket.data.id
            ? this.experiment.round.leader
            : this.experiment.round.workers.find(worker => worker.id === socket.data.id);
    }

    async handleConnection(socket) {
        socket.data.user = socket.handshake.auth.user;
        socket.data.id = socket.handshake.auth.id;
        console.log(`User ${socket.data.user} connected`);

        // handle reconnection of clients
        const client = this.getClient(socket);
        if (client) {
            console.log('re-connected')
            // the client has reconnected, update their socket id 
            client.socket = socket.id;
            // get client state and ask them to re-execute if necessary
            if (client.state.status() === 'sent') {
                await new Promise(resolve => setTimeout(resolve, 5000));
                this.io.to(client.socket).emit(client.state.event(), ...client.state.args());
            }
        }
    }
}


module.exports.EXPERIMENT = JSON.parse(JSON.stringify(EXPERIMENT));
module.exports.ROUND = JSON.parse(JSON.stringify(ROUND));
