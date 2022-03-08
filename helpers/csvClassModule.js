const fs = require('fs');
const path = require('path');
const assert = require('assert');
const utils = require('./utils.js');
const prompt = require('prompt-sync')({sigint: true});
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
        upload : ['Date', 'CID', 'Size in Repo(Bytes)', 'True Size(Bytes)', 'Upload Time (ms)\n'],
        retrieve : ['Date', 'Size in Repo(Bytes)', 'True Size(Bytes)', 'Retrieval Time (ms)\n'],
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


class _CSV {

    constructor(rootFolder = './csv_records'){
        this.rootFolder = chooseRootFolder(rootFolder);
        // console.log(this.folderPath);
        if(!this.rootFolder) this.rootFolder = createRootFolder(rootFolder);
        addNote(this.rootFolder);
    }

    writeStats(toWrite, platform, mode, csvName, conName){
        this.platform = platform;
        this.mode = mode;
        this.folderPath = this.rootFolder;

        if (platform == 'blockchain' || mode == 'upload_blockchain'){
            if(conName) this.folderPath = path.join(this.folderPath, 'Contracts', conName)
            
            this.folderPath = path.join(this.folderPath, mode)
            this.csvPath = path.join(this.folderPath, `${csvName}.csv`);
        }else if (platform == 'ipfs' || platform == 'swarm'){
            // TODO: save to Contracts.....pass con.name in ipfs-swarmRopsten
            this.folderPath = path.join(this.folderPath, platform, mode)
            this.csvPath = path.join(this.folderPath, `${csvName}.csv`);
        }else{
            throw 'Error : Unefined platform';
        }

        this.write(toWrite);
    }

    write(toWrite){
        let headers = HEADERS[this.platform][this.mode];
        // toWrite.unshift(fileName) to push something in the begining. Used to write extra field in swarm

        if(!fs.existsSync(this.folderPath)) fs.mkdirSync(this.folderPath, { recursive: true });
        if(!fs.existsSync(this.csvPath)) fs.writeFileSync(this.csvPath, headers.toString());

        fs.appendFileSync(this.csvPath, toWrite.toString() + '\n');
    }
}


function chooseRootFolder(rootFolder){
    const folders = fs.existsSync(rootFolder)? fs.readdirSync(rootFolder) : null;
    if(!folders) return null;

    console.log('');
    let add = prompt('Would you like to add the csv records to a previous folder (y/n)? ');
    if(add == 'y'){

        console.log('Previous folders:');
        for(let [index, folder] of folders.entries()){
            console.log(`(${index}) `, folder);
        }
        
        console.log('');
        let choice = Number(prompt('Choose folder '));
    
        if (choice >=0 && choice <= folders.length) return path.join(rootFolder, folders[choice]);
        else{
            console.log('Chosen folder out of bounds. Csv records will be added in a new folder.');
            return null;
        }
        
    }

    console.log('Csv records will be added in a new folder.');
    return null;
}

function createRootFolder(rootFolder){
    rootFolder = path.join(rootFolder, new Date().toLocaleDateString('pt-PT').replaceAll('/', '-'))
    if(!fs.existsSync(rootFolder)){
        fs.mkdirSync(rootFolder, { recursive: true });
        return rootFolder;
    }
    
    count = 0;
    let temp = rootFolder + `_${count}`;
    while(fs.existsSync(temp)){
        count++;
        temp = rootFolder + `_${count}`;
    }
    
    fs.mkdirSync(temp, { recursive: true });
    return temp;
}

function addNote(folder){
    assert(fs.existsSync(folder), 'Csv root folder not found');
    file = path.join(folder, 'Notes.txt')

    console.log('');
    let add = prompt('Would you like to add a note in the csv folder (y/n)? ');
    if(add == 'y'){
        if(fs.existsSync(file)){
            let notes = readLines(file);
            console.log('Your previous notes: \n');
            for(let note of notes){
                console.log(note);
            }
        }

        let note = prompt('Please type your note...  ');
        if(note){
            note = new Date().toString() + '\t' + note;
            fs.appendFileSync(file, note + '\n');
        }
    }
    

}

function readLines (filePath){
    let csv = fs.readFileSync(filePath, 'utf8');

    if(csv.includes('\r\n')) csv = csv.split('\r\n');   // windows line break https://stackoverflow.com/questions/3821784/whats-the-difference-between-n-and-r-n
    else if(csv.includes('\n')) csv = csv.split('\n'); // linux line break

    return csv;
}

function readCsvAsArray (filePath){
    let outer = [];
    let csv = fs.readFileSync(filePath, 'utf8');

    if(csv.includes('\r\n')) csv = csv.split('\r\n');   // windows line break https://stackoverflow.com/questions/3821784/whats-the-difference-between-n-and-r-n
    else if(csv.includes('\n')) csv = csv.split('\n'); // linux line break

    for (var i = 0; i < csv.length-1; i++) {
        let line = csv[i];
        line = line.split(',');

        outer.push(line);
    }
    return outer;
}


function average(csv, filePath) {
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

    let splitPath = filePath.split('/');
    let csvName = splitPath[splitPath.length - 1];
    fs.appendFileSync('C:/Users/perik/Desktop/For Paper/all.csv', '\n' + csvName + '\n');

    for(var key of Object.keys(avrg)){
        avrg[key].sum /= csv.length;
        let toWrite = [key, avrg[key].sum]

        fs.appendFileSync(filePath, toWrite + '\n');
        fs.appendFileSync('C:/Users/perik/Desktop/For Paper/all.csv', toWrite.toString() + '\n');
    }
}


function _average(filePath){
    const items = fs.readdirSync(filePath);

    for(var item of items){
        pathToItem = filePath + '/' + item;
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


module.exports = {
    CSV : _CSV,
    average : _average,
    readCsvAsArray : readCsvAsArray
};
