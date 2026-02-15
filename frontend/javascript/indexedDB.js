import Dexie from './vendor/dexie.js';

const db = new Dexie('blackboardDB');

db.version(4).stores({
    blackboard: '[owner+branchId+timestamp]'
});

export default db;
export { Dexie };