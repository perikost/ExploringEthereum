const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const prompt = require('prompt-sync')({sigint: true});
const utils = require('./utils');
const Logger = require('./logger');
const logger = new Logger()
const eventHeaders = ['Date','Total Events','ID' , 'Retrieval Time All (ms)', 'Retrieval Time Specific (ms)', 'Decoding Time (ms)', 'Total Time (ms)'];
const indexedEventHeaders = ['Date', 'Total Events', 'ID' , 'Retrieval Time (ms)','Decoding Time (ms)', 'Total Time (ms)'];
const storageHeaders = ['Date','Retrieval Time (ms)'];
const executeHeaders = ['Transaction Hash', 'Date', 'Cost (gas)', 'Execution Time (ms)'];

const HEADERS = {
    blockchain:{
        execute :executeHeaders ,
        retrieveStorage : storageHeaders,
        retrieve_Events : eventHeaders,
        retrieve_Indexed_Events : indexedEventHeaders,
        retrieve_Anonymous_Events : ['Date', 'Total Events', 'ID' , 'Retrieval Time (ms)','Decoding Time (ms)', 'Total Time (ms)'],
        retrieve_txData : ['Date' , 'Retrieval Time (ms)']
    },
    ipfs:{
        upload : ['Date', 'CID', 'Upload Time (ms)', 'Size in Repo(Bytes)'],
        retrieve : ['Date', 'Retrieval Time (ms)', 'Size in Repo(Bytes)'],
        upload_blockchain : executeHeaders,
        retrieve_Storage : storageHeaders,
        retrieve_Storage_All : ['Date','ID','Retrieval Time (ms)'],
        retrieve_Events : eventHeaders,
        retrieve_Indexed_Events : indexedEventHeaders
    },
    swarm:{
        upload : ['Date', 'Hash', 'Upload Time (ms)'],
        retrieve : ['Date', 'Retrieval Time (ms)'],
        upload_blockchain : executeHeaders,
        retrieve_Storage : storageHeaders,
        retrieve_Storage_All : ['Date','ID','Retrieval Time (ms)'],
        retrieve_Events : eventHeaders,
        retrieve_Indexed_Events : indexedEventHeaders
    }
}


class CSV {

    constructor(rootFolder = './csv_records'){
        this.rootFolder = chooseRootFolder(rootFolder);
        if(!this.rootFolder) this.rootFolder = createRootFolder(rootFolder);
        addNote(this.rootFolder);
    }

    writeStats(toWrite, network, mode, csvName, conName = null, subfolder = null){
        logger.debug(`Successfully executed  |${csvName}|`);

        network = network.toLowerCase();
        this.network = network;
        this.mode = mode;
        this.folderPath = this.rootFolder;

        if (network == 'blockchain' || mode == 'upload_blockchain'){
            if(conName) this.folderPath = path.join(this.folderPath, 'Contracts', conName)
            
            this.folderPath = subfolder
                ? path.join(this.folderPath, mode, subfolder)
                : path.join(this.folderPath, mode)
            this.csvPath = path.join(this.folderPath, `${csvName}.csv`);
        }else if (network == 'ipfs' || network == 'swarm'){
            this.folderPath = subfolder
                ? path.join(this.folderPath, network, mode, subfolder)
                : path.join(this.folderPath, network, mode)
            this.csvPath = path.join(this.folderPath, `${csvName}.csv`);
        }else{
            throw 'Error : Undefined network';
        }

        this.setStatsAndHeaders(toWrite)
        this.write();
        return this.folderPath;
    }

    setStatsAndHeaders(toWrite){
        this.headers = JSON.parse(JSON.stringify(HEADERS[this.network][this.mode]));
        this.toWrite = (toWrite && (toWrite.basic || (toWrite.length && toWrite))) || Array(this.headers.length).fill('-');

        if(toWrite && toWrite.inputInfo) {
            toWrite.inputInfo.forEach(param => {
                this.headers.push('Type', 'Size (Bytes)');
                this.toWrite.push(param.type, param.size);
            })
        }
    }

    write(){
        // let headers = HEADERS[this.network][this.mode];
        // toWrite.unshift(fileName) to push something in the begining. Used to write extra field in swarm

        if(!fs.existsSync(this.folderPath)) fs.mkdirSync(this.folderPath, { recursive: true });
        if(!fs.existsSync(this.csvPath)) fs.writeFileSync(this.csvPath, this.headers.toString() + os.EOL);

        fs.appendFileSync(this.csvPath, this.toWrite.toString() + os.EOL);
    }
}


function chooseRootFolder(rootFolder){
    const folders = fs.existsSync(rootFolder)? fs.readdirSync(rootFolder) : null;
    // if folders, sort them by year-month-day (asc)
    if(!folders || folders.length == 0) return null;
    else {
        let year = str => str.substring(6,10);
        let month = str => str.substring(3,5);
        let day = str => str.substring(0,2);
        
        folders.sort((a,b) => {
            if(year(a) > year(b)) return 1;
    
            if (year(a) === year(b)){
                if(month(a) > month(b)) return 1;
                if (month(a) === month(b)){
                    if (day(a) > day(b)) return 1;
                }
            }
    
            return -1;
        });
    }
    // else folders.sort((a,b) => a.substring(3,10) > b.substring(3,10) ? 1 : -1);

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
            logger.info('Chosen folder out of bounds. Csv records will be added in a new folder.');
            return null;
        }
        
    }

    logger.info('Csv records will be added in a new folder.');
    return null;
}

