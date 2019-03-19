/**
 * This file uses Mbed CLI to get all the macros and configuration for an application
 */

const spawn = require('child_process').spawn;

function parseConfig(stdout) {
    return new Promise((resolve, reject) => {
        let config = [];
        let macros = [];

        // OK, so now come the parsing part...
        let inConfigSection = false;
        let inMacrosSection = false;
        let currentConfig = null;
        for (let line of stdout.split('\n')) {
            if (line === 'Configuration parameters') {
                inConfigSection = true;
                continue;
            }
            if (line === 'Macros') {
                inMacrosSection = true;
                inConfigSection = false;
                continue;
            }

            if (inConfigSection && currentConfig) {
                if (line.indexOf('    ') !== 0) {
                    config.push(Object.assign({} , currentConfig)); // copy
                    currentConfig = null;
                }
                else {

                    const map = [
                        [ 'description', '    Description: ' ],
                        [ 'definedBy', '    Defined by: ' ],
                        [ 'macro', '    Macro name: ' ],
                        [ 'value', '    Value: ' ],
                    ];
                    for (let [key, substr] of map) {
                        if (line.indexOf(substr) === 0) {
                            let v = line.substr(substr.length);

                            let setByRegex = v.match(/\(set by [^\)]+\)$/);
                            if (setByRegex) {
                                v = v.substr(0, setByRegex.index - 1);
                            }

                            currentConfig[key] = v;
                        }
                    }
                }
            }

            if (inConfigSection && !currentConfig) {
                if (line.indexOf('Name: ') === 0) {
                    currentConfig = {
                        name: line.substr('Name: '.length)
                    };
                    continue;
                }
            }

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

        let cmd = spawn('mbed', args, { cwd: folder });

        let stdout = '';

        cmd.stdout.on('data', data => stdout += data.toString('utf-8'));
        cmd.stderr.on('data', data => stdout += data.toString('utf-8'));

        cmd.on('close', code => {
            if (code !== 0) {
                return reject('Failed to retrieve config (' + code + ')\n' + stdout);
            }

            parseConfig(stdout).then(resolve, reject);
        });
    });
}

function getMbedConfigOption(name, folder) {
    return new Promise((resolve, reject) => {
        let args = [ name ];

        let cmd = spawn('mbed', args, { cwd: folder });

        let stdout = '';

        cmd.stdout.on('data', data => stdout += data.toString('utf-8'));
        cmd.stderr.on('data', data => stdout += data.toString('utf-8'));

        cmd.on('close', code => {
            if (code !== 0) {
                return reject('Failed to retrieve configuration option (' + code + ')\n' + stdout);
            }

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
