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

const DEBUG = ['buffer'];

/** an object which is sent as a link rather than as iteslf */
export class Linkable {
    constructor (object) {
        Object.assign(this, object);
    }
    static moduleURL = moduleURL;
    static encoding = extern('link');
}

/** an object which references a linked object */
export class Linked extends ChainToPipeHandler{
    constructor (connection, uri) {
        super();
        const proxy = new Proxy(()=>{}, this);
        this.resolve = pipe => connection.request(new Resolve(pipe, proxy));
        return proxy;
    }
    static moduleURL = moduleURL;
    static encoding = extern('link');
}

/** handler for linking remote modules */
export class RemoteModuleLinker {
    constructor() {
    }
    async onRequest (request, respondWith) {
        const {socket, response} = Deno.upgradeWebSocket(request);
        try {
            const link = new Connection(socket, new Linkable({a:1, b:2, c:3, log:(v)=>console.log(v), new:(v)=>new Linkable(v)}));
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

const MESSAGING_HEAD = [
    _String, _Number, _Object, _Error, _Null, _Undefined,
    Message, Authenicate, Request, Response, Resolve,
    Linked, Linkable, 
    Pipe, PipeNode, _PREV, _IN, get, apply
];

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
    /**handle recieved data */
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