function createRootFolder(rootFolder){
    rootFolder = path.join(rootFolder, new Date().toLocaleDateString('pt-PT').replace(/\//g, '-'))
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

        let note = prompt('Peaseyour note...  ');
        if(note){
            note = new Date().toString().slice(0,24) + '\t' + note;
            fs.appendFileSync(file, note + os.EOL);
        }
    }
    

}

function readLines (filePath){
    let csv = fs.readFileSync(filePath, 'utf8');

    if(csv.includes('\r\n')) csv = csv.split('\r\n');   // windows line break https://stackoverflow.com/questions/3821784/whats-the-difference-between-n-and-r-n
    else if(csv.includes('\n')) csv = csv.split('\n'); // linux line break

    return csv;
}

function readCsvAsArray (filePath, start = 0){
    let outer = [];
    let csv = fs.readFileSync(filePath, 'utf8');

    if(csv.includes('\r\n')) csv = csv.split('\r\n');   // windows line break https://stackoverflow.com/questions/3821784/whats-the-difference-between-n-and-r-n
    else if(csv.includes('\n')) csv = csv.split('\n'); // linux line break

    for (var i = 0; i < csv.length-1; i++) {
        let line = csv[i];
        line = line.split(',');

        outer.push(line);
    }
    if(start) return outer.slice(start) 
    else return outer;
}


function csvAverage(csv, filePath) {
    let avrg = {};
    let headers = csv[0];
    csv = csv.slice(1);

    headers.map((header, index) => {
        if(header.toLowerCase().includes('time')) {
            avrg[header] = {};
            avrg[header]['index'] = index;
        }
    })

    let sizeIndex = headers.findIndex(header => header.toLowerCase().includes('size'))

    for(const line of csv){
        let size = line[sizeIndex]
        for(const value of Object.values(avrg)){
            if(!value[size]){
                value[size] = {
                    sum: 0,
                    count: 0
                }   
            }

            value[size].sum += Number(line[value.index]);
            value[size].count++;
        }
    }

    for(const value of Object.values(avrg)){
        delete value.index;
        let totalSum = 0;
        let totalCount = 0; 
        for(const subValue of Object.values(value)){
            totalSum += subValue.sum;
            totalCount += subValue.count; 

            subValue.average = subValue.sum / subValue.count;
        }
        value.average = totalSum / totalCount;
    }

    let jsonName = path.parse(filePath).name + '_average.json';
    let jsonPath = path.join(path.dirname(filePath), jsonName);

    fs.writeFileSync(jsonPath, JSON.stringify(avrg, null, 4))

    // append column average to the csv
    let toWrite = headers.map(header => avrg[header] ? avrg[header].average : '');
    fs.appendFileSync(filePath, toWrite.toString() + os.EOL);
}


function average(filePath){
    const items = fs.readdirSync(filePath);

    for(const item of items){
        pathToItem = path.join(filePath, item);
        if(fs.lstatSync(pathToItem).isDirectory()) {
            average(pathToItem);
        }
        else {
            if(path.parse(pathToItem).ext !== '.csv') continue;
            let csv = readCsvAsArray(pathToItem);
            csvAverage(csv, pathToItem);
        }
    }
}

function applyToFiles(root, callback, options = { extension: '.csv' }) {
    const items = fs.readdirSync(root);

    for (const item of items) {
        const itemPath = path.join(root, item);

        if (fs.lstatSync(itemPath).isDirectory()) {
            applyToFiles(itemPath, callback);
        } else if (path.parse(itemPath).ext === options.extension) {
            callback(itemPath);
        }
    }
}

function applyToDirectories(root, dir, callback) {
    const items = fs.readdirSync(root);

    for (const item of items) {
        const itemPath = path.join(root, item);

        if (fs.lstatSync(itemPath).isDirectory()) {
            if (path.basename(itemPath) === dir) {
                callback(itemPath)
            } else {
                applyToDirectories(itemPath, dir, callback);
            }
        }
    }
}

function calculateAverageLatencyBySize(csvPath, { outDir = 'average-latency-by-size', sizePoints = ['4kb', '16kb', '64kb', '256kb', '1mb', '4mb', '16mb'] } = {}) {
    const sizePointsInBytes = sizePoints.map(size => utils.core.byteSize(size))
    const csv = readCsvAsArray(csvPath);
    const headers = csv[0];
    const data = csv.slice(1);
    const sizeIndex = headers.findIndex(header => header.toLowerCase().includes('size (bytes)'));
    const latencyIndex = headers.findIndex(header => header.toLowerCase().includes('time'));
    const mappedRecords = new Map();

    for (const row of data) {
        const size = row[sizeIndex]
        const latency = row[latencyIndex]
        
        if (size && !isNaN(size)) {
            if (!sizePointsInBytes.includes(Number(size))) {
                throw new Error(`Size ${size}, in record ${csvPath} does not match any of the provided sizePoints (${sizePointsInBytes})`)
            }

            if (!mappedRecords.has(size)) {
                mappedRecords.set(size, []);
            }

            mappedRecords.get(size).push(latency);
        }
    }

    const recordsPerSize = [...mappedRecords.values()].map(records => records.length);
    const sampleSize = Math.min(...recordsPerSize);
    const avg = { sampleSize };

    for (const [size, records] of mappedRecords.entries()) {
        avg[size] = records.slice(0, sampleSize).reduce((sum, currentValue) => sum + parseFloat(currentValue), 0) / sampleSize;
    }

    const jsonName = `${path.parse(csvPath).name}.json`;
    const jsonPath = path.join(path.dirname(csvPath), outDir, jsonName);

    if (!fs.existsSync(path.dirname(jsonPath))) fs.mkdirSync(path.dirname(jsonPath))
    fs.writeFileSync(jsonPath, JSON.stringify(avg, null, 4))
}


module.exports = {
    CSV,
    average,
    readCsvAsArray,
    readLines,
    applyToFiles,
    applyToDirectories,
    calculateAverageLatencyBySize
};
