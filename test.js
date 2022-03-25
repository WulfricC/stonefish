import {link, Linkable} from './link.js';

const clients = new Set();

const reset = '\u001b[0m';

const colors = {
    red: '\u001b[31m',
    green: '\u001b[32m',
    yellow: '\u001b[33m',
    blue: '\u001b[34m',
    magenta: '\u001b[35m',
    cyan: '\u001b[36m',
}

export async function log (value) {
    consoleWrite(`\r\x1B[0K${value}${reset}`);
    for(const log of clients) {
        await log(value).catch(v=>'')
    }
}
log.moduleURL = import.meta.url;

export async function connect (client) {
    clients.add(client);
}

export function imputPrompt() {
    Deno.writeAllSync(Deno.stdout, new TextEncoder().encode(`\n${color}${name}> `));
}

export function deleteLine() {
    Deno.writeAllSync(Deno.stdout, new TextEncoder().encode("\r\x1B[1A"));
}

export function consoleWrite(text) {
    Deno.writeAllSync(Deno.stdout, new TextEncoder().encode(text));
}

let name = 'no-name';
let color = undefined;

if (globalThis.Deno && Deno.mainModule === import.meta.url) {
    name = prompt('what is your name?');

    while(color === undefined) {
        const colorName = prompt('choose a color?');
        if (colorName in colors) color = colors[colorName];
        else console.log(`that is not a valid color, please choose from: ${Object.keys(colors).join()}`)
    }

    const server = await link(import.meta.url);
    await server.connect(new Linkable(log));
    await server.log(`${color}[${name} joined the chat]${reset}`);

    const {readLines} = await import('https://deno.land/std/io/bufio.ts');
    imputPrompt()
    for await (const input of readLines(Deno.stdin)) {
        deleteLine();
        await server.log(`${color}[${name}] ${input}`);
        imputPrompt();
    }
}
else {
    throw new Error(`the console chat example only works on Deno`);
}