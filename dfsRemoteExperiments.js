const Client = require('./helpers/dfs/remote/client');
const { SwarmExperiment, ExtendedIpfsExperiment } = require('./helpers/dfs/experiments');
const { program } = require('commander');

function parseIntOption(value) {
    const parsedValue = parseInt(value, 10);
    if (isNaN(parsedValue)) {
        throw new InvalidArgumentError('Not an integer.');
    }
    console.log(value, parsedValue)
    return parsedValue;
}

program
    .option('-I, --ipfs [string...]', 'Execute experiments on IPFS. Optionally, choose which experiments to execute (default: all).')
    .option('-s, --swarm [string...]', 'Execute experiments on Swarm. Optionally, choose which experiments to execute (default: all).')
    .option('-i, --ip [string]', 'The ip of the server (default localhost)')
    .option('-p, --port [number]', 'The port of the server (default: 3000)')
    .option('-t, --times [number]', 'The number of times the experiments are gonna be executed (default 1). You can exit with CTRL + C at any time', parseIntOption, 1)
    .option('-r, --retries [number]', 'The number of times each function is re-executed upon error (default 3). You can stop the re-execution with CTRL + C at any time', parseIntOption, 3)
    .option('--data-start [string | number]', 'The size of the first chunk of data (default 4kb)','4kb')
    .option('--data-max [string | number]', 'The size of the last chunk of data (default 16mb)','16mb')
    .option('--data-step [number]', 'The step used for increasing the chunks (default 4)', parseIntOption, 4)
    .option('--data-op [string]', 'The operator used for increasing the chunks. (Accepted \'*\', \'+\')(default \'*\')', '*')

program.parse();

const userOptions = program.opts();
const options = {
    data: {
        start: userOptions.dataStart,
        step: userOptions.dataStep,
        stepOp: userOptions.dataOp,
        maxStringSize: userOptions.dataMax
    }
};

const experiments = [
    {
        name: 'normal',
        description: 'For each round one node will upload a series of content and the rest of the nodes will download it. Given that the content is replicated amongst the nodes that download it, all nodes except from the first one that downloads it might get the content from a node other than the uploader (uploader = responsible nodes in case of swarm).',
        networks: ['ipfs', 'swarm'],
        methods: (network) => ({
            upload: () => network.uploadStrings(options),
            download: ids => network.downloadStrings(ids)
        })
    },
    {
        name: 'disconnect',
        description: 'For each round one node will upload a series of content and the rest of the nodes will download it. Since the connection with the uploader isn\'t terminated instantly, the downloader (after getting the content) will disconnect from the peer from which they got it.',
        networks: ['ipfs', 'swarm'],
        methods: (network) => ({
            upload: async () => ({
                ids: await network.uploadStrings(options),
                from: await network.getId()
            }),
            download: data => network.downloadDisconnect(data.ids, data.from)
        })
    },
    {
        name: 'do-not-cache-disconnect',
        description: 'For each round one node will upload a series of content and the rest of the nodes will download it. Each downloader, after getting the content will remove it from local storage. Regarding IPFS, this ensures that content is always retrieved from the uploader. In case of Swarm it ensures that the content isn\'t cached and therefore cannot be provided by the nodes that have already downloaded it. In addition, since the connection with the uploader isn\'t terminated instantly, the downloader (after getting the content) will disconnect from the peer from which they got it.',
        networks: ['ipfs', 'swarm'],
        methods: (network) => ({
            upload: async () => ({
                ids: await network.uploadStrings(options),
                from: await network.getId()
            }),
            download: data => network.downloadRemoveDisconnect(data.ids, data.from)
        })
    },
    {
        name: 'do-not-cache',
        description: 'For each round one node will upload a series of content and the rest of the nodes will download it. Each downloader, after getting the content will remove it from local storage. Regarding IPFS, this ensures that content is always retrieved from the uploader. In case of Swarm it ensures that the content isn\'t cached and therefore cannot be provided by the nodes that have already downloaded it.',
        networks: ['ipfs', 'swarm'],
        methods: (network) => ({
            upload: () => network.uploadStrings(options),
            download: ids => network.downloadRemove(ids)
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
    const { ipfs: ipfsOpt, swarm: swarmOpt, ip, port, times, retries } = userOptions;
    const client = new Client(ip, port);

    if (ipfsOpt) {
        const ipfs = new ExtendedIpfsExperiment({ retry: retries });
        const experiments = getExperiments(ipfs, ipfsOpt);
        await ipfs.clearRepo();
        
        for (const exp of experiments) {
            for (let i = 0; i < times; i++) {
                await client.run(exp).catch(console.log);
            }
        }
    }

    if (swarmOpt) {
        const swarm = new SwarmExperiment({ retry: retries });
        const experiments = getExperiments(swarm, swarmOpt)

        for (const exp of experiments) {
            for (let i = 0; i < times; i++) {
                await swarm.configPostageBatch();
                await client.run(exp).catch(console.log);;
            }
        }
    }

    client.disconnect();
})();
