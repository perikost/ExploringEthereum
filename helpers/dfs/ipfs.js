const { create, globSource } = require('ipfs-http-client');
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
        timeout: 60000
    }
};

class IpfsBase {
    name = 'ipfs';
    options;
    csv;
    ipfs;
    nodeId;

    constructor(opts) {
        // merge the defaultOptions with the input options
        this.options = utils.core.getOptions(opts, OPTIONS, true);
        this.ipfs = create('http://localhost:5001');
    }

    async getId() {
        return this.nodeId || this.ipfs.id().then(res => {
            this.nodeId = res.id;
            return res.id;
        });
    }

    // TODO: Currently this function has only been tested with strings. Ensure that other data types are handled as well.
    async upload(data, opts = null) {
        const localOptions = utils.core.getOptions(opts, this.options);

        // measure upload latency
        const begin = performance.now();
        const uploaded = await this.ipfs.add(data, localOptions.uploadOptions);
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
        for await (const chunk of this.ipfs.cat(cid, localOptions.downloadOptions)) chunks.push(chunk);
        const retrievalLatency = (performance.now() - begin).toFixed(4);

        // get ipfs-object's stats and convert data to string (if applicable)
        const objectStats = await this.ipfs.object.stat(cid);
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
        for await (const { cid, type } of this.ipfs.pin.ls()) {
            cids.push(cid.toString());
        }

        return cids;
    }

    async removeFromRepo(cid) {
        try {
            await this.ipfs.pin.rm(cid);
        } catch (error) {
            // pin.rm() will fail if the cid isn't pinned.
            // In that case pass and run garbage collection to remove the item (if it's cached)
        }
        await this.clearCache();
    }

    async clearCache() {
        for await (const removedDag of this.ipfs.repo.gc()) {
            if (removedDag.err) console.warn(`Dag ${removedDag.cid.toString()} could not be removed`);
        }
    }

    async clearRepo() {
        const statsBefore = await this.ipfs.repo.stat();
        for await (const { cid, type } of this.ipfs.pin.ls({ type: 'recursive' })) await this.ipfs.pin.rm(cid);
        await this.clearCache();

        // log the accumulative size of the deleted data
        const statsAfter = await this.ipfs.repo.stat();
        const diff = Number(statsBefore.repoSize - statsAfter.repoSize);
        const stringDiff = (diff < 1024 ** 2)
            ? `${(diff / 1024).toFixed(2)}kb`
            : `${(diff / 1024 ** 2).toFixed(2)}mb`;
        console.log(`Cleared my ipfs repo. Deleted approximately ${stringDiff}`);
    }

    async findContentProvs(cid, timeout = 60000) {
        const providers = [];
        try {
            const myIdentity = await this.getId();
            const queryEvents = this.ipfs.dht.findProvs(cid, {timeout: timeout});

            for await (const event of queryEvents) {
                if (event.name === 'PROVIDER' && event.type === 4) {
                    for (const provider of event.providers) {
                        if (myIdentity !== provider.id) providers.push(provider.id);
                    }
                }
            }
        } catch (error) {
            // pass
        }
        return providers;
    }

    async disconnectFromPeer(peerId, timeout = 6000) {
        try {
            const peerInfos = await this.ipfs.swarm.peers({timeout: timeout});
            const connected = peerInfos.find(peer => peer.peer === peerId);

            if (connected) {
                await this.ipfs.swarm.disconnect(connected.addr.toString() + '/p2p/' + connected.peer);
                console.log('Disconnected from peer: ', peerId);
            } else {
                console.log('Not connected to peer: ', peerId);
            }
        } catch (error) {
            console.log('Could not disconnect from peer', peerId);
        }
    }

    async disconnectFromContentProvs(cid) {
        const providers = await this.findContentProvs(cid);

        for (const provider of providers) {
            await this.disconnectFromPeer(provider);
        }
    }
}


module.exports = IpfsBase;
