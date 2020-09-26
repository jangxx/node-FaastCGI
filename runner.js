const fs = require("fs");
const http = require("http");
const crypto = require("crypto");
const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const mergeOptions = require("merge-options");

const reqStream = fs.createReadStream(null, { fd: 4 });
const resStream = fs.createWriteStream(null, { fd: 5 });

const prefixedLog = console.log.bind(null, `[runner:${process.env.RUNNER_ID}]`);
console.log = prefixedLog;
const prefixedError = console.error.bind(null, `[runner:${process.env.RUNNER_ID}]`);
console.error = prefixedError;

process.on("message", message => {
    process.chdir(message.file.cwd);

    // assemble a pseudo http request and response
    const req = new http.IncomingMessage(reqStream);
    req.url = message.req.url;
    req.headers = message.req.headers;
    req.method = message.req.method;

    const res = new http.ServerResponse(req);
    // res.assignSocket(resStream);
    
    const changedHeaders = {};
    const orig_getHeader = res.getHeader.bind(res);

    res.setHeader = function(name, value) {
        changedHeaders[name] = value;
        process.send({
            type: "header",
            header: {
                name,
                value
            },
        });
    };

    res.getHeader = function(name) {
        if (name in changedHeaders) {
            return changedHeaders[name];
        }
        return orig_getHeader(name);
    };

    res.end = function(data, encoding, callback) {
        resStream.end(data, encoding, callback);
    };

    res.write = function(data, encoding, callback) {
        // taken from the internal _http_outgoing.js
        if (!this._header) {
            this._implicitHeader();
        }
        resStream.write(data, encoding, callback);
    };

    // close the outgoing pipe when we are finished writing data
    res.on("finish", () => {
        resStream.end();
    });

    // push incoming data into the request
    reqStream.on("data", chunk => {
        req.push(chunk);
    });

    // finish the request when the incoming pipe closes
    reqStream.on("end", () => {
        req.push(null);
    });

    // create handler chain for our request and response objects
    const app = express();
    app.disable("x-powered-by");

    app.use(function(req, res, next) {
        // add a proxy for the statusCode
        res._statusCode = res.statusCode;
        Object.defineProperty(res, "statusCode", {
            get: function() {
                return this._statusCode;
            },
            set: function(code) {
                this._statusCode = code;
                process.send({
                    type: "status",
                    code
                });
            }
        });

        next();
    });

    // try loading (requiring) the file
    let loadedFile;
    try {
        loadedFile = require(message.file.path);

        if (!("main" in loadedFile)) throw new Error("Loaded file does not contain a main function");
        if (typeof loadedFile.main !== "function") throw new Error("Loaded file does not contain a main function");
    } catch(err) {
        console.log(`Could not load file ${message.file.path}: ${err.message}`);
        exit(1);
    }

    const sessionOpts = loadedFile.sessionOpts || {};

    if (loadedFile.enableSession) {
        app.use(session(mergeOptions({
            // defaults that can be overwritten:
            saveUninitialized: false,
        }, sessionOpts, {
            // these defaults can not be changed:
            store: new SQLiteStore({
                db: "faastcgi-sessions.sqlite3",
                dir: process.env.SESSION_DB_PATH,
            }),
            secret: process.env.SESSION_SECRET,
            resave: false,
            name: `sid.${sha1(message.file.cwd)}`, // each document root has unique cookies
        })));
    }

    if ("middleware" in loadedFile && typeof loadedFile.middleware == "function") {
        loadedFile.middleware(app, { express });
    }

    app.use(loadedFile.main);

    // execute the handler chain
    app(req, res);
});

function exit(code) {
    process.send({
        type: "exit",
        code,
    });

    resStream.end();
    reqStream.close();
    process.disconnect();
    process.exit(code);
}

function sha1(input) {
    const hash = crypto.createHash("sha1");
    hash.update(input);
    return hash.digest("hex");
}