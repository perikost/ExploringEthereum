const Client = require('./helpers/dfs/remote/client');
const { IpfsExperiment, SwarmExperiment } = require('./helpers/dfs/experiments');
const { program } = require('commander');

program
    .option('-i, --ip <string>', 'The ip of the server')
    .option('-p, --port <number>', 'The port of the server');
program.parse();

const options = {
    data: {
        start: '4kb',
        maxStringSize: '16kb'
    }
};

const methods = (platform) => ({
    upload: () => platform.uploadStrings(options),
    download: cids => platform.downloadStrings(cids)
});


(async () => {
    const { ip, port } = program.opts();
    const client = new Client(ip, port);

    const ipfs = new IpfsExperiment();
    await client.run('IPFS', methods(ipfs));

    const swarm = new SwarmExperiment();
    await swarm.configPostageBatch();
    await client.run('Swarm', methods(swarm));

    client.disconnect();
})();
