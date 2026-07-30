/**
 * `allure-commandline` ships no type declarations. Its default export
 * spawns the bundled Allure CLI (via Java) and returns the child process.
 */
declare module 'allure-commandline' {
    import type { ChildProcess } from 'node:child_process';

    function allureCommandline(args: string[]): ChildProcess;
    export default allureCommandline;
}
