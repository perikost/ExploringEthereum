const utils = require('./helpers/utils.js');
const csv = require('./helpers/csvModule.js')
const { IpfsExperiment } = require('./helpers/dfs/experiments');
    

(async() =>{
    const ipfs = new IpfsExperiment({keepStats: true});

    // upload
    await ipfs.loopUpload(2);

    // retrieve
    const cids = utils.dfs.getIdentifiers('ipfs');
    await ipfs.loopDownload(cids, 2);
})();

// uncomment to compute average retrieval latency of a folder's csv records
// csv.average('csv_records/27-03-2022/')
