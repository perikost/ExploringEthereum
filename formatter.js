const fs = require('fs');
const assert = require('assert');
const path = require('path')
const defaultContractsPath = './compiled_contracts/';
const formattedContractsPath = './formatted_contracts';
const { program } = require('commander');
var contractsPath;

program
    .description('A util to format compiled contracts') 
    .option('-p, --path <string>', 'path to compiled contracts');
program.parse();

const options = program.opts();


function formatContract(con){
    let formattedCon = {};

    formattedCon.name = con.contractName;
    formattedCon.jsonPath = path.resolve(path.join(contractsPath, `${con.contractName}.json`));
    formattedCon.contractAddress = "fill in the contract's address";
    formattedCon.fallback = false;
    formattedCon.functions = [];
    formattedCon.getters = [];
    formattedCon.events = [];
    formattedCon.indexedEvents = [];
    formattedCon.anonymousEvents = [];
    formattedCon.abi = con.abi;

    const abi = con.abi;
    abi.forEach((item, i) => {
        if(item.type == 'event'){
            let indexed = false;
            let event = {};
            event.name = item.name;
            event.retrieve = true;

            item.inputs.forEach((input, i) => {
                if(input.indexed) indexed = true;
            });

            event.toFind = null;
            event.paramType = 'type of parameter to search';
            event.unused = false;
            event.fallback = false;
            // When filtering an event you must specify the name of the indexed parameter,
            // along with the value_to_match(value that the target event is expected to have).
            // Index property is used make this info accesible when needed(ropstenModule).
            event.index = {                        
                name : 'name of parameter to search',                
                value : null         
            };

            if(item.anonymous){
                event.indexed = indexed;
                formattedCon.anonymousEvents.push(event);
            }
            else if(indexed){
                formattedCon.indexedEvents.push(event);
            }else{
                formattedCon.events.push(event);
            }

        }else if(item.type == 'fallback'){
            formattedCon.fallback = true;
        }else{

            let func = {};
            func.name = item.name;
            func.execute = true;
            func.inputs = [];
            func.outputs = []

            if(item.constant){
                // TODO: check when a func is constant (probably all view functions). Change the code if needed
                if(item.outputs.length != 0){
                    item.outputs.forEach((output, i) => {
                        func.outputs.push({type: output.type});
                    });
                }

                if(item.inputs.length != 0){
                    item.inputs.forEach((input, i) => {
                        let arg = {
                            type : input.type,
                            value : null
                        };
    
                        if(!input.type.includes("uint") || !input.type.match(/(\d+)/)) arg.length = null;
                        func.inputs.push(arg);
                    });
                }

                formattedCon.getters.push(func);
            }else{
                if(item.inputs.length != 0){
                    item.inputs.forEach((input, i) => {
                        let arg = {
                            type : input.type,
                            value : null
                        };
    
                        if(!input.type.includes("uint") || !input.type.match(/(\d+)/)) arg.length = null;
                        func.inputs.push(arg);
                    });
                }

                formattedCon.functions.push(func);
            }
        }
    });

    return formattedCon;
}

function getJsonFiles(){
    let files = fs.readdirSync(contractsPath).filter(file => {
        return file.includes('.json');
    })

    assert(files.length > 0, `No JSON files in ${contractsPath} to format`);
    return files;
}

(function(){
    if(options.path){
        assert(fs.existsSync(options.path), `No such directory: '${options.path}'`);
        contractsPath = options.path;
    }else{
        assert(fs.existsSync(defaultContractsPath), `No such directory: '${defaultContractsPath}'`);
        contractsPath = defaultContractsPath;
    }

    if (!fs.existsSync(formattedContractsPath)){
        fs.mkdirSync(formattedContractsPath);
    }

    let files = getJsonFiles();
    files.forEach(file => {
        let con = fs.readFileSync(path.join(contractsPath, file), 'utf8');
        let formattedCon = formatContract(JSON.parse(con));

         fs.writeFileSync(path.join(formattedContractsPath, `${formattedCon.name}.json`), JSON.stringify(formattedCon, null, 2));
    });
})();
