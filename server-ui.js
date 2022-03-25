import {link, Linkable} from './link.js';
import { randomInt } from '../utils/random-utils.js';
import { extern } from '../rob/encodings.js';

const clients = new Set();

export async function log (value) {
    console.log(value);
    for(const log of clients) {
        try {
            await log(value);
        }
        catch (err){
            if (err.name === 'InvalidStateError')
                clients.delete();
        }
    }
}
log.moduleURL = import.meta.url;

export async function connect (client) {
    clients.add(client);
    return client;
}

export async function disconnect (client) {
    clients.delete(client);
}

export async function main() {
    const server = await link('./stonefish/server-ui.js');
    await server.connect(new Linkable(log));
    await server.log('connected');
    return server.log.pack;
}