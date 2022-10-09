const { Server } = require('socket.io');

const ROUND = {
    id: 0,
    leader: null,
    workers: [],
    workersFinished: 0
};

const EXPERIMENT = {
    platform: '',
    name: '',
    round: ROUND,
    workers: [],
    totalRounds: 0
};

/**
* Configures the experiment's initial data/
* @param {Object} experimentBase - Basic info about the experiment provided by the client that started the experiment.
*/
async function configExperimentData(experimentBase) {
    // merge an empty experiment object with the provided basic info
    const emptyExperiment = JSON.parse(JSON.stringify(EXPERIMENT))
    experiment = { ...emptyExperiment, ...experimentBase };

    // update rest of the data
    const sockets = await io.fetchSockets();
    experiment.workers = sockets.map(socket => ({
        user: socket.data.user,
        socket: socket.id,
    }));
    experiment.totalRounds = experiment.workers.length;
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


const io = new Server(3000);
let experiment;

io.on('connection', (socket) => {
    socket.data.user = socket.handshake.auth.user;

    // console log the connection
    console.log(`User ${socket.data.user} connected`);

    socket.on('start', (experiment) => {
        console.log(`\nUser ${socket.data.user} started the experiment: `, experiment);
        io.emit('experiment-started')
        configExperimentData(experiment).then(() => nextRound());
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
            // ...

            console.log(`Round ${round.id}: All nodes downloaded the data`);

            // start next round
            nextRound();
        }
    });
});