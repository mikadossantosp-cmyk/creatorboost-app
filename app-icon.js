// app-icon.js - liest nur die echten chunks (c1+c2)
const fs = require('fs');
const path = require('path');
function readChunk(name) {
    try {
        const data = fs.readFileSync(path.resolve(__dirname, name), 'utf8').trim();
        if (data.includes('PLACEHOLDER')) return '';
        return data;
    } catch (e) { return ''; }
}
const b64 = readChunk('icon-c1.txt') + readChunk('icon-c2.txt');
module.exports = { b64 };
