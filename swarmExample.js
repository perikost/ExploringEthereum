const swarm = require('./helpers/swarmModule.js');
const utils = require('./helpers/utils.js');


async function uploadToSwarm(input){
    if(!input) return;
    
    let name = `string${input.length}`;
    let hash = await swarm.uploadText(input);

    console.log(`${name} uploaded. hash : ${hash}`);
}


async function uploadStr({step = 1, maxStringSize = 5} = {}){

    let i = 1;
    while(true){
        let input;
        if(i >= maxStringSize) {
            input = utils.basics.getRandomString(maxStringSize);
            await uploadToSwarm(input);
            break;
        }
        
        input = utils.basics.getRandomString(i);
        await uploadToSwarm(input);
        i += step;
    }
}


// TEST
(async function(){
    await swarm.configPostageBatch();
    await uploadStr({ step: 2});
    let hashes = utils.dfs.getIdentifiers('swarm');
    await swarm.retrieveAllTexts(hashes);
})();