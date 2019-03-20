#!/usr/bin/env node

const fs = require('fs');
const Path = require('path');
const version = JSON.parse(fs.readFileSync(Path.join(__dirname, 'package.json'), 'utf-8')).version;
const express = require('express');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server);
const hbs = require('hbs');
const promisify = require('es6-promisify').promisify;
const getConfig = require('./get-config');
let program = require('commander');

// Handlebars and Express.JS configuration
hbs.registerPartials(__dirname + '/views/partials');
app.use(express.static(__dirname + '/public'));
app.set('view engine', 'html');
app.set('views', __dirname + '/views');
app.engine('html', hbs.__express);

// same parameters as Mbed CLI. If not provided we'll poke Mbed CLI for the defaults for this folder.
program
    .version(version)
    .option('-m --target <target>', 'Compile target MCU. Example: K64F, NUCLEO_F401RE, NRF51822...')
    .option('-t --toolchain <toolchain>', 'Compile toolchain. Example: ARM, GCC_ARM, IAR')
    .allowUnknownOption(true)
.parse(process.argv);

(async function() {

    try {
        // if target and / or toolchain are not defined we'll read them through Mbed CLI
        // as Mbed CLI allows you to set global values for these options
        if (!process.target) {
            process.target = await getConfig.getMbedConfigOption('target', process.cwd());
        }
        if (!process.toolchain) {
            process.toolchain = await getConfig.getMbedConfigOption('toolchain', process.cwd());
        }

        // assume this is ran from current working directory (if not, this will fail in the previous step)
        let appName = Path.basename(process.cwd());
        console.log('Retrieving configuration for', appName, '(target: ' + process.target + ', toolchain: ' + process.toolchain + ')');

        // invoked from the client (through web socket) when a change happens
        async function updateMbedApp(setting, value) {
            let path = Path.join(process.cwd(), 'mbed_app.json');
            try {
                // see if we already have an mbed_app.json file
                let mbedApp = null;
                // @todo: get rid of this sync call
                if (fs.existsSync(path)) {
                    // read in the mbed_app.json file
                    let json = await promisify(fs.readFile.bind(fs))(path, 'utf-8');
                    try {
                        mbedApp = JSON.parse(json);
                    }
                    catch (ex) {
                        throw 'Parsing ' + path + ' failed (' + ex + ')';
                    }
                }
                else {
                    // we'll create a new one
                    mbedApp = {};
                }
                // to be safe: only set the value of the config option for the current target
                // this is done through target_overrides object
                if (!mbedApp.target_overrides) {
                    mbedApp.target_overrides = {};
                }
                if (!mbedApp.target_overrides[process.target]) {
                    mbedApp.target_overrides[process.target] = {};
                }
                mbedApp.target_overrides[process.target][setting] = value;

                await promisify(fs.writeFile.bind(fs))(path, JSON.stringify(mbedApp, null, 4), 'utf-8');
                console.log('Persisted', path);
            }
            catch (ex) {
                console.error('Writing to', path, 'failed', ex);
                console.trace();
            }
        }

        // right now the tool only loads the config, but we already retrieve the macros
        // there's no UI for it though.
        let { macros, config } = await getConfig.getConfigForFolder(process.target, process.toolchain, process.cwd());

        // GET / is the only request we support, all code is in client-side JavaScript
        app.get('/', function (req, res, next) {
            res.render('index', { name: appName, macros: JSON.stringify(macros), config: JSON.stringify(config, null, 2) });
        });

        // client communicates back to us through a web socket
        // actually not really required, could just do a POST
        io.on('connection', socket => {
            socket.on('change-value', (name, value) => {
                console.log('Change value', name, value);

                updateMbedApp(name, value);
            });
        });

        // open a web server on port 4113, or override via:
        // PORT=1337 node cli.js
        server.listen(process.env.PORT || 4113, process.env.HOST || '0.0.0.0', function () {
            console.log('Web server listening on port %s!', process.env.PORT || 4113);
        });
    }
    catch (ex) {
        console.error('Failed to retrieve config', ex);
    }
})();
