// EXPRESS SERVER CONFIGURATION
const express = require('express');
const app = express();
const bodyParser = require("body-parser");
const router = express.Router();
app.use("/", router);
const port = 9583;
app.use(bodyParser.urlencoded({extended: false}));
router.use(express.json());


// WINSTON CONFIGURATION 
let request_number = 1; 
const winston = require('winston');
const {combine, timestamp, printf} = winston.format;

const requestsLogger = winston.createLogger({  
  format: combine(timestamp({format: 'DD-MM-YYYY HH:mm:ss.SSS'}),                
                  printf((info) => `${info.timestamp} ${info.level.toUpperCase()}: ${info.message} | request #${request_number} `)),                 
  
  transports: [new winston.transports.File({ level: 'info',filename: 'logs/requests.log', options: {flags: 'w'}}),
               new winston.transports.Console({level:'info'})]
});



const independantLogger = winston.createLogger({   
    format: combine(timestamp({format: 'DD-MM-YYYY HH:mm:ss.SSS',}),    
    printf((info) => `${info.timestamp} ${info.level.toUpperCase()}: ${info.message} | request #${request_number} `)),    
    transports: [new winston.transports.File({level:'debug',filename: 'logs/independent.log', options: {flags: 'w'}})]
});

const stackLogger = winston.createLogger({  
    format: combine(timestamp({format: 'DD-MM-YYYY HH:mm:ss.SSS',}),
    printf((info) => `${info.timestamp} ${info.level.toUpperCase()}: ${info.message} | request #${request_number} `)),     
    transports: [new winston.transports.File({level:'info',filename: 'logs/stack.log', options: {flags: 'w'}})]
});


const stack = []; 
app.listen(port, () => {
  console.log(`Calculator app listening on port ${port}`)
});

const resource_indp = "/independent/calculate";
const resorce_stk = "/stack/calculate"; 

const operations={
    "plus" : {name: 'plus',symbol : '+',operands : 2, callback : (a, b) => a + b},
    "minus" : {name: 'minus',symbol: '-',operands : 2, callback : (a, b) => a - b},
    "times" : {name: 'times',symbol: '*', operands : 2, callback : (a, b) => a * b},
    "divide" : {name: 'divide',symbol: '\\', operands : 2, callback : (a,b) => Math.floor(a/b)},
    "pow"  : {name:'pow', symbol: '^',operands : 2, callback : (a, b) => a ** b},
    "abs" : {name:'abs',operands : 1, callback : x => Math.max(x,-x)},
    "fact" : {name:'fact',operands:1, callback: factorial}
};

const errorPrefixMsg = "Server encountered an error ! message: ";



router.post('/independent/calculate', (req,res) => {
    const startTime = Date.now();
    let body = req.body;
    let operation = body.operation;
    const arguments = body.arguments;
    
    const response = {
        "result" : undefined,
        "error-message" : undefined
    };
   

    
    const opcode = operation.toLowerCase();
    if(!opcode in operations){
        response["error-message"] = `Error: unknown operation: ${operation}`;
        res.statusCode = 409;  
        res.send(response);
        return;      
    }
    const opInfo = operations[opcode];

    if(arguments.length > opInfo.operands){
        response["error-message"] = `Error: Too many arguments to perform the operation ${operation}`;
        res.statusCode = 409; 
    }else if(arguments.length < opInfo.operands){
        response["error-message"] = `Error: Not enough arguments to perform the operation ${operation}`;
        res.statusCode = 409; 
    }else{
        res.statusCode = 200;
        if(operation === "divide" && arguments[1] === 0){          
            response["error-message"] = "Error while performing operation Divide: division by 0";
            res.statusCode = 409;         
        }else if(operation === "fact" && arguments[0] < 0){
            response_json["error-message"] = "Error while performing operation Factorial: not supported for the negative number";     
            res.statusCode = 409; 
        }
        else if(opInfo.operands === 1){
            response["result"] =  opInfo['callback'](arguments[0]); 
        }else if(opInfo.operands === 2){
            response["result"] =  opInfo['callback'](arguments[0], arguments[1]);
        }    
    }  

    if(res.statusCode === 200){
        let infoMsg = `Performing operation ${operation}. Result is ${response["result"]}`;
        independantLogger.info(infoMsg);
        let debugMsg = `Performing operation: ${operation}(${arguments.toString()}) = ${response["result"]}`;
        independantLogger.debug(debugMsg);
    }else if(res.statusCode === 409){
        let errorMsg = errorPrefixMsg + `Server encountered an error ! message: ${response["error-message"]}`;
        independantLogger.error(errorMsg);
    }
 
    res.send(response);
    logRequest(req,Date.now()-startTime);
});


