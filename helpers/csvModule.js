const fs = require('fs');
const utils = require('./utils.js');
const eventHeaders = ['Date','Total Events','ID', 'Type', 'Size (Bytes)', 'Retrieval Time (ms)','Decoding Time (ms)', 'Total Time (ms)\n'];
const indexedEventHeaders = ['Date','ID', 'Type', 'Size (Bytes)', 'Retrieval Time (ms)','Decoding Time (ms)', 'Total Time (ms)\n'];
const storageHeaders = ['Date','Type', 'Size (Bytes)','Retrieval Time (ms)\n'];
const executeHeaders = ['Transaction Hash', 'Date','Type', 'Size (Bytes)', 'Cost (gas)', 'Execution Time (ms)\n'];

const HEADERS = {
    blockchain:{
        execute :executeHeaders ,
        retrieveStorage : storageHeaders,
        retrieve_Events : eventHeaders,
        retrieve_Indexed_Events : indexedEventHeaders,
        retrieve_Anonymous_Events : ['Date','ID', 'Type', 'Size (Bytes)', 'Retrieval Time (ms)','Decoding Time (ms)', 'Total Time (ms)\n'],
        retrieve_txData : ['Date', 'Type', 'Size (Bytes)', 'Retrieval Time (ms)\n']
    },
    ipfs:{
        upload : ['CID', 'Date','Size (Bytes)', 'Upload Time (ms)\n'],
        retrieve : ['Date', 'Size (Bytes)', 'Retrieval Time (ms)\n'],
        upload_blockchain : executeHeaders,
        retrieve_Storage : storageHeaders,
        retrieve_Storage_All : ['Date','ID','Type', 'Size (Bytes)','Retrieval Time (ms)\n'],
        retrieve_Events : eventHeaders,
        retrieve_Indexed_Events : indexedEventHeaders
    },
    swarm:{
        upload : ['Hash', 'Date','Size (Bytes)', 'Upload Time (ms)\n'],
        retrieve : ['Date', 'Size (Bytes)', 'Retrieval Time (ms)\n'],
        upload_blockchain : executeHeaders,
        retrieve_Storage : storageHeaders,
        retrieve_Storage_All : ['Date','ID','Type', 'Size (Bytes)','Retrieval Time (ms)\n'],
        retrieve_Events : eventHeaders,
        retrieve_Indexed_Events : indexedEventHeaders
    }
}


function readCsvAsArray (path){
    let outer = [];
    let csv = fs.readFileSync(path, 'utf8');

    if(csv.includes('\r\n')) csv = csv.split('\r\n');   // windows line break https://stackoverflow.com/questions/3821784/whats-the-difference-between-n-and-r-n
    else if(csv.includes('\n')) csv = csv.split('\n'); // linux line break

    for (var i = 0; i < csv.length-1; i++) {
        let line = csv[i];
        line = line.split(',');

        outer.push(line);
    }
    return outer;
};


function average(csv, path) {
    let avrg = Object();
    let headers = csv[0];
    csv = csv.slice(1);

    for (var i = 0; i < headers.length; i++) {
        header = headers[i];

        if(header.includes('Retrieval') || header.includes('Decoding') || header.includes('Total Time') || header.includes('Upload') ){
            avrg[header] = Object();
            avrg[header]['sum'] = 0;
            avrg[header]['index'] = i;
        }
    }

    for(var line of csv){
        for(var key of Object.keys(avrg)){
            avrg[key].sum = Number(avrg[key].sum) + Number(line[avrg[key].index]);
        }
    }

    let splitPath = path.split('/');
    let csvName = splitPath[splitPath.length - 1];
    fs.appendFileSync('C:/Users/perik/Desktop/For Paper/all.csv', '\n' + csvName + '\n');

    for(var key of Object.keys(avrg)){
        avrg[key].sum /= csv.length;
        let toWrite = [key, avrg[key].sum]

        fs.appendFileSync(path, toWrite.toString() + '\n');
        fs.appendFileSync('C:/Users/perik/Desktop/For Paper/all.csv', toWrite.toString() + '\n');
    }
}


function _average(path){
    const items = fs.readdirSync(path);

    for(var item of items){
        pathToItem = path + '/' + item;
        if(fs.lstatSync(pathToItem).isDirectory()) {
            console.log(item, "directory");
            _average(pathToItem);
        }
        else {
            let csv = readCsvAsArray(pathToItem);
            average(csv, pathToItem);
        }
    }
}


function _write(toWrite, platform, mode, csvName, conName){
    let folder = './csv_records/Contracts/';
    let file;


    if (platform == 'blockchain' || mode == 'upload_blockchain'){
        folderPath = './csv_records/Contracts/';
        if(conName) folder += `${conName}/`;
        folder += `${mode}/`;
        file = folder + `${csvName}.csv`;
    }else if ((platform == 'ipfs' || platform == 'swarm')){
        // TODO: save to Contracts.....pass con.name in ipfs-swarmRopsten
        csvPath = folderPath + `${mode}.csv`;
    }else{
        throw 'Error : Unefined platform';
    }

    let headers = HEADERS[platform][mode];
    // toWrite.unshift(fileName) to push something in the begining. Used to write extra field in swarm

    if(!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
    if(!fs.existsSync(file)) fs.writeFileSync(file, headers.toString());

    fs.appendFileSync(file, toWrite.toString() + '\n');
}


module.exports = {
    write : _write,
    readCsvAsArray : readCsvAsArray,
    // differentiate : _differentiate,
    average : _average
};
