require("dotenv").config();
const path = require("path");
const mergeOptions = require("merge-options");
const randomstring = require("randomstring");

const envConfigMap = {
    socketPath: "SOCKET_PATH",
    port: "BIND_PORT",
    address: "BIND_ADDRESS",
    maxRunners: "MAX_RUNNERS",
    session: {
        dbpath: "SESSION_DB_PATH",
        secret: "SESSION_SECRET",
    },
    runner: {
        user: "RUNNER_UID",
        group: "RUNNER_GID",
    }
};

module.exports = function() {
    // default config
    let config = {
        socketPath: null,
        port: 61120,
        address: "localhost",
        maxRunners: 5,
        session: {
            dbpath: "/tmp",
            secret: randomstring.generate(16),
        },
        runner: {
            user: null,
            group: null,
        },
    };

    if (process.argv.length > 2) {
        try {
            let configFile = require(path.resolve(process.argv[2]));
            config = mergeOptions(config, configFile);
        } catch(err) {
            console.log(`Error while loading config file: ${err.message}`);
        }
    }

    config = mergeOptions(config, createEnvConfig(envConfigMap));

    return config;
};

function createEnvConfig(configMap) {
    const config = {};

    for(let key in configMap) {
        if (typeof configMap[key] == "string") {
            if (configMap[key] in process.env) {
                config[key] = process.env[configMap[key]];
            }
        } else if (typeof configMap[key] == "object") {
            config[key] = createEnvConfig(configMap[key]);
        }
    }

    return config;
}