// get stack size 
router.get('/stack/size',(req, res) => {
    const startTime = Date.now();
    res.statusCode = 200; 
    response_json = {"result": stack.length, "error-message":undefined};
    stackLogger.info(`Stack size is ${stack.length}`);
    stackLogger.debug(`Stack content (first == top): [${stack.slice().reverse().join(", ")}]`);
    res.send(response_json);
    logRequest(req,Date.now()-startTime);
});

// stack add arguments 
app.put('/stack/arguments', (req, res) => {
    const startTime = Date.now();
    let body = req.body; 
    let count = 0; 
    let before_size = stack.length;  
    const args = body.arguments; 
    args.forEach(element => {
        element = parseInt(element);
        if(element != NaN){        
            stack.push(element); 
            count++;            
        }else{
            res.statusCode = 409;
        }        
    });
    stackLogger.info(`Adding total of ${count} argument(s) to the stack | Stack size: ${stack.length}`);
    stackLogger.debug(`Adding arguments: ${args} | Stack size before ${before_size} | stack size after ${stack.length}`);
    res.statusCode = 200; 
    res.send({"result":stack.length,"error-message": undefined});
    logRequest(req,Date.now()-startTime);
  });

// delete elements from the stack
app.delete('/stack/arguments', (req,res) => {
    const startTime = Date.now();
    const count = parseInt(req.query.count);
    const output = {"result" : undefined, "error-message" : undefined};
    if (count === NaN || count > stack.length){
        res.statusCode = 409;
        const errorMsg = errorPrefixMsg + `Error: cannot remove ${count} from the stack. It has only ${stack.length} arguments`;      
        stackLogger.error(errorMsg);
        output["error-message"] = errorMsg;  
        res.send(output);
        logRequest(req,Date.now()-startTime);
        return; 
    }

    let i = 0; 
    while(stack.length > 0 && i < count){
        stack.pop();
        i++; 
    }
    stackLogger.info(`Removing total ${count} argument(s) from the stack | Stack size: ${stack.length}`);
    output["result"] = stack.length;
    res.send(output);
    logRequest(req,Date.now()-startTime);
});


