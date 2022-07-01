/**
 * small console based chat app
 * if stonefish server running on localhost when serving stonefish
 * run using
 * deno run --allow-net -q http://localhost/stonefish/chat-example.js
 */

import {linkFile, Linkable, link as link} from './link.js';
import { HANDLER } from '../scrap/remote.js';
import {readLines} from 'https://deno.land/std@0.109.0/io/bufio.ts';

// set of all connected linked log functions
const linkedLogs = new Map();

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
    
    for(const log of linkedLogs.values()) {
        console.log(log[HANDLER]);
        await log(value).catch(v=>disconnect(log));
    }
}

// locally log
export async function serverlog(value) {
    console.log(value);
}

// connect another logFunction
export async function connect (name, logFunction) {
    linkedLogs.set(name, logFunction);
}

// disconnect 
export async function disconnect (name) {
    linkedLogs.delete(name);
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
    console.log('connecting to the server')
    const server = await linkFile(import.meta.url,undefined,undefined,undefined,undefined,v => console.log('CLOSED'));
    await server.connect(name, new Linkable((text) => consoleWrite(`\u001b[0G\u001b[J${text}\n${color}${name}> `)));
    await server.serverlog(server);
    //console.log(server.connect[HANDLER])
    await server.log(`${color}[${name} joined the chat]${reset}`);
    console.log(link.connections);
    // log via server to all connections on server when entered
    for await (const input of readLines(Deno.stdin)) {
        consoleWrite("\r\u001b[1A");
        await server.log(`${color}[${name}] ${input}`);
    }
}