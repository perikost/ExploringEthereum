const Web3 = new require('web3');
const web3 = new Web3();

const fs = require('fs');
const path = require('path')

const filePath = process.argv[2]
const pass = process.argv[3]

const account = JSON.parse(fs.readFileSync(filePath));
const { address, privateKey } = web3.eth.accounts.decrypt(account, pass);

const dir = path.dirname(filePath)
const decryptedPath = path.join(dir, 'decrypted');

let data = "Private Key: " + privateKey + '\n';
data += "Address: " + address + '\n';

fs.writeFileSync(decryptedPath, data)
