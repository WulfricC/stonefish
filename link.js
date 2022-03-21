import {Request, Response, Deref, Authenicate, Resolve, Message, Reject as Reject} from './message.js';
import { any, extern } from '../rob/encodings.js';
import { ExternScheme } from '../rob/scheme-handler.js';
import { ExternHandler, COMMUNICATION_SCHEMES } from '../rob/extern-handler.js';
import { Read, Write } from '../rob/reader-writer.js';
import { bufferString, randomInt } from '../utils/mod.js';
import { ChainToPipeHandler, set, deleteProperty, apply, get, Pipe, PipeNode, _IN, _PREV  } from './sendable-pipe.js';
import '../rob/built-ins.js'
import { _Error, _Null, _Number, _Object, _String, _Undefined } from '../rob/built-ins.js';
import { Always, Never } from './authenticator.js';

export const moduleURL = import.meta.url;

/** Add 'module' to show modules being sent, add 'buffer' to show raw data. */
const DEBUG = ['buffer'];

/** An object which is sent as a link rather than as iteslf. (Any extern('link') encoding will send as a link however)*/
export class Linkable {
    constructor (object) {
        Object.assign(this, object);
    }
    static moduleURL = moduleURL;
    static encoding = extern('link');
}

/** An object which references a remotely linked object. */
export class Linked extends ChainToPipeHandler{
    constructor (connection, uri) {
        super();
        const proxy = new Proxy(()=>{}, this);
        this.resolve = async pipe => connection.request(new Resolve(await pipe.awaitAll(), proxy));
        return proxy;
    }
    static moduleURL = moduleURL;
    static encoding = extern('link');
}

/** Server handler for linking remote modules. */
export class RemoteModuleLinker {
    constructor({fileRoot = './', authenticator = new Always()} = {}) {
        this.fileRoot = fileRoot;
        this.authenticator = authenticator;
    }
    route (request){
        return request.method === 'GET'
            && request.headers.get('upgrade') === 'websocket';
    }
    async onRequest (request, respondWith) {
        const {socket, response} = Deno.upgradeWebSocket(request);
        try {
            const url = new URL(request.url);
            const fileUrl = (url.host === 'localhost' && globalThis.Deno 
                ? 'file://' + ('/' + Deno.cwd().replaceAll('\\', '/')).replace('//', '/') + url.pathname
                : uri.replace(/^\w+:/g, 'http:')).replace(/#.*/, '');
            const module = await import(fileUrl);
            const link = new Connection(socket, new Linkable(module), this.authenticator);
            respondWith(response);
            socket.onopen = async () => {
                try {
                    const api = await link.request(new Authenicate(''));
                    if ('onLink' in module) module.onLink(api);
                }
                catch (err) {};
            }
        }
        catch(err) {
            console.log(err);
            respondWith(new Response(err.toString(), {status : 400}));
        }
    }
}

/** Definition of the "link:" scheme. */
export class LinkScheme extends ExternScheme {
    constructor(connection) {
        super();
        this.connection = connection;
        this.itemCache = new Map();
        this.uriCache = new WeakMap();
        this.registry = new FinalizationRegistry(heldValue => {
            this.connection.send(new Deref(heldValue));
        });
    }
    getURI(item) {
        if (item.constructor === Linked)
            return this.uriCache.get(item);
        const uri = `link:${randomInt().toString(32)}`;
        this.itemCache.set(uri, item);
        return uri;
    }
    getItem(uri) {
        if (this.itemCache.has(uri))
            return this.itemCache.get(uri);
        const linked = new Linked(this.connection, uri);
        this.registry.register(linked, uri);
        this.uriCache.set(linked, uri);
        return linked;
    }
    clear(uri) {
        this.itemCache.delete(uri);
    }
}

/** Header to reduce the size of common messages. */
const MESSAGING_HEAD = [
    _String, _Number, _Object, _Error, _Null, _Undefined,
    Message, Authenicate, Request, Response, Resolve,
    Linked, Linkable, 
    Pipe, PipeNode, _PREV, _IN, get, apply, set, deleteProperty,
];

/** Object which handles a connnection over some interface via ROB.  ConnectionInterface must implement onmessage and send */
export class Connection {
    constructor(connectionInterface, api, authenticator = new Always()) {
        this.authenticator = authenticator;
        this.authenticated = false;
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
            const writer = new Write(this.externHandler, MESSAGING_HEAD);
            any(writer)(data);
            const buffer = writer.toBuffer();
            if (DEBUG.includes('message')) console.log('<<<', data);
            if (DEBUG.includes('buffer')) console.log('<<<',buffer.byteLength, ' ', bufferString(buffer));
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
        const message = await any(reader)();
        if (DEBUG.includes('message')) console.log('>>>', message);
        if (DEBUG.includes('buffer')) console.log('>>>',buffer.byteLength, ' ', bufferString(buffer));
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
            if (this.authenticated) {
                try {
                    const result = message.resolver.resolve(message.input);
                    this.send(message.response(result));
                }
                catch(err) {
                    this.send(message.error(err));
                }
            }
            else {
                await this.send(message.error(new Error(`connection is not authenticated`)));
                this.connectionInterface.close();
            }
            return;
        }
        if (message instanceof Authenicate) {
            if(this.authenticator.authencicate(message.key)) {
                await this.send(message.response(this.api));
                this.authenticated = true;
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
}


/** Link to a server via Websocket (at the moment)*/
export async function link (uri, api) {
    uri = new URL (uri, location.origin);
    if (!/(.js)|(.mjs)$/.test(uri.pathname)) throw new Error('can only link to a javascript module');
    if (new URL(location.origin).protocol === 'http:') uri.protocol = 'ws:';
    else if (new URL(location.origin).protocol === 'https:') uri.protocol = 'wss:';
    else throw new Error (`invalid protocol "${uri.protocol}"`)
    const socket = new WebSocket(uri);
    await new Promise((resolve, reject) => socket.onopen = () => resolve(socket));
    const connection = new Connection(socket, api);
    return connection.request(new Authenicate('password'));
}

/**
Small Example:
const {link} = await import('./stonefish/link.js');
const link = await link('./stonefish/test.js');
await link.log('hello world');
 */