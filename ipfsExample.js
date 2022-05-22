const ipfs = require('./helpers/ipfsModule.js');
const utils = require('./helpers/utils.js');


async function uploadToIPFS(input){
    if(!input) return;
    
    let name = `string${input.length}`;
    let cid = await ipfs.uploadText(input);

    console.log(`${name} uploaded. CID : ${cid}`);
}


async function uploadStr({clearRepo = false,  step = 1, maxStringSize = 5} = {}){
    if(clearRepo) await ipfs.clearRepo();
    await utils.basics.sleep(2)

    let i = 1;
    while(true){
        let input;
        if(i >= maxStringSize) {
            input = utils.basics.getRandomString(maxStringSize);
            await uploadToIPFS(input);
            break;
        }
        
        input = utils.basics.getRandomString(i);
        await uploadToIPFS(input);
        i += step;
    }
}


// TEST
(async function(){
    await uploadStr({ clearRepo: true, step: 2 })
    let cids = utils.dfs.getIdentifiers('ipfs');
    await ipfs.retrieveAllTexts(cids)
})();