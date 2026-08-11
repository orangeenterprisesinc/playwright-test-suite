/**
 * Types for the plain-JS Java bootstrap. Stays JS so allure-generate.js can use
 * it without a TypeScript runtime; src/reporting/generate/allure/report.ts used
 * to carry a second copy in TS.
 */

/** Patches JAVA_HOME/PATH from the Windows registry; true when a JVM is usable. */
export declare function ensureJavaOnPath(): boolean;

/** Whether `dir` looks like a JDK/JRE home (contains bin/java.exe). */
export declare function isValidJavaHome(dir: string | undefined): dir is string;
