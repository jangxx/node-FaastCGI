# Node FaastCGI
Deploy your Node scripts by simply copying them on a server!
FaastCGI is a FaaS (function as a service) system, which is build on top of `node-fastcgi`, to be able to deploy Node.js scripts by simply placing them in a directory that's accessible by nginx for example.
Running the script is then as easy as sending a request to the file you want to run.
Basically, this makes running Node.js scripts as easy and convenient as running PHP scripts, but comes with the same tradeoff, i.e. you can't run long running processes with this.

## Installation

Simply install the module globally by running

    npm install -g faastcgi

You can then run `faastcgi` in your shell to start the CGI broker, but without any configuration this is kind of useless.

## Configuration

You can set configration options either in a config file provided as the first parameter to the `faastcgi` call or in environment variables.
The config file can either contain plain JSON or executable code, as long as the necessary options are exported.
The environment variables take precedence over the values in the config file.

### Configuration options

The following listing contains all configuration options as well as their environment variable counterparts and a small explanation.

```javascript
{
    "socketPath": String, // SOCKET_PATH, path to a UNIX socket where the CGI server can be bound to. Default: null
    "port": Number, // BIND_PORT, port to bind the CGI server to, Default: 61120
    "address": String, // BIND_ADDRESS, address to bind the CGI server to, Default: "localhost"
    "maxRunners": Number, // MAX_RUNNERS, max number of idle processes waiting for requests, Default: 5
    "session": {
        "dbpath": String, // SESSION_DB_PATH, path to a directory where a sqlite database with session information will be stored, Default: /tmp/
        "secret": String, // SESSION_SECRET, if this is not set to some value the sessions are not persistent across broker restarts, Default: <random>
    },
    "runner": {
        "user": Number, // RUNNER_UID, uid of the user under which the runners will be run, Default: <same as broker>
        "group": Number, // RUNNER_GID, group id of the user under which the runners will be run, Default: <same as broker>
    }
}
```

## Structure of deployed files

The files that can be picked up by the runners are normal Node.js scripts that are `require()`'d.
To provide the scripts functionality to the runner, a few properties need to be exported to user certain features:

`main` (required)  
A function with the signature `(req, res)`, where `req` and `res` are standard express.js request and response objects.
To finalize the request, simply call `res.end()` or `res.send()`, or any of the other available methods.
If the request is finalized you have 1 second to terminate, otherwise the runner will be killed.

`middleware` (optional)  
A function with the signature `(app, builtins)`.
This function can be used to run some additional express middleware before the main function, like a body parser for example.
The `builtins` object contains a reference to express directly, so enabling a json body parser for example is as simple as defining:

```javascript
middleware: function(app, builtins) {
    app.use(builtins.express.json());
}
```

`enableSession` (optional)  
Set this value to a truthy value to enable the built-in session system based on `express-session`.
You could of course run your own session middleware in the middleware function, but the builtin session is a very convenient way to get sessions working without much overhead.

`sessionOpts` (optional)  
Additional options to give to the `express-session` constructor.
Use this to change cookie settings for example.

Some examples for function files can be found in the *examples/* directory.

## nginx configuration

If you have a php-fpm setup already, you can integrate this software pretty easily by simply adding these lines to the definition of your virtual host:

```
location ~ \.fajs$ {
    fastcgi_pass   unix:/run/faastcgi.sock; # path to your unix socket
    fastcgi_index  index.fajs;
    include        fastcgi_params; # reuse the same params from php
}
```

To avoid confusion between normal **.js** files and the ones executed by `faastcgi` I have decided to use the file extension **.fajs** to differentiate the two, but you are of course free to use any extension you like.
One thing to keep in mind however: If you write some local module code in **.js** files for inclusion only, don't forget that nginx will serve them out as text by default.
It might therefore be advisable to either use another extension for these files (like **.jsm**) and prevent nginx from serving this filetype or to put your local modules in a *lib/* folder and then restricting access to that.