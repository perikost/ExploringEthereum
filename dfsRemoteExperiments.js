const Client = require('./helpers/dfs/remote/client');
const { SwarmExperiment, ExtendedIpfsExperiment } = require('./helpers/dfs/experiments');
const { program } = require('commander');

program
    .option('-I, --ipfs [string...]', 'Execute experiments on IPFS. Optionally, choose which experiments to execute (default: all).')
    .option('-s, --swarm [string...]', 'Execute experiments on Swarm. Optionally, choose which experiments to execute (default: all).')
    .option('-i, --ip <string>', 'The ip of the server (default localhost)')
    .option('-p, --port <number>', 'The port of the server (default: 3000)')
    .option('-t, --times <number>', 'The number of times the experiments are gonna be executed (default 1). You can exit with CTRL + C at any time')
program.parse();

const options = {
    data: {
        start: '4kb',
        maxStringSize: '16mb'
    }
};

const experiments = [
    {
        name: 'normal',
        description: 'For each round one node will upload a series of content and the rest of the nodes will download it. Given that the content is replicated amongst the nodes that download it, all nodes except from the first one that downloads it might get the content from node other than the uploader',
        networks: ['ipfs', 'swarm'],
        methods: (network) => ({
            upload: () => network.uploadStrings(options),
            download: ids => network.downloadStrings(ids)
        })
    },
    {
        name: 'download-from-uploader',
        description: 'For each round one node will upload a series of content and the rest of the nodes will download it. Each downloader, after getting the content will remove it from local storage. This will ensure that content is always retrieved from the uploader. In addition, since the connection with the uploader isn\'t terminated instantly, the downloader (after getting the content) will disconnect from the peer from which they got it.',
        networks: ['ipfs'],
        methods: (network) => ({
            upload: async () => ({
                ids: await network.uploadStrings(options),
                from: await network.getId()
            }),
            download: data => network.downloadRemoveDisconnect(data.ids, data.from)
        })
    }
]


function getExperiments(network, selected) {
    selected = Array.isArray(selected) && selected;
 
    const exps = []
    for (const exp of experiments) {
        const {networks, methods, ...rest} = exp;
        if (networks.includes(network.name) && (!selected || selected.includes(exp.name))) {
            rest.methods = methods(network);
            rest.network = network.name;
            exps.push(rest);
        }
    }
    return exps;
}

(async () => {
    const { ipfs: ipfsOpt, swarm: swarmOpt, ip, port, times } = program.opts();
    const client = new Client(ip, port);

    if (ipfsOpt) {
        const ipfs = new ExtendedIpfsExperiment({ retry: true });
        const experiments = getExperiments(ipfs, ipfsOpt);
        
        for (const exp of experiments) {
            for (let i = 0; i < (Number(times) || 1); i++) {
                await client.run(exp).catch(console.log);
            }
        }
    }

    if (swarmOpt) {
        const swarm = new SwarmExperiment({ retry: true });
        const experiments = getExperiments(swarm, swarmOpt)

        for (const exp of experiments) {
            for (let i = 0; i < (Number(times) || 1); i++) {
                await swarm.configPostageBatch();
                await client.run(exp).catch(console.log);;
            }
        }
    }

    client.disconnect();
})();
