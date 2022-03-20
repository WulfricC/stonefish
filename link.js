import {Request, Response, Deref, Authenicate, Resolve, Message} from './message.js';
import { type } from '../rob/encodings.js';
import { any, extern } from '../rob/encodings.js';
import { ExternScheme } from '../rob/scheme-handler.js';
import { apply, get, Pipe, PipeNode, _IN, _PREV } from './sendable-pipe.js';
import { ExternHandler, COMMUNICATION_SCHEMES } from '../rob/extern-handler.js';
import { Read, Write } from '../rob/reader-writer.js';
import { bufferString, randomInt } from '../utils/mod.js';
import { ChainToPipeHandler } from './sendable-pipe.js';
import '../rob/built-ins.js'
import { BiMap } from '../utils/bi-map.js';
import { _Error, _Null, _Number, _Object, _String, _Undefined } from '../rob/built-ins.js';

export const moduleURL = import.meta.url;

/** Add 'module' to show modules being sent, add 'buffer' to show raw data. */
const DEBUG = [];

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
    constructor({fileRoot = './'} = {}) {
        this.fileRoot = fileRoot;
    }
    route (request){
        return request.method === 'GET'
            && request.headers.get('upgrade') === 'websocket';
    }
    async onRequest (request, respondWith) {
        const {socket, response} = Deno.upgradeWebSocket(request);
        try {
            const module = await import(request.url);
            const link = new Connection(socket, new Linkable(module));
            respondWith(response);
            await new Promise((resolve, reject) => socket.onopen = () => resolve(socket));
            const api = await link.request(new Authenicate(''));
            if ('onLink' in module) module.onLink(api);
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
    Pipe, PipeNode, _PREV, _IN, get, apply
];

/** Object which handles a connnection over some interface via ROB.  ConnectionInterface must implement onmessage and send */
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
        if (message instanceof Deref) {
            this.externHandler.clear(message.uri);
        }
        if (message instanceof Resolve) {
            const result = message.resolver.resolve(message.input);
            this.send(message.response(result));
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
const l = await link('ws://localhost/app/test.js');
const t = await l.new({a:1, new : 10000});
console.log(await t.new);
console.log('done')
 */