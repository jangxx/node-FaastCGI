const fs = require("fs");
const http = require("http");
const express = require("express");

const reqStream = fs.createReadStream(null, { fd: 4 });
const resStream = fs.createWriteStream(null, { fd: 5 });

process.on("message", message => {
    // assemble a pseudo http request and response
    const req = new http.IncomingMessage(reqStream);
    req.url = message.req.url;
    req.headers = message.req.headers;
    req.method = message.req.method;

    const res = new http.ServerResponse(req);
    // res.assignSocket(resStream);
    
    const changedHeaders = {};
    const orig_getHeader = res.getHeader.bind(res);
    const orig_write = res.write.bind(res);

    res.setHeader = function(name, value) {
        console.log(name, value);

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
        // orig_write(data, encoding, callback);
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

    // app.use(function(req, res, next) {


    //     // res.send = function(chunk) {
    //     //     resStream.end(chunk);
    //     // };

        

    //     next();
    // });

    const func = require("./test-func.js");
    app.use(func.main);
    // app.use(function(req, res) {
    //     func.main(req, res, resStream);
    // });

    // app.use(express.json());

    // app.use(function(req, res, next) {
    //     console.log("called", req.body);
    //     console.log(req.path);
    //     // console.log(req.get("Content-Length"));
    //     // res.end();
    //     res.header("X-Ja", "Moin");
    //     // res.status(500);
    //     // res.write("ja moin");
    //     // res.send("response oder so");
    //     // next();
    //     res.json({ sucess: true });
    // });

    // execute the handler chain
    app(req, res);
});

function setHeader(name, value) {
    process.send({
        type: "header",
        header: {
            name,
            value
        },
    });
}