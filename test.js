/**
 * small console based chat app
 * if stonefish server running on localhost when serving stonefish
 * run using
 * deno run --allow-net -r http://localhost/stonefish/test.js
 */

import {link, Linkable} from './link.js';
import {readLines} from 'https://deno.land/std/io/bufio.ts';

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
export async function log (value) {
    consoleWrite(`\r\x1B[0K${value}${reset}`);
    for(const log of linkedLogs) {
        await log(value).catch(v=>'')
    }
}
log.moduleURL = import.meta.url;

// connect another logFunction
export async function connect (logFunction) {
    linkedLogs.add(logFunction);
}

// some console printing functions
export function writePrompt(color, name) {
    Deno.writeAllSync(Deno.stdout, new TextEncoder().encode(`\n${color}${name}> `));
}

export function deleteLine() {
    Deno.writeAllSync(Deno.stdout, new TextEncoder().encode("\r\x1B[1A"));
}

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
    await server.connect(new Linkable(log));
    await server.log(`${color}[${name} joined the chat]${reset}`);

    // log via server to all connections on server when entered
    writePrompt()
    for await (const input of readLines(Deno.stdin)) {
        deleteLine();
        await server.log(`${color}[${name}] ${input}`);
        writePrompt(color, name);
    }

}
else {
    throw new Error(`the console chat example only works on Deno`);
}