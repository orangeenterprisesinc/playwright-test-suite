/**
 * Serves the generated Allure report locally (blocks until Ctrl+C).
 * Usage: node scripts/open-allure-report.js [reportDir]
 */
const allureCommandline = require('allure-commandline');
const { ensureJavaOnPath } = require('./ensure-java');

const [reportDir = 'allure-report'] = process.argv.slice(2);

ensureJavaOnPath();
const server = allureCommandline(['open', reportDir]);
server.on('exit', (code) => process.exit(code === null ? 1 : code));
