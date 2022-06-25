import { Request, Response, Deref, Authenticate as Authenticate, Resolve, Message, Reject as Reject } from './message.js';
import { any, extern, type } from '../rob/encodings.js';
import { ExternScheme } from '../rob/scheme-handler.js';
import { ExternHandler, COMMUNICATION_SCHEMES } from '../rob/extern-handler.js';
import { Read, Write } from '../rob/reader-writer.js';
import { bufferString, randomInt } from '../utils/mod.js';
import { Pipe, PipeNode, _IN, _PREV  } from './sendable-pipe.js';
import { ChainToPipeHandler, set, deleteProperty, apply, get } from "./chain-to-pipe.js";
import '../rob/built-ins.js'
import { _Error, _Null, _Number, _Object, _String, _Undefined } from '../rob/built-ins.js';
import { Always, Never } from './authenticator.js';

export const moduleURL = import.meta.url;


/** Add 'module' to show modules being sent, add 'buffer' to show raw data. */
const DEBUG = [];

/** An object which is sent as a link rather than as iteslf. (Any extern('link') encoding will also send as a link however)*/
export class Linkable {
    constructor (object) {
        if (typeof object === 'function') {
            this.apply = (f,t,a) => object.apply(f,t,a);
            return this;
        }
        Object.assign(this, object);
    }
    static moduleURL = moduleURL;
    static encoding = extern('link');
}


/** An object which references a remotely linked object. */
export class Linked extends ChainToPipeHandler{
    constructor (connection, uri) {
        super();
        this.resolve = async pipe => connection.request(new Resolve(await pipe.awaitAll(), this.proxy));
    }

    static moduleURL = moduleURL;
    static encoding = extern('link');

    toPrimitive(hint) {
        if (hint === 'string' || hint === 'default')
            return `<linked ${this.randId}>`;
        if (hint === 'number')
            return NaN;
    }
}

/** Definition of the "link:" scheme. */
export class LinkScheme extends ExternScheme {
    constructor(connection) {
        super();
        this.connection = connection;
        this.itemCache = new Map();

        this.uriCache = new WeakMap();

        this.remoteCache = new Map();

        this.registry = new FinalizationRegistry(heldValue => {
            this.connection.send(new Deref(heldValue));
        });
    }
    getURI(item) {
        if (item.constructor === Linked)
            return this.uriCache.get(item);
        if (this.uriCache.has(item)) {
            return this.uriCache.get(item);
        }
        const uri = `link:${randomInt().toString(32)}`;
        this.itemCache.set(uri, item);
        this.uriCache.set(item, uri);
        return uri;
    }
    getItem(uri) {
        if (this.itemCache.has(uri))
            return this.itemCache.get(uri);
        if (this.remoteCache.has(uri)) {
            return this.remoteCache.get(uri).deref();
        }
        const linked = new Linked(this.connection, uri).proxy;
        this.registry.register(linked, uri);
        this.uriCache.set(linked, uri);
        this.remoteCache.set(uri, new WeakRef(linked));
        return linked;
    }
    clear(uri) {
        this.itemCache.delete(uri);
    }
}

/** Header to reduce the size of common messages. */
const MESSAGING_HEAD = [
    _String, _Number, _Object, _Error, _Null, _Undefined,
    Message, Authenticate, Request, Response, Resolve,
    Linked, Linkable, 
    Pipe, PipeNode, _PREV, _IN, get, apply, set, deleteProperty,
];

/** Default api used with link*/
const LINK_API = new Linkable({
    import: async function(url) {
        return  import(url);
    },
    ping: async function(val) {
        return val;
    }
});

/** Server handler linked apis over webSocket. */
export class WSLink {
    constructor({path = '/', authenticator = new Always()} = {}, api = LINK_API) {
        this.path = path;
        this.authenticator = authenticator;
        this.api = api;
    }
    route (request){
        return request.method === 'GET'
            && request.headers.get('upgrade') === 'websocket'
            && new URL(request.url).pathname === this.path
        ;
    }
    async onRequest (request, respondWith) {
        const {socket, response} = Deno.upgradeWebSocket(request);
        try {
            new Connection(socket, this.api, this.authenticator);
            respondWith(response);
        }
        catch(err) {
            console.log(err);
            respondWith(new Response(err.toString(), {status : 400}));
        }
    }
}

