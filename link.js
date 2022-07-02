import { Request, Response, Deref, Authenticate as Authenticate, Resolve, Message, Reject as Reject } from './message.js';
import { any, extern, type, struct, utf16, reference, array, string } from '../rob/encodings.js';
import { ExternScheme } from '../rob/scheme-handler.js';
import { ExternHandler, COMMUNICATION_SCHEMES, HttpExtern } from '../rob/extern-handler.js';
import { Read, Write } from '../rob/reader-writer.js';
import { bufferString, randomInt } from '../utils/mod.js';
import '../rob/built-ins.js'
import { _Array, _Error, _Module, _Null, _Number, _Object, _String, _Undefined } from '../rob/built-ins.js';
import { Always, Never } from './authenticator.js';
import * as Auth from './authenticator.js';
import { handler, SMBuilder, stack, _defined, _get, _getBind, _set } from './stack-machine-generator.js';
import { C, StackMachine } from './stack-machine.js';
import { importEsmod } from '../rob/esmod.js';

export const moduleURL = import.meta.url;

export class LinkError extends Error {
    static moduleURL = moduleURL;
    static encoding = struct(this, { message: utf16, stack: utf16, errors:any});
};

export class EncodingError extends LinkError {
    static moduleURL = moduleURL;
    static encoding = struct(this, { message: utf16, stack: utf16, errors:any});
};

export class AuthenticationError extends LinkError {
    static moduleURL = moduleURL;
    static encoding = struct(this, { message: utf16, stack: utf16 });
};

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

export class LinkedReference {
    static moduleURL = moduleURL;
    static encoding = extern('link');
}

export class Linked extends SMBuilder {
    static moduleURL = moduleURL;
    static encoding = extern('link');
    constructor(connection, rootItem) {
        super();
        this.connection = connection;
        return this.sub(rootItem);
    }
    expandDef(item) {
        // only linked stacks which point to the same location are expanded in
        return item instanceof Linked && stack(item).nodes[0] === this.stack.nodes[0]
    }
    async onThen() {
        // sync all non-merged stack values
        const synced = [];
        for (let i = 0; i < this.stack.nodes.length; i ++) {
            if (this.stack.nodes[i] instanceof Linked)
                synced[i] = await this.stack.nodes[i];
            else synced[i] = this.stack.nodes[i];
        }
        const syncedStack = new StackMachine(...synced);
        
        // resolve the stack machine on the server
        return this.connection.request(new Resolve(syncedStack));
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
        const linkedRef = new LinkedReference();
        this.registry.register(linkedRef, uri);
        this.uriCache.set(linkedRef, uri);
        this.remoteCache.set(uri, new WeakRef(linkedRef));
        return new Linked(this.connection, linkedRef);
    }
    unlink(uri, e) {
        const item = this.itemCache.get(uri);
        if (typeof item.onunlink === 'function') item.onunlink(e);
        this.itemCache.delete(uri);
    }
    onunlink(e) {
        for (const k of this.itemCache.keys())
            this.unlink(k, e);
    }
}

/** Header to reduce the size of common messages. */
const MESSAGING_HEAD = [
    // base types
    _String, _Number, _Object, _Error, _Null, _Undefined, _Array, _Module,

    // messaging
    Message, Authenticate, Request, Response, Resolve, Reject,

    // linking
    Linked, LinkedReference, Linkable,

    // stack machines
    StackMachine, C, _get, _getBind, _defined, _set,
];

/** Default api used with link*/
const LINK_API = new Linkable({
    import: async function(url) {
        console.log(url.replace(/^https?:/,'esmod:'))
        return importEsmod(url.replace(/^https?:/,'esmod:'));
    },
    ping: async function(val) {
        return val;
    }
});

