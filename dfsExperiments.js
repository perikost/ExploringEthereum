const blockchain = require('./helpers/ropstenModule.js');
const {CID} = require('multiformats/cid')
const utils = require('./helpers/utils.js');

(async function(){
    let web3 = utils.web3;
    let contract = utils.getContracts(['DFS'])[0];
    blockchain.loadBlockchain({provider: 'infura'});
    blockchain.config(contract);

    let cids = ['QmSnuWmxptJZdLJpKRarxBMS2Ju2oANVrgbr2xWbie9b2D', CID.parse('QmSnuWmxptJZdLJpKRarxBMS2Ju2oANVrgbr2xWbie9b2D').toV1().toString()];

    for(const [index, cid] of cids.entries()){
        let inspectedCid =  utils.inspectCid(cid);

        if(index == 0){
            await blockchain.executeFunction('storeCid', {
                values: [inspectedCid.digest, '0x0000000000000000', '0x0000000000000000', '0x0000000000000000', '0x0000000000000000']
                });
            await blockchain.executeFunction('storeCid0', {
                values: [cid]
            });
            await blockchain.executeFunction('logCid0', {
                values: [cid]
            });

            await blockchain.executeFunction('logSelfDescribedCid', {
                values: [inspectedCid.digest, '0x0000000000000000', '0x0000000000000000', '0x0000000000000000', '0x0000000000000000']
            });

        }else{
            await blockchain.executeFunction('storeCid', {
                values: [inspectedCid.digest, web3.utils.leftPad(inspectedCid.multihashCode, 16), web3.utils.leftPad(inspectedCid.digestSize, 16), web3.utils.leftPad(inspectedCid.codec, 16), web3.utils.leftPad(inspectedCid.version, 16)]
                });
                await blockchain.executeFunction('storeCid1', {
                    values: [cid]
                });
                await blockchain.executeFunction('logCid1', {
                    values: [cid]
                });

                await blockchain.executeFunction('logSelfDescribedCid', {
                    values: [inspectedCid.digest, web3.utils.leftPad(inspectedCid.multihashCode, 16), web3.utils.leftPad(inspectedCid.digestSize, 16), web3.utils.leftPad(inspectedCid.codec, 16), web3.utils.leftPad(inspectedCid.version, 16)]
                });
        }
        
        await blockchain.executeFunction('storeHashDigest', {
            values: [inspectedCid.digest]
        });
        await blockchain.executeFunction('logHashDigest', {
            values: [inspectedCid.digest]
        });
        await blockchain.executeFunction('reset');
    }

    await blockchain.executeFunction('storeSwarmHash', {
        values: ['0x21624c1e27c5af68e04998de88178af3dfc7b38e535ecea33f56d5a83d68974a']
    });

    await blockchain.executeFunction('storeSwarmHashEncrypted', {
        values: ['0xd7d23dda5319605b3cc5a3d814377bbd270fd2b50ba7475ad34eae6313107e3c47e6233a7ec590749b4d429b25ac45bd54f83c764eb18395e1ec5f2edb9a73c5']
    });

    await blockchain.executeFunction('logSwarm', {
        values: ['0x21624c1e27c5af68e04998de88178af3dfc7b38e535ecea33f56d5a83d68974a']
    });

    await blockchain.executeFunction('logSwarmEncrypted', {
        values: ['0xd7d23dda5319605b3cc5a3d814377bbd270fd2b50ba7475ad34eae6313107e3c47e6233a7ec590749b4d429b25ac45bd54f83c764eb18395e1ec5f2edb9a73c5']
    });
    
})();