/** Object which handles a connnection over some interface via ROB.  ConnectionInterface must implement onmessage and send */
export class Connection {
    constructor(connectionInterface, api = {}, authenticator = new Always()) {
        this.authenticator = authenticator;
        this.authenticated = false;
        this.connectionInterface = connectionInterface;
        this.api = api;
        this.connectionInterface.onmessage = (e) => this.recieve(e.data);

        this.closers = [];
        this.connectionInterface.onclose = (e) => {for(const func of this.closers) func()};

        this.unresolvedPromises = new Map();
        this.instances = new Map();
        this.externHandler = new ExternHandler({...COMMUNICATION_SCHEMES, link: new LinkScheme(this)});
    }
    async authenticate(token = '') {
        return await this.request(new Authenticate(token));
    }
    /**send some data as rob*/
    async send(data) {
        try {
            const writer = new Write(this.externHandler, MESSAGING_HEAD);
            if (DEBUG.includes('message')) console.log('🌐<🖥️', data);
            any(writer)(data);
            const buffer = writer.toBuffer();
            if (DEBUG.includes('buffer')) console.log('🌐<🖥️',buffer.byteLength, ' ', bufferString(buffer));
            this.connectionInterface.send(buffer);
        }
        catch(err) {
            console.log(data);
            throw err;
        }
    }
    /** handle recieved data */
    async recieve(data) {
        let buffer = data;
        if (data instanceof Blob)
            buffer = await data.arrayBuffer();
        const reader = new Read(this.externHandler, buffer, MESSAGING_HEAD);
        if (DEBUG.includes('buffer')) console.log('🌐>🖥️',buffer.byteLength, ' ', bufferString(buffer));
        const message = await any(reader)();
        if (DEBUG.includes('message')) console.log('🌐>🖥️', message);
        if (message instanceof Response) {
            this.unresolvedPromises.get(message.id).resolve(message.value);
            this.unresolvedPromises.delete(message.id);
            return;
        }
        if (message instanceof Reject) {
            this.unresolvedPromises.get(message.id).reject(message.value);
            this.unresolvedPromises.delete(message.id);
            return;
        }
        if (message instanceof Deref) {
            this.externHandler.clear(message.uri);
        }
        if (message instanceof Resolve) {
            try {
                const result = await message.resolver.resolve(message.input);
                this.send(message.response(result));
            }
            catch(err) {
                this.send(message.error(err));
            }
            return;
        }
        if (message instanceof Authenticate) {
            if(this.authenticator.authencicate(message.key)) {
                this.authenticated = true;
                //const api = await import(message.url);
                await this.send(message.response(this.api));
                //auto run onlink?
            }
            else {
                await this.send(message.error(new Error(`could not authenticate`)));
                this.connectionInterface.close();
            }
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
    /**handle disconnect */
    addCloser(closer) {
        this.closers.push(closer);
    }
}


//** Connect to a server via Websocket, this will just return the open API of the connection */
export async function connect(socketUrl, key = 'password', api = {}, authencicator = new Never(), onclose = () => {}) {
    // connect to localhost more directly to speed up connections
    if (new URL(socketUrl).hostname === 'localhost') {
        const tempURL = new URL(socketUrl);
        tempURL.hostname = '127.0.0.1';
        socketUrl = tempURL.toString();
    }
    
    // if not connected connect
    if (socketUrl in connect.connections) {
        return connect.connections[socketUrl];
    }
    else {
        // connect to the server using websocket
        const socket = new WebSocket(socketUrl);

        // wait for connection
        await new Promise(
            (resolve, reject) => {
                socket.onopen = () => resolve(socket);
                socket.onerror = () => reject(socket);
                socket.onclose = (e) => {onclose(e); reject(socket)};
                }
            );

        // create a connection
        const connection = new Connection(socket, api, authencicator);
        const linked = await connection.request(new Authenticate(key));
        connect.connections[socketUrl] = connection;
        return linked;
    }
}
connect.connections = {};

/** Link to a server via Websocket (at the moment), link now connects to a specific socket url, and the url of the file to link to is seperate*/
export async function link (resourceLocation, socketUrl, key, api, authencicator, onclose) {

    // build the socket url if it has not been defined
    if (socketUrl === undefined) {
        const tempURL = new URL(location?.origin ?? import.meta.url);
        if (tempURL.protocol === 'http:') tempURL.protocol = 'ws:';
        else if (tempURL.protocol === 'https:') tempURL.protocol = 'wss:';
        else throw new Error('cannot auto define socket URL');
        socketUrl = tempURL.origin.toString();
    }
    const server = await connect(socketUrl);
    return server.import(resourceLocation);
}

/**
Small Example:
const {link} = await import('./stonefish/link.js');
const link = await link('./stonefish/test.js');
await link.log('hello world');
 */