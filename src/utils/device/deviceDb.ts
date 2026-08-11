import Database from 'better-sqlite3';

export function openDb(file: string): Database.Database {
    return new Database(file, { readonly: true });
}

export function rows<T = Record<string, unknown>>(
    db: Database.Database,
    sql: string,
    ...params: unknown[]
): T[] {
    return db.prepare(sql).all(...params) as T[];
}
