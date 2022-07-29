const ipfs = require('./helpers/ipfsModule.js');
const utils = require('./helpers/utils.js');
const csv = require('./helpers/csvModule.js')


async function uploadStrings({clearRepo = false, start = 4, step = 4, maxStringSize = 16384} = {}){

    if(clearRepo) await ipfs.clearRepo();
    await utils.core.sleep(2)

    for(const value of utils.core.getRandomStrings({start: 4*1024, step: 4, maxStringSize: 16*1024*1024})){
        let name = `string${value.length / 1024}`;
        let cid = await ipfs.uploadText(value);
        console.log(`${name} uploaded. CID : ${cid}`);
    }
}

async function loopUpload(times){
    for(let i = 0; i < times; i++){
        await uploadStrings();
    }
}


/* // uncomment to run the experiments
(async() =>{
    // upload
    await loopUpload(20);

    // retrieve
    let cids = utils.dfs.getIdentifiers('ipfs');
    await ipfs.retrieveAllTexts(cids, 20);
})(); */

// uncomment to compute average retrieval latency of a folder's csv records
// csv.average('csv_records/27-03-2022/')