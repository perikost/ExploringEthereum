const utils = require('../utils.js');
const performance = require('perf_hooks').performance;
const { Bee, BeeDebug } = require("@ethersphere/bee-js");
const { CSV } = require('../csvModule.js');
const http = require("http");

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
    options;
    csv;
    nodeId;

    constructor(opts) {
        // merge the defaultOptions with the input options
        this.options = utils.core.getOptions(opts, OPTIONS, true);
        this.bee = new Bee("http://localhost:1633");
        this.beeDebug = new BeeDebug("http://localhost:1635");
    }

    async getId() {
        return this.nodeId || this.beeDebug.getNodeAddresses().then(res => {
            this.nodeId = res.overlay;
            return res.overlay;
        });
    }

    async findUsableBatch() {
        try {
            // check if we have a usable non expired postageBatch
            const availableBatches = await this.beeDebug.getAllPostageBatch();
            for (const { depth, bucketDepth, utilization, batchTTL, batchID } of availableBatches) {
                if (batchTTL >= 3600 && utilization <= (Math.pow(2, depth - bucketDepth) - 1)) return batchID;
            }
        } catch (error) {
            // pass
        }
        return null;
    }

    // TODO: Approximate the amount of data that can be uploaded with this postage batch. If it does not suffice, a new batch should be created
    async getPostageBatch() {
        let batchId = await this.findUsableBatch();
        if (!batchId) {
            batchId = await this.beeDebug.createPostageBatch(POSTAGE_STAMPS_AMOUNT, POSTAGE_STAMPS_DEPTH)
            console.log('\nUsing newly created batchId:', batchId);
        }
        return batchId;
    }

    // TODO: Currently this function has only been tested with strings. Ensure that other data types are handled as well.
    async upload(data, opts = null) {
        const localOptions = utils.core.getOptions(opts, this.options);

        // we need a postageBatch to upload the data
        const batchId = await this.getPostageBatch();

        // measure upload latency
        const begin = performance.now();
        const result = await this.bee.uploadData(batchId, data, localOptions.uploadOptions);
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

    async disconnectFromPeer(peerAddress) {
        try {
            const peers = await this.beeDebug.getPeers();
            const connected = peers.find(peer => peer.address === peerAddress);

            if (connected) {
                await this.beeDebug.removePeer(peerAddress);
                console.log('Disconnected from peer: ', peerAddress);
            } else {
                console.log('Not connected to peer: ', peerAddress);
            }
        } catch (error) {
            console.log('Could not disconnect from peer', peerAddress);
        }
    }

    isLocalChunk(hash) {
        const requestOptions = {
            hostname: 'localhost',
            port: 1633,
            path: `/chunks/${hash}`,
            method: 'HEAD'
        }

        return new Promise( (resolve, reject) => {
            http.request(requestOptions, resp => resolve(resp.statusCode === 200))
                .on("error", err => reject(err.message))
                .end();
        })
    }

    deleteLocalChunk(hash) {
        const requestOptions = {
            hostname: 'localhost',
            port: 1633,
            path: `/chunks/${hash}`,
            method: 'DELETE'
        }

        return new Promise((resolve, reject) => {
            http.request(requestOptions, resp => resolve())
                .on("error", err => reject(err.message))
                .end();
        })
    }
}


module.exports = SwarmBase;
