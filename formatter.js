const fs = require('fs');
const contractsPath = './compiled_contracts/';
const formattedContractsPath = './formatted_contracts';

function formatContract(con){
    let formattedCon = {};

    formattedCon.name = con.contractName;
    formattedCon.jsonPath = '.' + contractsPath + con.contractName + '.json';
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
            event = {};
            event.name = item.name;
            event.retrieve = false;

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
            func.execute = false;
            func.args = [];  // TODO: change to func.inputs. Apply to alla files 
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
                        func.args.push(arg);
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
                        func.args.push(arg);
                    });
                }

                formattedCon.functions.push(func);
            }
        }
    });

    return formattedCon;
}


(function(){

    if (!fs.existsSync(formattedContractsPath)){
        fs.mkdirSync(formattedContractsPath);
    }

    fs.readdirSync(contractsPath).forEach(file => {
        let con = fs.readFileSync(contractsPath + '/' + file, 'utf8');
        let formattedCon = formatContract(JSON.parse(con));

         fs.writeFileSync(formattedContractsPath + '/' + formattedCon.name + '.json', JSON.stringify(formattedCon, null, 2));
    });
})();
