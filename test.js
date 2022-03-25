/**
 * small console based chat app
 * if stonefish server running on localhost when serving stonefish
 * run using
 * deno run --allow-net -q http://localhost/stonefish/test.js
 */

import {link, Linkable} from './link.js';
import {readLines} from 'https://deno.land/std@0.109.0/io/bufio.ts';

// set of all connected linked log functions
const linkedLogs = new Set();

// reset escape code
const reset = '\u001b[0m';

// table of color escape codes
const colors = {
    red: '\u001b[31m',
    green: '\u001b[32m',
    yellow: '\u001b[33m',
    blue: '\u001b[34m',
    magenta: '\u001b[35m',
    cyan: '\u001b[36m',
}

// log a value to console and all connections
export async function log(value) {
    for(const log of linkedLogs) {
        await log(value).catch(v=>disconnect(log));
    }
}

// connect another logFunction
export async function connect (logFunction) {
    linkedLogs.add(logFunction);
}

// disconnect 
export async function disconnect (logFunction) {
    linkedLogs.delete(logFunction);
}

// some console printing functions
export function consoleWrite(text) {
    Deno.writeAllSync(Deno.stdout, new TextEncoder().encode(text));
}

// module runs as client side app if it is run in Deno by itself
if (globalThis.Deno && Deno.mainModule === import.meta.url) {

    // get the user's name
    let name = prompt('what is your name?');
    
    // get a color for the user
    let color = undefined;
    while(color === undefined) {
        const colorName = prompt('choose a color?');
        if (colorName in colors) color = colors[colorName];
        else console.log(`that is not a valid color, please choose from: ${Object.keys(colors).join()}`)
    }

    // connect to the server
    const server = await link(import.meta.url);
    await server.connect(new Linkable((text) => {consoleWrite(`\u001b[0G\u001b[J${text}\n${color}${name}> `);}));
    await server.log(`${color}[${name} joined the chat]${reset}`);

    // log via server to all connections on server when entered
    for await (const input of readLines(Deno.stdin)) {
        consoleWrite("\r\u001b[1A");
        await server.log(`${color}[${name}] ${input}`);
    }
}