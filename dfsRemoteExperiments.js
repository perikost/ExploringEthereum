const Client = require('./helpers/dfs/remote/client');
const { IpfsExperiment, SwarmExperiment } = require('./helpers/dfs/experiments');

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
    const client = new Client();

    const ipfs = new IpfsExperiment();
    await client.run('IPFS', methods(ipfs));

    const swarm = new SwarmExperiment();
    await client.run('Swarm', methods(swarm));

    client.disconnect();
})();
