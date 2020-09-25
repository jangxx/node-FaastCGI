#!/usr/bin/env node
const config = require("./config")();

const child_process = require("child_process");
const path = require("path");
const fs = require("fs");

const fcgi = require("node-fastcgi");
const uuid = require("uuid");

const runnerProcs = [];
for (let i = 0; i < config.maxRunners; i++) {
    createRunner();
}

if (config.socketPath != null && fs.existsSync(config.socketPath)) {
    fs.unlinkSync(config.socketPath);
}

const fcgiServer = fcgi.createServer(function(req, res) {
    if (runnerProcs.length == 0) {
        createRunner();
    }

    if (!checkParameters([
        "SCRIPT_FILENAME",
        "DOCUMENT_ROOT",
    ], req.socket.params)) {
        res.statusCode = 500;
        res.end();
        return;
    }

    const scriptPath = req.socket.params.SCRIPT_FILENAME;

    if (!fs.existsSync(scriptPath)) {
        console.log(`Could not find script ${scriptPath}`);
        res.statusCode = 500;
        res.end();
        return;
    }

    // get the next runner process
    let rp = runnerProcs.shift();

    rp.on("message", message => {
        switch(message.type) {
            case "header":
                res.setHeader(message.header.name, message.header.value);
                break;
            case "status":
                res.statusCode = message.code;
                break;
            case "exit":
                if (message.code != 0) {
                    res.statusCode = 500;
                }
                res.end();
                break;
        }
    });

    // notify the child of the request
    rp.send({
        req: {
            url: req.url,
            headers: req.headers,
            method: req.method,
        },
        file: {
            cwd: req.socket.params.DOCUMENT_ROOT,
            path: req.socket.params.SCRIPT_FILENAME,
        }
    });

    rp.stdio[5].on("error", err => {
        // ignore errors
    });
    rp.stdio[4].on("error", err => {
        // ignore errors
    });

    // pipe body to runner process
    req.pipe(rp.stdio[4]);

    // pipe output from runner back to the requester
    rp.stdio[5].pipe(res);

    // end the request when the pipe is closed
    rp.stdio[5].on("end", () => {
        // close the IPC channel so the child can quit gracefully
        rp.disconnect();

        setTimeout(() => {
            rp.kill();
        }, 1000);
    });

    // fill up the queue with new runners again
    for (let i = runnerProcs.length; i < config.maxRunners; i++) {
        createRunner();
    }
});

if (config.socketPath != null) {
    fcgiServer.listen(config.socketPath, () => {
        console.log(`Server is listening on ${config.socketPath}`);
    });
} else {
    fcgiServer.listen(config.port, config.address, () => {
        console.log(`Server is listening on ${config.address}:${config.port}`);
    });
}

function createRunner() {
    let rp = child_process.fork(path.join(__dirname, "runner.js"), [], {
        env: {
            SESSION_DB_PATH: config.session.dbpath,
            SESSION_SECRET: config.session.secret,
            RUNNER_ID: uuid.v4(),
        },
        stdio: [ "inherit", "inherit", "inherit", "ipc", "pipe", "pipe" ],
    });

    rp.on("exit", () => {
        if (runnerProcs.includes(rp)) {
            runnerProcs.splice(runnerProcs.indexOf(rp), 1);
        }
    });

    runnerProcs.push(rp);
}

function checkParameters(parameters, obj) {
    for(let par of parameters) {
        if (!(par in obj)) {
            console.log(`${par} is missing from request parameters`);
            return false;
        }
    }

    return true;
}