app.get('/stack/operate', (req, res) => {
    const startTime = Date.now(); 
    response_json = {"result": undefined, "error-message": undefined}; 
    let operation = req.query.operation;
    let opcode = operation.toLowerCase();
    let arguments = undefined; 
    let x = undefined , y = undefined; 

    if(!opcode in operations){
        response["error-message"] = `Error: unknown operation: ${operation}`;
        res.statusCode = 409;                
    }else{
        const opInfo = operations[opcode];        
        //console.log(opInfo.name, operation);

        if(stack.length < opInfo.operands){
            res.statusCode = 409; 
            response_json["error-message"] =`Error: cannot implement operation ${operation}. It requires ${opInfo.operands} arguments and the stack has only ${stack.length} arguments`;
        }else{
            switch(opcode){
                case "divide":
                    x = stack.pop();
                    y = stack.pop(); 
                    arguments = [x,y];
                    if(y === 0){
                        response_json["error-message"] = `Error while performing operation Divide: division by 0`;
                        res.statusCode = 409;                         
                    }else{
                        response_json["result"] = opInfo["callback"](x,y);
                        res.statusCode = 200;                         
                    }
                    break;
                case "fact":
                    x = stack.pop();                 
                    arguments = [x];
                    if(x < 0){
                        res.statusCode = 409;
                        response_json["error-message"] = "Error while performing operation Factorial: not supported for the negative number";                        
                    }else{
                        response_json["result"] = factorial(x);
                        res.statusCode = 200; 
                    }
                    break;
                case "abs":
                    x = stack.pop(); 
                    arguments = [x]; 
                    response_json["result"] = Math.max(x,-x);
                    res.statusCode = 200; 
                    break;                 
                default:
                    x = stack.pop();
                    y = stack.pop();
                    arguments = [x,y]; 
                    response_json["result"] = opInfo["callback"](x,y);
                    res.statusCode = 200; 
            }
        } 
    }

    if(res.statusCode !== 409){
        const infoMsg = `Performing operation ${operation}. Result is ${response_json["result"]} | stack size: ${stack.length}`;
        const debugMsg = `Performing operation: ${operation}(${arguments.toString()}) = ${response_json["result"]}`;
        stackLogger.info(infoMsg);
        stackLogger.debug(debugMsg);
    }else{
        const errMsg = errorPrefixMsg + response_json["error-message"];
        stackLogger.error(errMsg);
    }
    res.send(response_json);
    logRequest(req,Date.now()-startTime);
    
});



/*
*   Helper Function to calculate Factorial
*/
function factorial(num){
    answer = 1; 
    for (let i = 2; i <= num; i++) {
        answer *= i;
    }
    return answer;
}    



function logRequest(request, duration){
    // Fetching request parameters 
    const resource = request.path;
    const req_type = request.method
    
    requestsLogger.info(`Incoming request | #${request_number} | resource: ${resource} | HTTP Verb ${req_type}`);
    requestsLogger.debug(`request #${request_number} duration: ${duration}ms`);
    request_number++;    
}




router.get('/logs/level', (req,res) => {
    const startTime = Date.now();
    const logger_name = req.query["logger-name"]; 
    let message = ""; 
    res.statusCode = 200; 
    switch(logger_name){
        case "independent-logger": 
            message = `Success: Log Level of ${logger_name} is ${independantLogger.transports[0].level}`;
            break;
        case "stack-logger": 
            message = `Success: Log Level of ${logger_name} is ${stackLogger.transports[0].level}`;
            break; 
        case "request-logger":
            message = `Success: Log Level of ${logger_name} is ${requestsLogger.transports[0].level}`;
            break;  
        default: 
            message = `Failure: Logger ${logger_name} was not found!`;             
    }
    res.send(message);
    logRequest(req,Date.now()-startTime);
});


router.put('/logs/level', (req, res) => {
    const startTime = Date.now();
    const logger_name = req.query["logger-name"]; 
    let logger_level = req.query["logger-level"].toLowerCase();
    res.statusCode = 200; 
    switch(logger_name){
        case "independent-logger": 
            for(const transport of stackLogger.transports){
                transport.level = logger_level; 
            }       
            message = `Success: ${independantLogger.transports[0].level}`;
            break;
        case "stack-logger": 
            for(const transport of stackLogger.transports){
                transport.level = logger_level; 
            }                         
            message = `Success: Log Level of ${logger_name} is ${stackLogger.transports[0].level}`;
            break; 
        case "request-logger":         
            for(const transport of requestsLogger.transports){
                transport.level = logger_level; 
            }              
            message = `Success: ${independantLogger.level}`;
            message = `Success: Log Level of ${logger_name} is ${requestsLogger.transports[0].level}`;
            break;  
        default: 
            message = `Failure: Cannot change Log-Level, Logger ${logger_name} was not found!`; 
            res.statusCode = 400; 
    }
    res.send(message);
    logRequest(req,Date.now()-startTime);
});