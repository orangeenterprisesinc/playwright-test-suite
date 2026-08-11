/**
 * @fileoverview Customer-scope filtering — segment and module based.
 *
 * The Workflow Catalog derives a customer's scope by hand: "select workflows
 * whose Segments include one of the customer's segments AND whose Modules are all
 * within the customer's enabled module set", then commits the result as a static
 * list that "does not update itself if this catalog changes".
 *
 * Because every runner row now carries the catalog's `segments` and `modules`,
 * that derivation is a function instead of a static list — set `TEST_SCOPE` to a
 * file in `config/scopes/` and the run covers exactly that customer's
 * workflows, recomputed from the rows every time:
 *
 * ```bash
 * TEST_SCOPE=anthony-vineyards npx playwright test
 * ```
 *
 * Unset `TEST_SCOPE` means no filtering — every row runs, which is the default and
 * the previous behaviour.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Logger } from '../utils/logger';
import { expandModules } from '../data/static/shared/modules';
import { expandSegments } from '../data/static/shared/segments';
import type { TestCaseData } from '../types';

const logger = new Logger('Scope');

/** Directory holding the committed customer scope definitions. */
const SCOPES_DIR = path.resolve(__dirname, '..', '..', 'config', 'scopes');

/** A customer's enabled segments and licence modules. */
export interface CustomerScope {
    name: string;
    description?: string;
    /** `false` while the module list is inferred rather than confirmed with the account. */
    confirmed?: boolean;
    segments: string[];
    modules: string[];
}

/** Why a row is out of scope, or `null` when it is in scope. */
export type ScopeVerdict = { inScope: true } | { inScope: false; reason: string };

let cached: { name: string; scope: CustomerScope | null } | null = null;

/**
 * Loads the scope named by `TEST_SCOPE`, or `null` when none is set.
 *
 * A named-but-missing scope file is a configuration error and throws, rather than
 * silently running everything — the failure mode of a typo'd scope name is a run
 * that looks like it filtered but did not.
 */
export function getActiveScope(): CustomerScope | null {
    const name = (process.env.TEST_SCOPE || '').trim();

    if (cached && cached.name === name) return cached.scope;

    if (!name) {
        cached = { name, scope: null };
        return null;
    }

    const file = path.join(SCOPES_DIR, `${name}.json`);
    if (!fs.existsSync(file)) {
        const available = fs.existsSync(SCOPES_DIR)
            ? fs.readdirSync(SCOPES_DIR).filter((f) => f.endsWith('.json')).map((f) => path.basename(f, '.json'))
            : [];
        throw new Error(
            `TEST_SCOPE='${name}' but ${file} does not exist. Available scopes: ${available.join(', ') || 'none'}`,
        );
    }

    const scope = JSON.parse(fs.readFileSync(file, 'utf8')) as CustomerScope;
    logger.info(
        `Scope '${scope.name}': segments=[${scope.segments.join(', ')}], ${scope.modules.length} modules enabled` +
        (scope.confirmed === false ? ' (module list not yet confirmed with the account)' : ''),
    );

    cached = { name, scope };
    return scope;
}

/**
 * Whether a runner row is within the active scope.
 *
 * A row that declares neither segments nor modules is always in scope — that is
 * how the non-catalog `system` rows (login, auth) behave, since they are not
 * workflows and are not segment- or licence-dependent.
 */
export function evaluateScope(row: TestCaseData | null, scope: CustomerScope | null = getActiveScope()): ScopeVerdict {
    if (!scope || !row) return { inScope: true };

    const rowSegments = expandSegments(row.segments ?? []);
    const rowModules = expandModules(row.modules ?? []);

    if (rowSegments.length) {
        const customerSegments = new Set(scope.segments);
        const shared = rowSegments.filter((segment) => customerSegments.has(segment));
        if (!shared.length) {
            return {
                inScope: false,
                reason:
                    `segments [${rowSegments.join(', ')}] do not include any of ` +
                    `'${scope.name}' segments [${scope.segments.join(', ')}]`,
            };
        }
    }

    if (rowModules.length) {
        const enabled = new Set(expandModules(scope.modules));
        const missing = rowModules.filter((module) => !enabled.has(module));
        if (missing.length) {
            return {
                inScope: false,
                reason: `module(s) not enabled for '${scope.name}': ${missing.join(', ')}`,
            };
        }
    }

    return { inScope: true };
}
