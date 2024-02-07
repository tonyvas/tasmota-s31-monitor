const fs = require('fs');
const http = require('http');

// Database Manager helper
const DatabaseManager = require('./database_manager');

const CONFIG_FILE = `${__dirname}/config.json`
const DATABASE_FILEPATH = `${__dirname}/plugs.db`;

// Get the JSON config for plugs
// Takes nothing
// Resolves with an object containing the config
// Rejects if failed
function getConfig(){
    return new Promise((resolve, reject) => {
        // Read config file
        fs.readFile(CONFIG_FILE, 'utf-8', (err, data) => {
            if (err){
                reject(new Error(`Failed to read config file: ${err.message}`))
            }
            else{
                try {
                    // Resolve as JSON data
                    resolve(JSON.parse(data));
                } catch (error) {
                    reject(new Error(`Failed to parse config json: ${error.message}`))
                }
            }
        })
    })
}

// Send an HTTP request to a URL
// Takes the URL to request from
// Resolves with the response status and body if successful
// Rejects if not
function poll(url){
    return new Promise((resolve, reject) => {
        // Send HTTP request
        const req = http.get(url, (res) => {
            const chunks = [];
            
            // Wait for response body data
            res.on('data', (chunk) => {
                chunks.push(chunk)
            })

            res.on('end', () => {
                // Resolve response results
                resolve({
                    status: res.statusCode,
                    message: Buffer.concat(chunks).toString()
                })
            })

            res.on('error', (err) => {
                reject(new Error(`Failed to handle http response: ${err.message}`))
            })
        })

        req.on('timeout', () => {
            reject(new Error(`Failed to poll, request timed out`))
        })

        req.on('error', (err) => {
            reject(new Error(`Failed to send http request: ${err.message}`))
        })
    })
}

// Parse the HTTP response HTML text from plug
// Does not have to be async, but it is for consistency
// Takes the HTML string
// Resolves a result object containing the values from the plug
// Rejects if that failed
function parseHtml(html){
    // Does not have to be async, but using it for consistency
    return new Promise((resolve, reject) => {
        let results = {};

        // Get the entries?
        let entries = html.trim().split('{e}{s}');

        // Skip first entry
        for (let entry of entries.splice(1)){
            // Key is string from beginning of line until this thing
            let key = entry.split('{m}')[0]

            // Value ends once this part begins
            let valueStart = entry.split('</td><td>&nbsp;</td><td>')[0];
            
            // Value begins after this symbol
            let valueLast = valueStart.split('>')

            // Value is the last item in the split
            let value = valueLast[valueLast.length - 1];

            results[key] = Number(value);
        }

        resolve(results)
    })
}

const databaseManager = new DatabaseManager(DATABASE_FILEPATH);

// Read the config
getConfig().then(config => {
    // Split out config values
    const pollIntervalMS = config['poll_interval_ms'];
    const plugs = config['plugs']

    // Setup each plug
    for (let [name, address] of Object.entries(plugs)){
        // Min HTML for plug (used by HomeAssistant TasmoAdmin)
        const url = `http://${address}/?m=1`

        setInterval(() => {
            // Get starting timestamp
            let time = new Date().getTime();

            // Get HTTP data from plug
            poll(url).then(res => {
                const {status, message} = res;

                if (status == 200){
                    // If good, parse the HTML response
                    parseHtml(message).then(result => {
                        databaseManager.addResult(name, result, time).then((IDs) => {
                            // console.log('Inserted!', IDs);
                        }).catch(err => {
                            console.error(new Date().toLocaleString(), `Error: Failed to save result to database for plug ${name}`, err);
                        })
                    }).catch(err => {
                        console.error(new Date().toLocaleString(), `Error: Failed to parse poll results for plug ${name}`, err);
                    })
                }
                else{
                    console.error(new Date().toLocaleString(), `Error: Got non-200 status for plug ${name}`, message);
                }
            }).catch(err => {
                console.error(new Date().toLocaleString(), `Error: Failed to poll plug ${name}`, err);
            })
        }, pollIntervalMS);
    }
}).catch(err => {
    console.error(`Error: Failed to get config`, err);
})