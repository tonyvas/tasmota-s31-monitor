const sqlite3 = require('sqlite3');

const QUEUE_MAX_SIZE = 32;

class DatabaseManager{
    constructor(databasePath){
        // Filepath to database
        this._databasePath = databasePath;

        this._queue = [];
        this._isProcessingQueue = false;
    }

    async _processQueue(){
        // If not processing, start doing so
        if (!this._isProcessingQueue){
            this._isProcessingQueue = true;
            
            // While queue is not empty
            while (this._queue.length > 0){
                // Remove request from beginning of queue
                let request = this._queue.splice(0, 1)[0];
                
                // Get callbacks from request
                let {what, onProcessed} = request;

                // Process queued requests
                await what().then(data => {
                    // No error, data
                    onProcessed(null, data);
                }).catch(err => {
                    // Error
                    onProcessed(err);
                })
            }

            // Finished processing
            this._isProcessingQueue = false;
        }
    }

    _addToQueue(what, onProcessed){
        return new Promise((resolve, reject) => {
            if (this._queue.length >= QUEUE_MAX_SIZE){
                reject(new Error(`Reached maximum queue size of ${QUEUE_MAX_SIZE}!`));
            }
            else{
                this._queue.push({
                    // Bind callbacks to this instance
                    what: what.bind(this),
                    onProcessed: onProcessed.bind(this),
                });
        
                this._processQueue();

                resolve();
            }
        })
    }

    _open(){
        return new Promise((resolve, reject) => {
            // Open database (do not create once, that's for setup.js to do)
            let db = new sqlite3.Database(this._databasePath, sqlite3.OPEN_READWRITE, err => {
                if (err){
                    reject(new Error(`Failed to open database: ${err.message}`));
                }
                else{
                    resolve(db);
                }
            })
        })
    }

    _query(template, values){
        return new Promise((resolve, reject) => {
            let database = null;

            this._open().then(db => {
                database = db;

                database.all(template, values, (err, results) => {
                    if (err){
                        reject(new Error(`Failed to execute sql: ${err.message}`));
                    }
                    else{
                        resolve(results);
                    }
                })
            }).catch(err => {
                reject(new Error(`Failed to query database: ${err.message}`));
            }).finally(() => {
                if (database){
                    database.close();
                }
            })
        })
    }

    _getOrInsertPlug(name){
        return new Promise((resolve, reject) => {
            const SELECT_TEMPLATE = 'SELECT plug_id FROM plug WHERE plug_name = ?;';
            const INSERT_TEMPLATE = 'INSERT INTO plug (plug_name) VALUES (?) RETURNING plug_id;';

            this._query(SELECT_TEMPLATE, [name]).then(selected => {
                if (selected.length > 0){
                    resolve(selected[0]['plug_id']);
                }
                else{
                    this._query(INSERT_TEMPLATE, [name]).then(inserted => {
                        resolve(inserted[0]['plug_id']);
                    }).catch(err => {
                        reject(new Error(`Failed to insert plug: ${err.message}`));
                    })
                }
            }).catch(err => {
                reject(new Error(`Failed to select plug ID: ${err.message}`));
            })
        })
    }

    _generateInsertResultQuery(plug_id, timestamp, result){
        // Dict to convert DB key into JS result object key
        const DB_TO_JS_KEYMAP = {
            'voltage': 'Voltage',
            'current': 'Current',
            'active_power': 'Active Power',
            'apparent_power': 'Apparent Power',
            'reactive_power': 'Reactive Power',
            'power_factor': 'Power Factor',
        }

        // Order in which to insert result object values into result table
        const RESULT_OBJECT_INSERT_KEY_ORDER = [
            'voltage',
            'current',
            'active_power',
            'apparent_power',
            'reactive_power',
            'power_factor',
        ];

        // Final insert order
        let insertKeyOrder = ['plug_id', 'timestamp_ms', ...RESULT_OBJECT_INSERT_KEY_ORDER];

        // Generate insert template
        let template = `INSERT INTO result (${insertKeyOrder.join(',')}) VALUES (?,?,?,?,?,?,?,?) RETURNING result_id;`;

        // Ordered values
        let values = [];

        // Add the plug_id and timestamp
        values.push(plug_id);
        values.push(timestamp);

        // Iterate over DB key order
        for (let dbKey of RESULT_OBJECT_INSERT_KEY_ORDER){
            // Convert DB to JS key
            let jsKey = DB_TO_JS_KEYMAP[dbKey];

            // Add relevant result value
            values.push(result[jsKey]);
        }

        return {template, values};
    }

    _insertResult(plug_id, timestamp, result){
        return new Promise((resolve, reject) => {
            let {template, values} = this._generateInsertResultQuery(plug_id, timestamp, result);

            this._query(template, values).then(inserted => {
                resolve(inserted[0]['result_id'])
            }).catch(err => {
                reject(new Error(`Failed to insert result: ${err.message}`));
            })
        })
    }

    _addResult(plugName, result, timestamp){
        return new Promise((resolve, reject) => {
            // Get the Plug ID
            this._getOrInsertPlug(plugName).then(plug_id => {
                // Insert into result table
                this._insertResult(plug_id, timestamp, result).then(result_id => {
                    // Resolve with IDs when done
                    resolve({plug_id, result_id});
                }).catch(err => {
                    reject(new Error(`Failed to insert plug result: ${err.message}`));
                })
            }).catch(err => {
                reject(new Error(`Failed to get plug ID: ${err.message}`));
            })
        })
    }

    addResult(plugName, result, timestamp = null){
        return new Promise((resolve, reject) => {
            // What to do when it is time to process request
            function what(){
                if (!timestamp){
                    // Use current time if no timestamp
                    timestamp = Date.now();
                }

                // Add the result
                return this._addResult(plugName, result, timestamp);
            }

            // What to do when request got processed
            function onProcessed(err, data){
                if (err){
                    reject(new Error(`Failed to add result for plug ${plugName}: ${err.message}`));
                }
                else{
                    resolve(data);
                }
            }

            // Queue request
            this._addToQueue(what, onProcessed).catch(err => {
                reject(new Error(`Failed to add ${plugName} to queue: ${err.message}`));
            })
        })
    }
}

module.exports = DatabaseManager;