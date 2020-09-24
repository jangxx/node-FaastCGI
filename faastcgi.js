require("dotenv").config();

const child_process = require("child_process");
const path = require("path");
const fs = require("fs");

const fcgi = require("node-fastcgi");

const runnerProcs = [];
for (let i = 0; i < process.env.MAX_RUNNERS; i++) {
    createRunner();
}

if (fs.existsSync(process.env.SOCKET_PATH)) {
    fs.unlinkSync(process.env.SOCKET_PATH);
}

fcgi.createServer(function(req, res) {
    if (runnerProcs.length == 0) {
        createRunner();
    }

    // get the next runner process
    let rp = runnerProcs.shift();

    rp.on("message", message => {
        switch(message.type) {
            case "header":
                res.setHeader(message.header.name, message.header.value);
                break;
        }
    });

    // notify the child of the request
    rp.send({
        req: {
            url: req.url,
            headers: req.headers,
            method: req.method,
        }
    });

    // pipe body to runner process
    req.pipe(rp.stdio[4]);

    // pipe output from runner back to the requester
    rp.stdio[5].pipe(res);

    // end the request when the pipe is closed
    rp.stdio[5].on("end", () => {
        // close the IPC channel so the child can quit gracefully
        rp.disconnect();
        // TODO: start timeout to kill the child in case it doesnt exit on its own
    });

    // fill up the queue with new runners again
    for (let i = runnerProcs.length; i < process.env.MAX_RUNNERS; i++) {
        createRunner();
    }
}).listen(process.env.SOCKET_PATH);

function createRunner() {
    let rp = child_process.fork(path.join(__dirname, "runner.js"), [], {
        env: {},
        stdio: [ "inherit", "inherit", "inherit", "ipc", "pipe", "pipe" ],
    });

    rp.on("exit", () => {
        if (runnerProcs.includes(rp)) {
            runnerProcs.splice(runnerProcs.indexOf(rp), 1);
        }
    });

    runnerProcs.push(rp);
}