/** Server handler linked apis over webSocket. */
export class WSLink {
    constructor({path = '/', authenticator = new Always(), api = LINK_API} = {}) {
        this.path = path;
        this.authenticator = authenticator;
        this.api = api;
    }
    route (request){
        const routehere = request.method === 'GET'
            && request.headers.get('upgrade') === 'websocket'
            && new URL(request.url).pathname === this.path
        ;
        return routehere;
    }
    async onRequest (request, respondWith) {
        const {socket, response} = Deno.upgradeWebSocket(request);
        try {
            new Connection(socket, this.api, this.authenticator, undefined, request.headers);
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
    constructor(connectionInterface, api = {}, authenticator = new Always(), authApi = new Linkable(Auth), initialRequestHeaders) {
        this.authenticator = authenticator;
        this.authenticated = false;
        this.connectionInterface = connectionInterface;
        this.api = api;
        this.authApi = authApi;
        this.initialRequestHeaders = initialRequestHeaders;
        this.connectionInterface.onmessage = (e) => this.recieve(e.data);
        this.secureResolvables = false;
        this.closers = [];
        this.connectionInterface.onclose = (e) => {this.linkHandler.onunlink(e)};
        this.connectionInterface.onerror = (e) => {this.linkHandler.onunlink(e);};

        this.unresolvedPromises = new Map();
        this.instances = new Map();
        this.linkHandler = new LinkScheme(this);
        this.externHandler = new ExternHandler({...COMMUNICATION_SCHEMES, link: this.linkHandler});
    }
    authenticate(token = '') {
            return this.request(new Authenticate(token, this.authApi));
    }
    /**send some data as rob*/
    async send(data) {
        try {
            const writer = new Write(this.externHandler, MESSAGING_HEAD);
            if (DEBUG.includes('message')) console.log('<<< ', data);
            try {
                any(writer)(data);
            }
            catch(err) {
                console.log(err);
                throw new EncodingError(`unable to encode message.  encodings probably not defined`)
            }
            const buffer = writer.toBuffer();
            if (DEBUG.includes('buffer')) console.log(`<${buffer.byteLength.toString().padStart(4,'0')}< ${bufferString(buffer)}`);
            this.connectionInterface.send(buffer);
        }
        catch(err) {
            if (err instanceof EncodingError) throw err;
            throw new LinkError('error sending data over link');
        }
    }
    /** handle recieved data */
    async recieve(data) {
        let buffer = data;
        if (data instanceof Blob)
            buffer = await data.arrayBuffer();
        const reader = new Read(this.externHandler, buffer, MESSAGING_HEAD);
        let message;
        try { message = await any(reader)(); }
        catch(err) { throw new EncodingError('unable to decode message')}
        if (DEBUG.includes('buffer')) console.log(`>${buffer.byteLength.toString().padStart(4,'0')}> ${bufferString(buffer)}`);
        if (DEBUG.includes('message')) console.log('>>>' , message);
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
            this.externHandler.unlink(message.uri);
        }
        if (message instanceof Resolve) {
            try {
                if (!this.authenticated | this.secureResolvables) {
                    if (!(message.resolver instanceof StackMachine))
                        throw new AuthenticationError('request breaks connection security policy');
                }
                //console.log('RESOLVE', message.resolver)
                const result = await message.resolver.resolve();
                await this.send(message.response(result));
            }
            catch(err) {
                this.send(message.error(err));
            }
            return;
        }
        if (message instanceof Authenticate) {
            try {
                if (await this.authenticator.authencicate(message.key, message.api, this.initialRequestHeaders)) {
                    this.authenticated = true;
                    await this.send(message.response(this.api));
                }
                else {
                    throw new AuthenticationError(`could not authenticate`);
                }
            }
            catch (err) {
                this.send(message.error(err));
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

const activeConnections = new Map();

//** Connect to a server via Websocket, this will just return the open API of the connection */
export async function link(socketUrl, {
            key = '', 
            api = {}, 
            authencicator = new Never(),
            onunlink = (e) => console.log(`connection lost with ${socketUrl}}`)
        }={}) {

    // connect to localhost more directly to speed up connections
    if (new URL(socketUrl).hostname === 'localhost') {
        const tempURL = new URL(socketUrl);
        tempURL.hostname = '127.0.0.1';
        socketUrl = tempURL.toString();
    }

    // if not connected connect
    if (activeConnections.has(socketUrl)) {
        return activeConnections.get(socketUrl);
    }
    else {
        // connect to the server using websocket
        const socket = new WebSocket(socketUrl);

        // wait for connection
        await new Promise(
            (resolve, reject) => {
                socket.onopen = () => resolve(socket);
                socket.onerror = (e) => {onunlink(e); reject(socket)};
                socket.onclose = (e) => {onunlink(e); reject(socket)};
                }
            );

        // create a connection
        const connection = new Connection(socket, api, authencicator);
        const linked = await connection.authenticate(key);
        activeConnections.set(socketUrl,connection);
        return linked;
    }
}


/** Link to a server via Websocket (at the moment), link now connects to a specific socket url, and the url of the file to link to is seperate*/
export async function linkFile (resourceLocation,  {socketUrl, key, api, authencicator, onunlink}={}) {

    // build the socket url if it has not been defined
    if (!socketUrl) socketUrl = defaultUrl();
    //!! relative path resolution may not work on safari
    let url;
    if (/^\.?\.?\//.test(resourceLocation)) {
        let stack = new Error().stack.split('\n').filter(v => /https?:\/\//g.test(v))
        const sourceUrl = stack[1].slice(
            stack[1].lastIndexOf('http'), 
            stack[1].lastIndexOf('.')+3
        )
        url = new URL(resourceLocation, sourceUrl).toString();
    }
    else
        url = resourceLocation;
   
    const server = await link(socketUrl, {key, api, authencicator, onunlink});
    return server.import(url);
}

export function unlink(url) {
    if (!url) url = defaultUrl();
    const urlBuild = new URL(url);
    if (urlBuild.hostname === 'localhost')
    urlBuild.hostname = '127.0.0.1';
    const connection = activeConnections.get(urlBuild.toString());
    if (connection) {
        connection.connectionInterface.close();
    }
}

function defaultUrl () {
    const tempURL = new URL(location?.origin ?? import.meta.url);
    if (tempURL.protocol === 'http:') tempURL.protocol = 'ws:';
    else if (tempURL.protocol === 'https:') tempURL.protocol = 'wss:';
    else throw new Error('cannot auto define socket URL');
    return tempURL.origin.toString();
}

export function connection (linked) {
    return handler(linked).connection;
}


/*
PLANS
unlink is not perfect
what about unlinking from the server side?
as links are cached multiple links are ok, but how to deal with caching links
and unlinking on the server, and where would you do that?
and detecting links that have closed unnanounced (should be easy with polling as that is nessecary anyway)
what happens if you link to the same location multiple times and then unlink, as they are
through the connection and links are cached all will be killed as far as I know.
*/