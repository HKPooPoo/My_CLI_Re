/**
 * 1.
 * uid PK
 * passcode_hash
 * email PK
 * 
 * 2.
 * uid FK //on user not login, uid = my_cli_guide
 * commit_hash PK
 * commit_branch
 * commit_father_hash
 * commit_time
 * content //on content no change, abord commit
 * 
 * 3.
 * 
 * 
 * html:
 * push = head++
 * pull = head--
 * commit = -> local data to postgres
 * checkout = <- postgres data to local
 * stash = snapshot local data as new commit
 * pop = rollback local data to previous commit
 */


import Dexie from 'https://unpkg.com/dexie@latest/dist/dexie.mjs';

const db = new Dexie('blackboardDB');

db.version(2).stores({
    account: '&uid, passcode, &email',
    blackboard: '++id, [owner+branch+timestamp]'
});

export default db;
export { Dexie };