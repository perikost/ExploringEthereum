const IPFS = require('./helpers/dfs/ipfs');
const ipfs = new IPFS()

ipfs.clearRepo().catch(console.log)
