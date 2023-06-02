const { program, InvalidArgumentError } = require('commander');
const { Server } = require('./server');

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


const { port, auto, connections } = program.opts();
new Server(port, auto, connections);
