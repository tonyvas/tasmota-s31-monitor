const http = require('http')
const express = require('express');

const PUBLIC_DIRPATH = `${__dirname}/public`;

class WebAPI{
    constructor(database, port){
        this._database = database;
        this._port = port;

        this._app = null;
        this._server = null;
        this._router = null;

        this._isRunning = false;
    }

    // Log a request
    // Takes a request object
    // Resolves if successful
    // Rejects if not
    _log(req){
        return new Promise((resolve, reject) => {
            // Simply log some stuff
            console.log(`${new Date().toLocaleString()} - ${req.socket.address().address} | ${req.method} ${req.url}`);

            resolve();
        })
    }

    // Generate a JSON error response object
    // Takes a status code, message and details strings
    // Returns a JSON formatted object string
    _generateErrorResponseBody(status, message, details){
        return JSON.stringify({ status, message, details });
    }

    // Generate a JSON response object
    // Takes a block of data
    // Returns a JSON string containing the data and a 200 status code
    _generateResponseBody(data){
        return JSON.stringify({ status: 200, data });
    }

    // Get plugs from database
    // Takes nothing
    // Resolves with the plug rows
    _getPlugs(){
        return new Promise((resolve, reject) => {
            // Query database
            this._database.getPlugs().then(plugs => {
                // Resolve plugs
                resolve(plugs);
            }).catch(err => {
                reject(new Error(`Failed to get plugs: ${err.message}`));
            })
        })
    }

    // Get results from database
    // Takes a plug ID, and optionally start and end timestamps
    // Resolves the results for plug between the 2 timestamps
    _getPlugResults(plugID, start = null, end = null){
        return new Promise((resolve, reject) => {
            // Query database
            this._database.getPlugResults(plugID, start, end).then(results => {
                // Resolve results
                resolve(results);
            }).catch(err => {
                reject(new Error(`Failed to get plug results: ${err.message}`));
            })
        })
    }

    // Setup API routes
    // Takes nothing
    // Resolves if setup successful
    _setupRouter(){
        let router = express.Router();

        router.get('/plug', (req, res) => {
            // Set headers
            res.setHeader('Content-Type', 'application/json');

            // Query database for the plugs
            this._getPlugs()
            .then(plugs => {
                // Generate and send response
                res.send(this._generateResponseBody({ plugs }))
            }).catch(err => {
                console.error(`Error: Error: Failed to respond with plugs: ${err.message}`);

                // Send server error response
                res.statusCode = 500;
                res.send(this._generateErrorResponseBody(500, 'Server error', `Failed to get plugs`))
            })
            .finally(() => {
                res.end();
            })
        })

        // GET all plug results
        router.get('/plug_results', (req, res) => {
            // Set headers
            res.setHeader('Content-Type', 'application/json');

            // Get optional start and end timestamps
            const {start, end} = req.query;

            // Query for plugs
            this._getPlugs()
            .catch(err => {
                // Failed to get plugs
                return Promise.reject(`Failed to get plugs: ${err.message}`);
            })
            .then(plugs => {
                let plugResults = {};
                let promises = [];

                // Iterate over every plug in database
                for (let plug of plugs){
                    let id = plug['plug_id'];
                    let name = plug['plug_name'];

                    // Query results for plug between the timestamps
                    let prom = this._getPlugResults(id, start, end)
                    .then(results => {
                        // Save results when done
                        plugResults[name] = results
                    })

                    promises.push(prom);
                }

                // Wait for all queries to finish
                return Promise.all(promises)
                .then(() => {
                    return plugResults;
                })
                .catch(err => {
                    // Failed to get results
                    return Promise.reject(`Failed to get plug results: ${err.message}`);
                })
            .then(results => {
                // Generate and send response
                res.send(this._generateResponseBody({ results }))
            })
            .catch(err => {
                console.error(`Error: Failed to responsd with all plugs results: ${err.message}`);

                // Send server error response
                res.statusCode = 500;
                res.send(this._generateErrorResponseBody(500, 'Server error', `Failed to get plug results`))
            })
            })
            .finally(() => {
                // End response
                res.end();
            })
        })

        // Get results for a particular plug
        router.get('/plug_results/:id', (req, res) => {
            // Set headers
            res.setHeader('Content-Type', 'application/json');

            // Get the plug ID
            const id = req.params.id;
            // Get optional start and end timestamps
            const {start, end} = req.query;

            // Query database for the results
            this._getPlugResults(id, start, end)
            .then(results => {
                // Generate and send response
                res.send(this._generateResponseBody({ results }))
            }).catch(err => {
                console.error(`Error: Error: Failed to respond with results for plug ${id}: ${err.message}`);

                // Send server error response
                res.statusCode = 500;
                res.send(this._generateErrorResponseBody(500, 'Server error', `Failed to get plug results`))
            })
            .finally(() => {
                res.end();
            })
        })

        // If using endpoint other than the ones above
        router.use((req, res) => {
            // Send not found response
            res.statusCode = 404;
            res.end(this._generateErrorResponseBody(404, 'Resource not found', `API endpoint "${req.url}" does not exist`));
        })

        return router;
    }

    // Start the API server
    // Takes nothing
    // Resolves when done
    start(){
        return new Promise((resolve, reject) => {
            // Make sure not already running
            if (!this._isRunning){
                this._isRunning = true;

                // Setup Express
                this._app = express();
                this._server = http.createServer(this._app);
                this._router = this._setupRouter();

                // Attach logger
                this._app.use('/', (req, res, next) => {
                    this._log(req)
                    .then(() => {
                        // Continue with the request
                        next();
                    })
                    .catch(err => {
                        console.error(err);
                        res.statusCode = 500;
                        res.end('Failed to log!')
                    })
                })

                // Attach static files thing
                this._app.use(express.static(PUBLIC_DIRPATH));

                // Attach API route
                this._app.use('/api/', this._router);

                // Attach 404
                this._app.use((req, res) => {
                    res.status = 404;
                    res.end(this._generateErrorResponseBody(404, 'Resource not found',`"${req.url}" was not found`));
                })

                // Start server
                this._server.listen(this._port, () => {
                    resolve();
                })

                // If server crashes
                this._server.on('error', (err) => {
                    reject(new Error(`Failed to start server: ${err.message}`))
                })
            }
            else{
                reject(new Error(`Server already running!`))
            }
        })
    }

    // Stop the API server
    // Takes nothing
    // Resolves when done
    stop(){
        return new Promise((resolve, reject) => {
            // If server is running
            if (this._server){
                // Close server
                this._server.close(err => {
                    if (err){
                        reject(new Error(`Failed to close server: ${err.message}`))
                    }
                    else{
                        resolve();
                    }
                })
            }
        })
    }
}

module.exports = WebAPI;