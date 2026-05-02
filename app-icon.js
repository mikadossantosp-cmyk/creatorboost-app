// app-icon.js - liest 6 chunks zusammen (umgeht push-Limit)
const fs = require('fs');
const path = require('path');
let b64 = '';
for (let i = 1; i <= 6; i++) {
    try {
        b64 += fs.readFileSync(path.resolve(__dirname, 'icon-c' + i + '.txt'), 'utf8').trim();
    } catch(e) { console.error('Missing chunk:', i); }
}
module.exports = { b64 };
