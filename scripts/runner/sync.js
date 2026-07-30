/**
 * Regenerates the JSON mirror of every runner CSV.
 *
 *     npm run runner:sync
 *
 * The CSV is the authored source (one file per journey, Excel-friendly); the JSON
 * exists so `TEST_DATA_SOURCE=json` reads the same rows. Run this after editing a
 * CSV — `npm run runner:check` fails the build when the two disagree.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { RUNNER_DIR, runnerFileNames, readCsv, toJsonText } = require('./lib/runner-data');

function main() {
    const names = runnerFileNames();
    if (!names.length) {
        console.error(`No runner CSV files found in ${RUNNER_DIR}`);
        process.exit(1);
    }

    let changed = 0;
    for (const name of names) {
        const target = path.join(RUNNER_DIR, `${name}.json`);
        const next = toJsonText(readCsv(name));
        const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;

        if (current === next) {
            console.log(`  = ${name}.json (unchanged)`);
            continue;
        }
        fs.writeFileSync(target, next, 'utf8');
        changed++;
        console.log(`  ${current === null ? '+' : '~'} ${name}.json`);
    }

    console.log(`Synced ${names.length} runner file(s); ${changed} JSON mirror(s) written.`);
}

main();
