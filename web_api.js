const http = require('http')
const express = require('express');

class WebAPI{
    constructor(database, port){
        this._database = database;
        this._port = port;

        this._app = null;
        this._server = null;
        this._router = null;
    }

    _log(req){
        return new Promise((resolve, reject) => {
            console.log(`${new Date().toLocaleString()} - ${req.socket.address().address} | ${req.method} ${req.url}`);

            resolve();
        })
    }

    _generateErrorResponseBody(status, message, details){
        return JSON.stringify({ status, message, details });
    }

    _generatePlugResponseBody(data){
        return JSON.stringify({ status: 200, data });
    }

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

    _getPlugResults(plugID, start, end){
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

    _setupRouter(){
        let router = express.Router();

        router.get('/plug_results', (req, res) => {
            // Set headers
            res.setHeader('Content-Type', 'application/json');

            // Get optional start and end timestamps
            const {start, end} = req.query;

            this._getPlugs()
            .catch(err => {
                return Promise.reject(`Failed to get plugs: ${err.message}`);
            })
            .then(plugs => {
                let plugResults = {};
                let promises = [];

                for (let plug of plugs){
                    let id = plug['plug_id'];
                    let name = plug['plug_name'];

                    let prom = this._getPlugResults(id, start, end)
                    .then(results => {
                        plugResults[name] = results
                    })

                    promises.push(prom);
                }

                return Promise.all(promises)
                .then(() => {
                    return plugResults;
                })
                .catch(err => {
                    return Promise.reject(`Failed to get plug results: ${err.message}`);
                })
            .then(results => {
                res.send(this._generatePlugResponseBody({ results }))
            })
            .catch(err => {
                console.error(`Error: Failed to responsd with all plugs results: ${err.message}`);
                res.statusCode = 500;
                res.send(this._generateErrorResponseBody(500, 'Server error', `Failed to get plug results`))
            })
            })
            .finally(() => {
                res.end();
            })
        })

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
                res.send(this._generatePlugResponseBody({ results }))
            }).catch(err => {
                console.error(`Error: Error: Failed to respond with results for plug ${id}: ${err.message}`);
                res.statusCode = 500;
                res.send(this._generateErrorResponseBody(500, 'Server error', `Failed to get plug results`))
            })
            .finally(() => {
                res.end();
            })
        })

        router.use((req, res) => {
            res.statusCode = 404;
            res.end(this._generateErrorResponseBody(404, 'Resource not found', `API endpoint "${req.url}" does not exist`));
        })

        return router;
    }

    start(){
        return new Promise((resolve, reject) => {
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

            // this._app.use(express.json());

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
        })
    }

    stop(){
        return new Promise((resolve, reject) => {
            resolve();
        })
    }
}

module.exports = WebAPI;