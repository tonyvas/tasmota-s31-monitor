const fs = require('fs');
const http = require('http');

const CONFIG_FILE = `${__dirname}/config.json`

class PlugMonitor{
    constructor(database){
        // Instance of database manager
        this._database = database;

        // Bool to check if monitor is running
        this._isRunning = false;

        // Interval handles for monitoring plugs
        this._handles = [];
    }

    // Get the JSON config for plugs
    // Takes nothing
    // Resolves with an object containing the config
    // Rejects if failed
    _getConfig(){
        return new Promise((resolve, reject) => {
            if (fs.existsSync(CONFIG_FILE)){
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
            }
            else{
                reject(new Error(`Config file does not exist! << Run "npm run setup">>`))
            }
        })
    }

    // Send an HTTP request to a URL
    // Takes the URL to request from
    // Resolves with the response status and body if successful
    // Rejects if not
    _poll(url){
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
                reject(new Error(`Request timed out`))
            })

            req.on('error', (err) => {
                reject(new Error(`Failed to send http request: ${err.message}`))
            })
        })
    }

    // Parse the HTTP response HTML text from plug
    // Does not need to be async, but it is for consistency
    // Takes the HTML string
    // Resolves a result object containing the values from the plug
    _parseHtml(html){
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

            resolve(results);
        })
    }

    // Start an interval loop to monitor plugs
    // Takes a plug config, and an instance of the database manager
    // Resolves if successful
    // Rejects if not
    _setupMonitoring(config){
        return new Promise((resolve, reject) => {
            // Split out config values
            const pollIntervalMS = config['poll_interval_ms'];
            const plugs = config['plugs']

            // Setup each plug
            for (let [name, address] of Object.entries(plugs)){
                // Min HTML for plug (used by HomeAssistant TasmoAdmin)
                const url = `http://${address}/?m=1`

                let handle = setInterval(() => {
                    // Get starting timestamp
                    let time = new Date().getTime();

                    // Get HTTP data from plug
                    this._poll(url)
                    .catch(err => {
                        // Failed to poll
                        return Promise.reject(new Error(`Failed to poll: ${err.message}`))
                    })
                    .then(res => {
                        // Get response data
                        const {status, message} = res;

                        if (status == 200){
                            // If good, parse the HTML response
                            return this._parseHtml(message).catch(err => {
                                // Failed to parse response
                                return Promise.reject(new Error(`Failed to parse poll results: ${err.message}`))
                            })
                        }
                        else{
                            return Promise.reject(new Error(`Got non-200 status: ${message}`))
                        }
                    })
                    .then(result => {
                        // Save result
                        return this._database.addResult(name, result, time).catch(err => {
                            // Failed to save
                            return Promise.reject(new Error(`Failed to save result to database: ${err.message}`))
                        })
                    })
                    .then((IDs) => {
                        console.log('Inserted!', IDs);
                    })
                    .catch(err => {
                        // Print error message
                        console.error(`${new Date().toLocaleString()} - Error: Failed to monitor plug ${name}: ${err.message}`);
                    })
                }, pollIntervalMS);

                // Save interval handle
                this._handles.push(handle);
            }

            // Resolve when done
            resolve()
        })
    }

    // Main starting function
    // Reads config and starts monitoring
    // Takes an instance of the database manager
    // Resolves if successful
    // Rejects if not
    start(){
        return new Promise((resolve, reject) => {
            if (!this._isRunning){
                // Read the config
                this._getConfig()
                .then(config => {
                    // Setup monitoring loop
                    return this._setupMonitoring(config).catch(err => {
                        // Failed to setup
                        return Promise.reject(new Error(`Failed to start monitoring: ${err.message}`));
                    })
                })
                .then(() => {
                    // Monitoring started
                    this._isRunning = true;
                    resolve();
                })
                .catch(err => {
                    reject(new Error(`Failed to get config: ${err.message}`))
                })
            }
            else{
                reject(new Error('Monitor already running!'));
            }
        })
    }

    // Stop monitoring
    // Takes no arguments
    // Resolves if successful
    // Rejects if not
    stop(){
        return new Promise((resolve, reject) => {
            // Clear all intervals
            for (let handle of this._handles){
                clearInterval(handle);
            }

            // Unset bool
            this._isRunning = false;

            // Resolve when done
            resolve();
        })
    }
}

// Export monitor
module.exports = PlugMonitor;