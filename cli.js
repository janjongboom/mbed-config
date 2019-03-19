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

hbs.registerPartials(__dirname + '/views/partials');
app.use(express.static(__dirname + '/public'));
app.set('view engine', 'html');
app.set('views', __dirname + '/views');
app.engine('html', hbs.__express);

program
    .version(version)
    .option('-m --target <target>', 'Compile target MCU. Example: K64F, NUCLEO_F401RE, NRF51822...')
    .option('-t --toolchain <toolchain>', 'Compile toolchain. Example: ARM, GCC_ARM, IAR')
    .allowUnknownOption(true)
.parse(process.argv);

(async function() {

    try {
        if (!process.target) {
            process.target = await getConfig.getMbedConfigOption('target', process.cwd());
        }
        if (!process.toolchain) {
            process.toolchain = await getConfig.getMbedConfigOption('toolchain', process.cwd());
        }

        let appName = Path.basename(process.cwd());
        console.log('Retrieving configuration for', appName, '(target: ' + process.target + ', toolchain: ' + process.toolchain + ')');

        async function updateMbedApp(setting, value) {
            let path = Path.join(process.cwd(), 'mbed_app.json');
            try {
                let mbedApp = null;
                if (fs.existsSync(path)) {
                    let json = await promisify(fs.readFile.bind(fs))(path, 'utf-8');
                    console.log('json', json);
                    try {
                        mbedApp = JSON.parse(json);
                        console.log('OK done', mbedApp);
                    }
                    catch (ex) {
                        throw 'Parsing ' + path + ' failed (' + ex + ')';
                    }
                    console.log('Does exist', path);
                }
                else {
                    mbedApp = {};
                    console.log('Does not exist');
                    throw 1;
                }
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

        // this can be used for testing
        // let stdout = await promisify(fs.readFile.bind(fs))(Path.join(__dirname, 'test.txt'), 'utf-8');
        // let { macros, config } = await getConfig.parseConfig(stdout);

        // this is actual behavior
        let { macros, config } = await getConfig.getConfigForFolder(process.target, process.toolchain, process.cwd());

        app.get('/', function (req, res, next) {
            res.render('index', { name: appName, macros: JSON.stringify(macros), config: JSON.stringify(config, null, 2) });
        });

        io.on('connection', socket => {
            socket.on('change-value', (name, value) => {
                console.log('Change value', name, value);

                updateMbedApp(name, value);
            });
        });

        server.listen(process.env.PORT || 4113, process.env.HOST || '0.0.0.0', function () {
            console.log('Web server listening on port %s!', process.env.PORT || 4113);
        });
    }
    catch (ex) {
        console.error('Failed to retrieve config', ex);
    }
})();
