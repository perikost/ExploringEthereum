const ipfs = require('./helpers/ipfsModule.js');
const utils = require('./helpers/utils.js');
const csv = require('./helpers/csvClassModule.js')


async function uploadToIPFS(input){
    if(!input) return;
    
    let name = `string${input.length}`;
    let cid = await ipfs.uploadText(input);

    console.log(`${name} uploaded. CID : ${cid}`);
}


async function uploadStrings({clearRepo = false, start = 4, step = 4, maxStringSize = 16384} = {}){

    if(clearRepo) await ipfs.clearRepo();
    await utils.basics.sleep(2)

    let i = start * 1024;
    maxStringSize *= 1024;
    while(true){
        let input;
        if(i >= maxStringSize) {
            input = utils.basics.getRandomString(maxStringSize);
            await uploadToIPFS(input);
            break;
        }
        
        input = utils.basics.getRandomString(i);
        await uploadToIPFS(input);
        i *= step;
    }
}

async function loopUpload(times){
    for(let i = 0; i < times; i++){
        await uploadStrings()
    }
}


// uncomment to run the experiments
// (async() =>{
//     // upload
//     await loopUpload(20);

//     // retrieve
//     let cids = utils.dfs.getIdentifiers('ipfs');
//     await ipfs.retrieveAllTexts(cids, 20);
// })();

// uncomment to compute average retrieval latency of a folder's csv records
// csv.average('csv_records/27-03-2022/')