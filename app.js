const fs = require('fs');
const http = require('http');

const CONFIG_FILE = `${__dirname}/config.json`

function getConfig(){
    return new Promise((resolve, reject) => {
        fs.readFile(CONFIG_FILE, 'utf-8', (err, data) => {
            if (err){
                reject(new Error(`Failed to read config file: ${err.message}`))
            }
            else{
                try {
                    resolve(JSON.parse(data));
                } catch (error) {
                    reject(new Error(`Failed to parse config json: ${error.message}`))
                }
            }
        })
    })
}

function poll(url){
    return new Promise((resolve, reject) => {
        const req = http.get(url, (res) => {
            const chunks = [];
            
            res.on('data', (chunk) => {
                chunks.push(chunk)
            })

            res.on('end', () => {
                resolve({
                    status: res.statusCode,
                    message: Buffer.concat(chunks).toString()
                })
            })

            res.on('error', (err) => {
                reject(new Error(`Failed to handle http response: ${err.message}`))
            })
        })

        req.on('error', (err) => {
            reject(new Error(`Failed to send http request: ${err.message}`))
        })
    })
}

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

getConfig().then(config => {
    const pollIntervalMS = config['poll_interval_ms'];
    const plugs = config['plugs']

    for (let [name, address] of Object.entries(plugs)){
        const url = `http://${address}/?m=1`

        setInterval(() => {
            let time = new Date().getTime();

            poll(url).then(res => {
                const {status, message} = res;

                if (status == 200){
                    parseHtml(message).then(result => {
                        console.log(time, result);
                    }).catch(err => {
                        console.error(`Error: Failed to parse poll results for plug ${name}`, err);
                    })
                }
                else{
                    console.error(`Error: Got non-200 status for plug ${name}`, message);
                }
            }).catch(err => {
                console.error(`Error: Failed to poll plug ${name}`, err);
            })
        }, pollIntervalMS);
    }
}).catch(err => {
    console.error(`Error: Failed to get config`, err);
})