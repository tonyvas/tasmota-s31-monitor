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
        return JSON.stringify({
            error: { status, message, details }
        });
    }

    _setupRouter(){
        let router = express.Router();

        router.get('/plug', (req, res) => {
            res.end('Get all plugs!');
        })

        router.get('/plug/:plugName', (req, res) => {
            res.end(`Get plug ${req.params.plugName}`);
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