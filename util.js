const cp = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const yaml = require('yaml');
const fkill = require('fkill');
const execa = require('execa');

const IS_WIN = process.platform === 'win32';
const LEAGUE_PROCESS = IS_WIN ? 'LeagueClient.exe' : 'LeagueClient';

function getLCUExecutableFromProcess() {
    return new Promise(resolve => {
        const command = IS_WIN ?
            `WMIC PROCESS WHERE name='${LEAGUE_PROCESS}' GET ExecutablePath` :
            `ps x -o comm= | grep '${LEAGUE_PROCESS}$'`;

        cp.exec(command, (error, stdout, stderr) => {
            if (error || !stdout || stderr) {
                reject(error || stderr);
                return;
            }

            const normalizedPath = path.normalize(stdout); 
            resolve(IS_WIN ? normalizedPath.split(/\n|\n\r/)[1] : normalizedPath);
        });
    });
};


async function duplicateSystemYaml() {
    const LCUExePath = await getLCUExecutableFromProcess();
    const LCUDir = path.dirname(LCUExePath);

    const originalSystemFile = path.join(LCUDir, 'system.yaml');
    const overrideSystemFile = path.join(LCUDir, 'Config', 'rift-explorer', 'system.yaml');

    // File doesn't exist, do nothing
    if (!(await fs.exists(originalSystemFile))) {
        throw new Error('system.yaml not found');
    }

    const file = await fs.readFile(originalSystemFile, 'utf8');
    const fileParsed = yaml.parse(file);
    
    fileParsed.enable_swagger = true;

    const stringifiedFile = yaml.stringify(fileParsed);
    // Rito's file is prefixed with --- newline
    await fs.outputFile(overrideSystemFile, `---\n${stringifiedFile}`);
}

function restartLCUWithOverride() {
    return new Promise(async (resolve, reject) => {
        const LCUExePath = await getLCUExecutableFromProcess();
        const LCUDir = path.dirname(LCUExePath);
        const overrideSystemFile = path.join(LCUDir, 'Config', 'rift-explorer', 'system.yaml');
    
        // Windows is unable to kill the child processes for some reason so we have to force kill it
        await fkill(LEAGUE_PROCESS, { force: true });

        // By force killing it the LeagueClient doesn't cleanup the lockfile so we gotta do it manually
        await fs.remove(path.join(LCUDir, 'lockfile'));
        
        // Give it some time to do cleanup
        execa(LCUExePath, [`--system-yaml-override=${overrideSystemFile}`], { detached: true });
        resolve();
    });
}

module.exports = {
    getLCUExecutableFromProcess,
    duplicateSystemYaml,
    restartLCUWithOverride,
};
