import { Link } from './link-old.js';
import {Request, Response} from './message.js';
import { uint8 } from './rob/encodings/base-encodings.js';
import { type } from './rob/encodings.js';
import { any, extern } from './rob/encodings/reference-encodings.js';
import { ExternScheme } from './rob/scheme-handler.js';
import { Pipe } from './sendable-pipe.js';
import { ExternHandler, COMMUNICATION_SCHEMES } from './rob/extern-handler.js';
import { Read, Write } from './rob/reader-writer.js';
import { bufferString, randomInt } from './utils/mod.js';

export const moduleURL = import.meta.url;

export class Authenicate extends Request {
    static moduleURL = moduleURL;
    static encoding = type(this);
    constructor(key) {
        super();
        this.key = key;
    }
}

/** placeholder for objects which are remotely linked */
export class LinkedPlaceholder {
    static moduleURL = import.meta.url;
    static encoding = extern('link');
    constructor(connection, uri) {
        this.connection = connection;
        this.uri = uri;
    }
}

/** a linked object, inheriting from this will link the instance, but other link methods may be used */
export class Linked {
    static moduleURL = import.meta.url;
    static encoding = extern('link');
}

export class LinkTest extends Linked {
    constructor() {
        super();
        this.a = 1;
        this.b = 2;
    }
}

/** handler for linking remote modules */
export class RemoteModuleLinker {
    constructor() {
    }
    async onRequest (request, respondWith) {
        const {socket, response} = Deno.upgradeWebSocket(request);
        try {
            const link = new Connection(socket, new LinkTest);
            //console.log(link);
            respondWith(response);
            //await new Promise((resolve, reject) => socket.onopen = () => resolve(socket));
            
            //if ('onLink' in module) module.onLink(link);
        }
        catch(err) {
            console.log(err);
            respondWith(new Response(err.toString(), {status : 400}));
        }
    }
}

/** handler for the "link:" scheme */
export class LinkScheme extends ExternScheme {
    constructor(connection) {
        super();
        this.connection = connection;
    }
    getURI(item) {
        if (item instanceof LinkedPlaceholder) return item.uri;
        else return `link:${randomInt().toString(32)}`;
    }
    getItem(uri) {
        return new LinkedPlaceholder(this.connection, uri);
    }
}

/** object which handles a connnection over some interface via ROB */
export class Connection {
    constructor(connectionInterface, api) {
        this.connectionInterface = connectionInterface;
        this.api = api;
        this.connectionInterface.onmessage = (e) => this.recieve(e.data);
        this.unresolvedPromises = new Map();
        this.instances = new Map();
        this.externHandler = new ExternHandler({...COMMUNICATION_SCHEMES, link: new LinkScheme(this)});
    }
    /**send some data as rob*/
    async send(data) {
        try {
            const writer = new Write(this.externHandler);
            any(writer)(data);
            const buffer = writer.toBuffer();
            console.log('<<<', bufferString(buffer));
            this.connectionInterface.send(buffer);
        }
        catch(err) {
            console.log(data);
            throw err;
        }
    }
    /**handle recieved data */
    async recieve(data) {
        let buffer = data;
        if (data instanceof Blob)
            buffer = await data.arrayBuffer();
        console.log('>>>', bufferString(buffer));
        const reader = new Read(this.externHandler, buffer);
        const message = await any(reader)();
        console.log(message, message instanceof Response);
        if (message instanceof Response) {
            this.unresolvedPromises.get(message.id).resolve(message.value);
            this.unresolvedPromises.delete(message.id);
            return;
        }
        if (message instanceof Pipe) {
            this.send(message.response(message.resolve()));
            return;
        }
        if (message instanceof Authenicate) {
            this.send(message.response(this.api));
            return;
        }
    }
    /**send expecting response */
    async request (request) {
        if (!(request instanceof Request))
            throw new Error(`requests only work with Request Messages`);
        const promise = new Promise((resolve, reject) => this.unresolvedPromises.set(request.id,{resolve, reject}));
        await this.send(request);
        return promise;
    }
}

export async function link (uri) {
    uri = new URL (uri, location.origin);
    if (!/(.js)|(.mjs)$/.test(uri.pathname)) throw new Error('can only link to a javascript module');
    if (uri.protocol === 'ws:' || uri.protocol === 'wss:') {
        const socket = new WebSocket(uri);
        await new Promise((resolve, reject) => socket.onopen = () => resolve(socket));
        const connection = new Connection(socket);
        return connection.request(new Authenicate('password'));
    }   
}