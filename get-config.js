/**
 * This file uses Mbed CLI to get all the macros and configuration for an application
 */

const spawn = require('child_process').spawn;

/**
 * Takes the output of mbed compile --config -v and spits out an overview of
 * configuration options and macros
 * @param {*} stdout String containing the
 */
function parseConfig(stdout) {
    return new Promise((resolve, reject) => {
        let config = [];
        let macros = [];

        // OK, so now come the parsing part...
        let inConfigSection = false;
        let inMacrosSection = false;
        let currentConfig = null;
        for (let line of stdout.split('\n')) {
            // sections are split by line stating 'Configuration parameters' and 'Macros'
            if (line === 'Configuration parameters') {
                inConfigSection = true;
                continue;
            }
            if (line === 'Macros') {
                inMacrosSection = true;
                inConfigSection = false;
                continue;
            }

            // Config data contains:
            // Name: configuration.name
            //      Description: I'm a configuration
            //      Defined by: some:library
            //      Macro name: MY_CONFIG_NAME
            //      Value: 12
            //
            // not all values have to be present, but when we don't see indentation anymore we know
            // we're done with the object

            // currentConfig will be filled when we're in a config section
            if (inConfigSection && currentConfig) {
                // no more indentation? We're done
                if (line.indexOf('    ') !== 0) {
                    config.push(Object.assign({} , currentConfig)); // copy
                    currentConfig = null;
                }
                else {
                    // Map string value with indentation to JS property
                    const map = [
                        [ 'description', '    Description: ' ],
                        [ 'definedBy', '    Defined by: ' ],
                        [ 'macro', '    Macro name: ' ],
                        [ 'value', '    Value: ' ],
                    ];
                    for (let [key, substr] of map) {
                        if (line.indexOf(substr) === 0) {
                            let v = line.substr(substr.length);

                            // some values end with (set by abcdef), get rid of this
                            let setByRegex = v.match(/\(set by [^\)]+\)$/);
                            if (setByRegex) {
                                v = v.substr(0, setByRegex.index - 1);
                            }

                            currentConfig[key] = v;
                        }
                    }
                }
            }

            // not in config section (anymore)? then see if we start with Name: and start new section
            if (inConfigSection && !currentConfig) {
                if (line.indexOf('Name: ') === 0) {
                    currentConfig = {
                        name: line.substr('Name: '.length)
                    };
                    continue;
                }
            }

            // Macros section is just new lines, as long as first character is word char
            if (inMacrosSection) {
                if (/^\w/.test(line)) {
                    macros.push(line);
                }
            }
        }

        resolve({
            config: config,
            macros: macros
        });
    });
}

/**
 * Load the configuration for a specified target, toolchain and folder
 * @param {*} target Mbed OS target (e.g. NUCLEO_F446RE)
 * @param {*} toolchain Mbed OS toolchain (e.g. GCC_ARM)
 * @param {*} folder Location of an Mbed OS project
 */
function getConfigForFolder(target, toolchain, folder) {
    return new Promise((resolve, reject) => {
        let args = [ 'compile', '--config', '-v' ];
        if (target) {
            args.push('-m');
            args.push(target);
        }
        if (toolchain) {
            args.push('-t');
            args.push('GCC_ARM');
        }

        // call Mbed CLI
        let cmd = spawn('mbed', args, { cwd: folder });

        let stdout = '';

        cmd.stdout.on('data', data => stdout += data.toString('utf-8'));
        cmd.stderr.on('data', data => stdout += data.toString('utf-8'));

        cmd.on('close', code => {
            if (code !== 0) {
                return reject('Failed to retrieve config (' + code + ')\n' + stdout);
            }

            // parse the config and return the promise
            parseConfig(stdout).then(resolve, reject);
        });
    });
}

/**
 * Get a configuration option from Mbed CLI
 * @param {*} name Name of the configuration option (e.g. toolchain or target)
 * @param {*} folder Location of an Mbed OS project
 */
function getMbedConfigOption(name, folder) {
    return new Promise((resolve, reject) => {
        let args = [ name ];

        // spawns e.g. 'mbed target'
        let cmd = spawn('mbed', args, { cwd: folder });

        let stdout = '';

        cmd.stdout.on('data', data => stdout += data.toString('utf-8'));
        cmd.stderr.on('data', data => stdout += data.toString('utf-8'));

        cmd.on('close', code => {
            if (code !== 0) {
                return reject('Failed to retrieve configuration option (' + code + ')\n' + stdout);
            }

            // take the last non-blank line and strip '[mbed]' of it
            let lines = stdout.split('\n').filter(f => !!f);
            resolve(lines[lines.length - 1].replace('[mbed] ', ''));
        });
    });
}

module.exports = {
    getConfigForFolder: getConfigForFolder,
    parseConfig: parseConfig,
    getMbedConfigOption: getMbedConfigOption
};
