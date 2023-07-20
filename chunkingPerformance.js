const { create } = require('ipfs-http-client');
const { CID } = require('multiformats/cid')
const { sha256 } = require('multiformats/hashes/sha2');
const bmt = require('@fairdatasociety/bmt-js');
const performance = require('perf_hooks').performance;
const utils = require('./helpers/utils');
const ipfsBase = require('./helpers/dfs/ipfs');
const ipfs = create('http://localhost:5001')

const enc = new TextEncoder(); 

function swarmChunkerLatency(data) {
    const begin = performance.now()
    const chunkedFile = bmt.makeChunkedFile(enc.encode(data))
    const latency = performance.now() - begin;

    // console.log(`Swarm hash: ${bmt.Utils.bytesToHex(chunkedFile.address(), 64)} latency: ${latency.toFixed(4)}`)

    return latency;
}

async function createCid(data, version = 1, contentTypeCodec = 112) {
    const hash = await sha256.digest(typeof data === 'string' ? enc.encode(data) : data)
    return CID.create(version, contentTypeCodec, hash)
}

// content-type = 112 results in dag-pb encoded nodes
async function cidLatency(data, version = 1, contentTypeCodec = 112) {
    const begin = performance.now()
    const cid = createCid(data, version, contentTypeCodec)
    const latency = performance.now() - begin;

    // console.log(`CID v${version}: ${cid.toString()} latency: ${latency.toFixed(4)}`)

    return latency;
}

async function ipfsChunkerLatency(data, version = 1, chunker = 'size-262144') {
    const options = {
        cidVersion: version,
        chunker: chunker,
        onlyHash: true
    }

    const begin = performance.now()
    const result = await ipfs.add(data, options)
    const latency = performance.now() - begin;

    // console.log(`CID v${version}: ${result.cid.toString()} latency: ${latency.toFixed(4)}`)

    return latency;
}

// TODO: this is really sloppy. find a proper solution
async function customIpfsChunkerLatency(data) {
    const { Uint8ArrayList } = await import('uint8arraylist');
    const cids = [];

    const begin = performance.now()
    for await (const chunk of ipfsBase.chunk(enc.encode(data), { Uint8ArrayList })) {
        cids.push(await createCid(chunk));
    }
    // ipfs link nodes can have (if i remember correctly) up to 174 links to child nodes
    // in our tests we have a maximum of 16mb = 64 chunks which fit in one link node
    // so one more cid should be calculated
    await createCid(cids.join())
    const latency = performance.now() - begin;

    return latency
}

const sizes = ['4kb', '16kb', '64kb', '256kb', '1mb', '4mb', '16mb'].map(size => utils.core.byteSize(size));
const average = arr => arr.reduce((a, b) => a + b, 0) / arr.length;

(async () => {

    // run 20 times for each size and calculate the average.
    for (let size of sizes) {
        let bmtResults = [];
        let cidCustomResults = [];
        let cidResults = [];
        for (let i = 0; i < 20; i++) {
            // generate random data of the given size.
            const data = utils.core.getRandomString(size);

            bmtResults.push(swarmChunkerLatency(data));
            cidResults.push(await ipfsChunkerLatency(data));
            cidCustomResults.push(await customIpfsChunkerLatency(data));
        }

        console.log(`Average Swarn chunker latency for size ${size}: `, average(bmtResults));
        console.log(`Average IPFS custom chunker latency for size ${size}: `, average(cidCustomResults));
        console.log(`Average IPFS chunker latency for size ${size} (go-implementation) : `, average(cidResults));
        console.log()
    }
})();
