const { Server } = require('socket.io');
const { CSV } = require('../../csvModule.js');
const csv = new CSV();
const { program, InvalidArgumentError } = require('commander');
const IpfsBase = require('../ipfs');
const SwarmBase = require('../swarm');

function parseConnections(value) {
    const parsedValue = parseInt(value, 10);
    if (isNaN(parsedValue) || parsedValue < 2) {
        throw new InvalidArgumentError('The experiment cannot run with less than 2 clients.');
    }
    return parsedValue;
}

program.option('-p, --port [number]', 'The port of the server');
program.option('-c, --connections [number]', 'The number of clients expected to connect', parseConnections);
program.option('-a, --auto', 'Start the experiment when all clients are connected');
program.parse();

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


/**
* Configures the experiment's initial data
* @param {Object} experiment - Basic info about the experiment provided by the client that started the experiment.
*/
async function configExperimentData(experimentInfo) {
    // merge an empty experiment object with the provided basic info
    const emptyExperiment = JSON.parse(JSON.stringify(EXPERIMENT))
    experiment = { ...emptyExperiment, ...experimentInfo };

    // update rest of the data
    const sockets = await io.fetchSockets();
    experiment.workers = sockets.map(socket => ({
        user: socket.data.user,
        socket: socket.id,
    }));
    experiment.totalRounds = experiment.workers.length;
}

function forceStart() {
    io.fetchSockets().then(sockets => io.to(sockets[0].id).emit('automated-start'));
}

function nextRound() {
    const round = experiment.round;
    if (experiment.totalRounds > round.id) {
        round.leader = experiment.workers[round.id];
        round.workers = experiment.workers.filter(worker => worker.socket !== round.leader.socket);
        round.workersFinished = 0;
        round.id++;
        // emit an upload event only to the leader
        io.to(round.leader.socket).emit('upload', round.id);
    } else {
        console.log('Experiment finished\n');
        io.emit('experiment-finished')
    }
}

function writeRoundResults(workers) {
    for (const worker of workers) {
        for (const stat of worker.results) {
            csv.writeStats(stat, experiment.network, 'retrieve', worker.user, null, experiment.name);
        }
    }
}

async function nodeIsReachable(address, network) {
    try {
        if (networks.hasOwnProperty(network) && address) {
            if (!await networks[network].peerReachable(address)) throw new Error(`Node ${address} is not reachable in ${network} network`)
        }
        return true;
    } catch (error) {
        console.log(error.toString());
    }
}


const { port, auto, connections } = program.opts();
const io = new Server(port || 3000);
const networks = {
    ipfs: new IpfsBase(),
    swarm: new SwarmBase()
}


if (auto && !connections) throw new Error('Can\'t start in auto mode. Specify the number of clients that are expected to connect with the --connections option.')
let experiment;
let runningClients = 0;

io.on('connection', (socket) => {
    socket.data.user = socket.handshake.auth.user;
    console.log(`User ${socket.data.user} connected`);
    
    socket.on("disconnect", () => {
        if (runningClients && socket.data.participant) runningClients--;
    });

    socket.on('running', async (exp) => {
        // If the address of the node is given, check if the node is reachable 
        // If it's not, declare the node as a non-participant and return 
        if (exp.nodeAddress && exp.network && !await nodeIsReachable(exp.nodeAddress, exp.network)) {
            io.to(socket.id).emit('error', `Could not connect to your ${exp.network} address.`);
            socket.data.participant = false;
            return;
        }

        if (auto) {
            runningClients++;

            // force start the experiment if all nodes are running
            if (runningClients === connections) {
                forceStart();
                runningClients = 0;
            }
        } else {
            io.to(socket.id).emit('interactive-start');
        }
        socket.data.participant = true;
    })

    socket.on('start', (experiment) => {
        console.log(`\nUser ${socket.data.user} started the experiment: `, experiment);
        configExperimentData(experiment).then(() => nextRound());
        io.emit('experiment-started');
    });

    socket.on('uploaded', (identifiers) => {
        // everyone gets it but the sender
        socket.broadcast.emit('download', experiment.round.id, identifiers);
    });

    socket.on('downloaded', (data) => {
        const round = experiment.round;
        const worker = round.workers.find(worker => worker.socket === socket.id);
        worker.results = data.results;
        round.workersFinished++;

        // if all workers are finished write the results and start the next round
        if (round.workersFinished === round.workers.length) {
            // write the results
            writeRoundResults(round.workers)

            console.log(`Round ${round.id}: All nodes downloaded the data`);

            // start next round
            nextRound();
        }
    });

    socket.on('client-error', (err) => {
        console.log(`\nUser ${socket.data.user} encountered the following error: `, err);
        io.emit('error');
    });
});
