const { create, globSource } = require('ipfs-http-client');
const ipfs = create('http://localhost:5001');
const fs = require('fs');
const bs58 = require('bs58');
const { CSV } = require('../csvModule.js');
const utils = require('../utils.js');
const performance = require('perf_hooks').performance;
const UnixFS = require('ipfs-unixfs');
//const BigNumber = require('bignumber.js');


// CIDs are a base58 encoding of a Hash(in this case a Bytes32) and a prefix.
// The 2 Functions below are used to transform a CID to Bytes32 and reverse.
function _bytes32ToCid(bytes32) {
    let prefix = '1220'; // standard first 2 bytes of every IPFS version 0 CID
    bytes32 = bytes32.slice(2);
    cid = prefix + bytes32;
    cid = Buffer.from(cid, 'hex');
    cid = bs58.encode(cid);
    return cid;
}


function _cidToBytes32(cid) {
    cid = cid.toString();
    cid = bs58.decode(cid);
    cid = cid.toString('hex');
    cid = cid.slice(4); // don't include '1220'
    let bytes32 = '0x' + cid;
    return bytes32;
}

const OPTIONS = {
    clearCache: false,
    keepStats: false,
    uploadOptions: {
        cidVersion: 0,
        rawLeaves: false,
        wrapWithDirectory: false,
        chunker: null, // e.g.,'size-4096',
        progress: null // e.g., (prog) => console.log(prog)
    },
    downloadOptions: {
        timeout: 30000
    }
};

class IpfsBase {
    options;
    csv;

    constructor(opts) {
        // merge the defaultOptions with the input options
        this.options = utils.core.getOptions(opts, OPTIONS, true);
    }

    // TODO: Currently this function has only been tested with strings. Ensure that other data types are handled as well.
    async upload(data, opts = null) {
        const localOptions = utils.core.getOptions(opts, this.options);

        // measure upload latency
        const begin = performance.now();
        const uploaded = await ipfs.add(data, localOptions.uploadOptions);
        const uploadLatency = (performance.now() - begin).toFixed(4);

        // TODO: consider approaching this as done in download() so that remote upload experiments can be conducted 
        if (localOptions.keepStats) {
            const info = utils.core.type(data);
            const toWrite = {
                basic: [Date().slice(0, 24), uploaded.cid, uploadLatency, uploaded.size],
                inputInfo: info
            };

            // create csv object if necessary and write the results
            if (!this.csv) this.csv = new CSV();
            this.csv.writeStats(toWrite, 'ipfs', 'upload', `string_${data.length / 1024}kB`);
        }

        return uploaded.cid.toString();
    }

    // TODO: Currently this function has only been tested with strings. Ensure that other data types are handled as well.
    async download(cid, opts = null) {
        const localOptions = utils.core.getOptions(opts, this.options);
        const chunks = [];

        if (localOptions.clearCache) utils.core.clearCache();

        // measure retrieval latency
        const begin = performance.now();
        for await (const chunk of ipfs.cat(cid, localOptions.downloadOptions)) chunks.push(chunk);
        const retrievalLatency = (performance.now() - begin).toFixed(4);

        // get ipfs-object's stats and convert data to string (if applicable)
        const objectStats = await ipfs.object.stat(cid);
        const data = chunks.toString().replace(/,/g, ''); // TODO: find out why commas are inserted

        // set up the download process's stats
        const info = utils.core.type(data);
        const toWrite = {
            basic: [Date().slice(0, 24), retrievalLatency, objectStats.CumulativeSize],
            inputInfo: info
        };

        // create csv object if necessary and write the results
        if (localOptions.keepStats) {
            if (!this.csv) this.csv = new CSV();
            this.csv.writeStats(toWrite, 'ipfs', 'retrieve', `string_${data.length / 1024}kB`);
        }

        return {
            data: data,
            stats: toWrite
        };
    }

    async getLocalCids() {
        const cids = [];
        for await (const { cid, type } of ipfs.pin.ls()) {
            cids.push(cid.toString());
        }

        return cids;
    }

    async clearRepo() {
        for await (const { cid, type } of ipfs.pin.ls({ type: 'recursive' })) await ipfs.pin.rm(cid);
        for await (const res of ipfs.repo.gc());
        let stats = await ipfs.repo.stat({ human: true });
        console.log('Cleared my ipfs repo');
    }
}


module.exports = IpfsBase;
