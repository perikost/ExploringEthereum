const blockchain = require('./helpers/ropstenModule.js');
const {CID} = require('multiformats/cid')
const utils = require('./helpers/utils.js');

let web3 = utils.web3;
let contract = utils.blockchain.getContracts(['DFS'])[0];
contract.contractAddress = '0xB063386CB6D596a2f1BCa37C8C13e00cd2A03C9F'
blockchain.loadBlockchain('localhost', {keepStats: true, fork: 'muirGlacier', chain: 'ganache'});
blockchain.config(contract, {
    debug : true,
    keepStats: true
});


async function storeCid0(cid, cleanStorage = true){
    let inspectedCid =  utils.dfs.inspectCid(cid);
    if(cleanStorage && await blockchain.isStorageDirty(['cid', 'cid0', 'hashDigest'])) await blockchain.executeFunction('reset');

    await blockchain.executeSpecificFunctions({
        storeCid: [inspectedCid.digest, '0x0000000000000000', '0x00000000', '0x00000000', '0x0000000000000000', '0x0000000000000000'],
        storeCid0: [cid],
        logCid0: [cid],
        logSelfDescribedCid: [inspectedCid.digest, '0x0000000000000000', '0x00000000', '0x00000000', '0x0000000000000000', '0x0000000000000000'],
        storeHashDigest: [inspectedCid.digest],
        logHashDigest: [inspectedCid.digest]
    }, null);
}

async function storeCid1(cid, cleanStorage = true){
    cid = CID.parse(cid);
    cid = cid.version === 1 ? cid.toString(): cid.toV1().toString();
    
    let inspectedCid =  utils.dfs.inspectCid(cid);
    if(cleanStorage && await blockchain.isStorageDirty(['cid', 'cid1'])) await blockchain.executeFunction('reset');

    await blockchain.executeSpecificFunctions({
        storeCid: [inspectedCid.digest, web3.utils.leftPad(inspectedCid.multihashCode, 16), web3.utils.leftPad(inspectedCid.digestSize, 8), web3.utils.leftPad(inspectedCid.base, 8), web3.utils.leftPad(inspectedCid.codec, 16), web3.utils.leftPad(inspectedCid.version, 16)],
        storeCid1: [cid],
        logCid1: [cid],
        logSelfDescribedCid: [inspectedCid.digest, web3.utils.leftPad(inspectedCid.multihashCode, 16), web3.utils.leftPad(inspectedCid.digestSize, 8), web3.utils.leftPad(inspectedCid.base, 8), web3.utils.leftPad(inspectedCid.codec, 16), web3.utils.leftPad(inspectedCid.version, 16)]
    }, false);
}

async function storeSwarmHash(hash, encryptedHash = null, cleanStorage = true){
    if(cleanStorage && await blockchain.isStorageDirty(['swarmHash', 'swarmHashEncrypted'])) await blockchain.executeFunction('reset');

    await blockchain.executeSpecificFunctions({
        storeSwarmHash: [hash],
        logSwarm: [hash]
    }, false);

    if(encryptedHash){
        await blockchain.executeSpecificFunctions({
            storeSwarmHashEncrypted: [encryptedHash],
            logSwarmEncrypted: [encryptedHash]
        }, false);
    }
}

// uncomment to run the experiments
(async function(){
    await storeCid0('QmSnuWmxptJZdLJpKRarxBMS2Ju2oANVrgbr2xWbie9b2D');
    await storeCid1('QmSnuWmxptJZdLJpKRarxBMS2Ju2oANVrgbr2xWbie9b2D');
    // await storeSwarmHash('0x21624c1e27c5af68e04998de88178af3dfc7b38e535ecea33f56d5a83d68974a', '0xd7d23dda5319605b3cc5a3d814377bbd270fd2b50ba7475ad34eae6313107e3c47e6233a7ec590749b4d429b25ac45bd54f83c764eb18395e1ec5f2edb9a73c5');
})();
