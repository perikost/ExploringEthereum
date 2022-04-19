const blockchain = require('./helpers/ropstenModule.js');
const {CID} = require('multiformats/cid')
const utils = require('./helpers/utils.js');

(async function(){
    let web3 = utils.web3;
    let contract = utils.getContracts(['DFS'])[0];
    blockchain.loadBlockchain({provider: 'infura'});
    blockchain.config(contract);

    let cids = ['QmSnuWmxptJZdLJpKRarxBMS2Ju2oANVrgbr2xWbie9b2D', CID.parse('QmSnuWmxptJZdLJpKRarxBMS2Ju2oANVrgbr2xWbie9b2D').toV1().toString()];

    for(const cid of cids){
        let inspectedCid =  utils.inspectCid(cid);

        await blockchain.executeFunction('storeCid', {
        values: [inspectedCid.digest, web3.utils.leftPad(inspectedCid.multihashCode, 16), web3.utils.leftPad(inspectedCid.digestSize, 16), web3.utils.leftPad(inspectedCid.codec, 16), web3.utils.leftPad(inspectedCid.version, 16)]
        });
        await blockchain.executeFunction('storeCidUint', {
            values: [inspectedCid.digest, web3.utils.toNumber(inspectedCid.multihashCode), web3.utils.toNumber(inspectedCid.digestSize), web3.utils.toNumber(inspectedCid.codec), web3.utils.toNumber(inspectedCid.version)]
        });
        await blockchain.executeFunction('storecompleteCid', {
            values: [cid]
        });
        await blockchain.executeFunction('storeHashDigest', {
            values: [inspectedCid.digest]
        });
        await blockchain.executeFunction('logCompleteCid', {
            values: [cid]
        });
        await blockchain.executeFunction('logSelfDescribedCid', {
            values: [inspectedCid.digest, inspectedCid.multihashCode, inspectedCid.digestSize, inspectedCid.codec, inspectedCid.version]
        });
        await blockchain.executeFunction('reset');
    }
})();