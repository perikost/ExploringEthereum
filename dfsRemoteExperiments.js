const Client = require('./helpers/remote-experiments/client');

function sleep() {
    return new Promise(resolve => setTimeout(resolve, 1000));
}

const methods = {
    async upload() {
        await sleep();
        return 'identifiers';
    },
    async download(ids) {
        await sleep();
        return 'downloaded';
    }
};


(async () => {
    const ipfsClient = new Client(methods);
    await ipfsClient.run({
        platform: 'IPFS',
        name: 'remote_download_latency'
    });

    const swarmClient = new Client(methods);
    await swarmClient.run({
        platform: 'Swarm',
        name: 'remote_download_latency'
    });
    process.stdin.destroy();
})();
