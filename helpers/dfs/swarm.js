const utils = require('../utils.js');
const performance = require('perf_hooks').performance;
const { Bee, BeeDebug } = require("@ethersphere/bee-js");
const { CSV } = require('../csvModule.js');

const POSTAGE_STAMPS_AMOUNT = '10000000';
const POSTAGE_STAMPS_DEPTH = 20

const OPTIONS = {
    clearCache: false,
    keepStats: false,
    uploadOptions: {
        pin: true,
        deferred: true, // when true, node uploads data locally and then pushes chunks to the network
        encrypt: false
    },
    downloadOptions: {
        timeout: 60000,
        retry: 0
    }
};

class SwarmBase {
    name = 'swarm';
    bee;
    beeDebug;
    postageBatchId;
    options;
    csv;

    constructor(opts) {
        // merge the defaultOptions with the input options
        this.options = utils.core.getOptions(opts, OPTIONS, true);
        this.bee = new Bee("http://localhost:1633");
        this.beeDebug = new BeeDebug("http://localhost:1635");
    }

    async findNonExpiredBatch() {
        try {
            // check if we have a non expired postageBatch
            const availableBatches = await this.beeDebug.getAllPostageBatch();
            for (const batch of availableBatches) {
                if (batch.batchTTL >= 3600) return batch.batchID;
            }
        } catch (error) {
            // pass
        }
        return null;
    }

    // TODO: Approximate the amount of data that can be uploaded with this postage batch and notify the user. 
    // Alternatively call this function prior to every upload and calculate if it suffices. If not a new batch should be created
    async configPostageBatch() {
        let batchId = await this.findNonExpiredBatch();
        if (!batchId) {
            batchId = await this.beeDebug.createPostageBatch(POSTAGE_STAMPS_AMOUNT, POSTAGE_STAMPS_DEPTH)
            console.log('\nUsing newly created batchId:', batchId);
        }
        this.postageBatchId = batchId;
    }

    // TODO: Currently this function has only been tested with strings. Ensure that other data types are handled as well.
    async upload(data, opts = null) {
        const localOptions = utils.core.getOptions(opts, this.options);

        // measure upload latency
        const begin = performance.now();
        const result = await this.bee.uploadData(this.postageBatchId, data, localOptions.uploadOptions);
        const uploadLatency = (performance.now() - begin).toFixed(4);

        // set up the upload process's stats
        const hash = result.reference;
        const info = utils.core.type(data);
        const toWrite = {
            basic: [Date().slice(0, 24), hash, uploadLatency],
            inputInfo: info
        };

        // create csv object if necessary and write the results
        if (localOptions.keepStats) {
            if (!this.csv) this.csv = new CSV();
            this.csv.writeStats(toWrite, 'swarm', 'upload', `string_${data.length / 1024}kB`);
        }

        return hash;
    }

    // TODO: Currently this function has only been tested with strings. Ensure that other data types are handled as well.
    async download(hash, opts = null) {
        const localOptions = utils.core.getOptions(opts, this.options);
        if (localOptions.clearCache) utils.core.clearCache();

        // measure retrieval latency
        const begin = performance.now();
        let data = await this.bee.downloadData(hash, localOptions.downloadOptions);
        const retrievalLatency = (performance.now() - begin).toFixed(4);

        // set up the download process's stats
        data = new TextDecoder("utf-8").decode(data);
        const info = utils.core.type(data);
        const toWrite = {
            basic: [Date().slice(0, 24), retrievalLatency],
            inputInfo: info
        };

        // create csv object if necessary and write the results
        if (localOptions.keepStats) {
            if (!this.csv) this.csv = new CSV();
            this.csv.writeStats(toWrite, 'swarm', 'retrieve', `string_${data.length / 1024}kB`);
        }

        return {
            data: data,
            stats: toWrite
        }
    }

}


module.exports = SwarmBase;
