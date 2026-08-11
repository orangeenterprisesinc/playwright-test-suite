// Ad-hoc DB inspector: node scripts/inspect-db.js <path-to.db> [table ...]
const D = require('better-sqlite3');
const db = new D(process.argv[2], { readonly: true });
const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all()
    .map((r) => r.name);
const wanted = process.argv.slice(3);
console.log('TABLES:', tables.join(', '));
for (const t of wanted.length ? wanted : ['TimeCard_Records', 'CrewIn_Records', 'Employee_Records']) {
    if (!tables.includes(t)) {
        console.log('==', t, 'ABSENT');
        continue;
    }
    const rs = db.prepare('SELECT * FROM ' + t).all();
    console.log('==', t, rs.length);
    rs.slice(0, 10).forEach((r) => console.log('  ', JSON.stringify(r)));
}
