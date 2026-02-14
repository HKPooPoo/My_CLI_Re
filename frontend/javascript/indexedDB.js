import Dexie from 'https://unpkg.com/dexie@latest/dist/dexie.mjs';

const db = new Dexie('blackboardDB');

db.version(4).stores({
    blackboard: '[owner+branchId+timestamp]'
});

export default db;
export { Dexie };