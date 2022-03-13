import { Read, Write } from "./rob/reader-writer.js";
import { ExternScheme } from "./rob/scheme-handler.js";
import { ExternHandler, COMMUNICATION_SCHEMES } from "./rob/extern-handler.js";
import { array, struct, type } from "./rob/encodings/collection-encodings.js";
import { any, extern } from "./rob/encodings/reference-encodings.js";
import "./rob/built-ins.js";
import { Response, Request,  } from "./message.js";
import { randomInt, unwrap, bufferString, objectFollowPath } from "./utils.js";
import { utf16 } from "./rob/encodings/string-encodings.js";
import { uint32 } from "./rob/encodings/base-encodings.js";
import { constant } from "./rob/encodings/base-encodings.js";

export * from "./message.js";

const moduleURL = import.meta.url;

class Linked {
    constructor (connection, uri) {
        this.connection = connection;
        this.uri = uri;
    }
    static moduleURL = moduleURL;
    static encoding = extern('link');
}

export class Resolve extends Request {
    static moduleURL = moduleURL;
    static encoding = type(this);
    constructor(link) {
        super();
        this.link = link;
    }
}

export class Link {
    constructor (target, path = []) {
        this.target = target;
        this.path = path;
        this.cache = {};
        return new Proxy(()=>{}, this);
    }
    get (target, property) {
        console.log('get', property)
        if (property === 'target') return this.target;
        if (property === 'path') return this.path;
        if (property === 'constructor') return Link;
        if (property === 'then') return () => this.resolve();
        
        if (property in this.cache) return this.cache[property];
        const subLink = new Link(this.target, this.path.concat([property]));
        this.cache[property] = subLink;
        return subLink;
    }
    resolve () {
        console.log(this);
        if (this.target instanceof Linked) {
            if (this.path.length === 0)
                return undefined;
            else 
                return this.target.connection.request(new Resolve(this));
        }
        return objectFollowPath(this, this.path);
    }
    static moduleURL = moduleURL;
    static encoding = struct(this,{target: extern('link'), path: any, cache: constant({})});
}

export class LinkExtern extends ExternScheme {
    constructor(connection) {
        super();
        this.connection = connection;
    }
    getURI(item) {
        if (item instanceof Linked) return item.uri;
        else return `link:${randomInt().toString(32)}`;
    }
    getItem(uri) {
        return new Linker(new Linked(this.connection, uri));
    }
}

export class Authenicate extends Request {
    static moduleURL = moduleURL;
    static encoding = type(this);
    constructor(key) {
        super();
        this.key = key;
    }
}

/** works a bit like import(), but returns a linking instance instead */
export async function link (uri) {
    uri = new URL (uri, location.origin);
    if (!/(.js)|(.mjs)$/.test(uri.pathname)) throw new Error('can only link to a javascript module');
    if (uri.protocol === 'ws:' || uri.protocol === 'wss:') {
        const socket = new WebSocket(uri);
        console.log('waiting to connect')
        await new Promise((resolve, reject) => socket.onopen = () => resolve(socket));
        console.log('connected')
        const connection = new Connection(socket);
        return connection.request(new Authenicate('password'))
    }   
}


export class Connection {
    constructor(connectionInterface, api) {
        this.connectionInterface = connectionInterface;
        this.api = api;
        this.connectionInterface.onmessage = (e) => this.recieve(e.data);
        this.unresolvedPromises = new Map();
        this.instances = new Map();
        this.externHandler = new ExternHandler({...COMMUNICATION_SCHEMES, link: new LinkExtern(this)});
    }
    /**send some data as rob*/
    async send(data) {
        const writer = new Write(this.externHandler);
        any(writer)(data);
        const buffer = writer.toBuffer();
        console.log('<<<', bufferString(buffer));
        this.connectionInterface.send(buffer);
    }
    /**handle recieved data */
    async recieve(data) {
        let buffer = data;
        if (data instanceof Blob)
            buffer = await data.arrayBuffer();
        console.log('>>>', bufferString(buffer));
        const reader = new Read(this.externHandler, buffer);
        const message = await any(reader)();
        console.log(message);
        if (message instanceof Response) {
            this.unresolvedPromises.get(message.id).resolve(message.value);
        }
        if (message instanceof Request) {
            this.send(message.response(await this.respond(message)));
        }
    }
    async respond (message) {
        if (message instanceof Authenicate) {
            return this.api;
        }
        if (message instanceof Resolve) {
            const v = await message.link;
            console.log(v);
        }
    }
    /**send expecting response */
    async request (request) {
        console.log('requesting', request)
        if (!(request instanceof Request))
            throw new Error(`requests only work with Request Messages`);
        const promise = new Promise((resolve, reject) => this.unresolvedPromises.set(request.id,{resolve, reject}));
        await this.send(request);
        return promise;
    }
}

export class RemoteModuleLinker {
    constructor() {
    }
    async onRequest (request, respondWith) {
        const {socket, response} = Deno.upgradeWebSocket(request);
        try {
            const link = new Connection(socket, new Linker({a:1, b:2}));
            console.log('connected')
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

/** the linker stores a list of operations to be performed on the object, resolving them on await */
export class Linker {
    static LINKER = Symbol('LINKER')
    static moduleURL = moduleURL;
    static encoding = extern('link');
    constructor(target, ops = []) {
        this.target = target;
        this.ops = ops;
        this.cache = {};
        return new Proxy(() => {}, this);
    }
    get(target, property) {
        if (property === 'linker') return this;
        if (property === 'constructor') return Linker;
        if (property === Symbol.toPrimitive) return () => this.ops.toString();
        if (property === 'name') return this.ops.toString();
        if (property === 'then') {
            if (this.ops.length === 0) return undefined;
            else return (success, failed) => success(this.resolveOps());
        }
        if (property in this.cache) 
            return this.cache[property];
        else {
            const proxy = new Linker(this.target, this.ops.concat([['get', property]]));
            this.cache[property] = proxy;
            return proxy;
        }
    }
    apply(target, thisArg, args) {
        return new Linker(this.target, this.ops.concat([['apply', args]]));
    }
    set(target, property, value){
        new Linker(this.target, this.ops.concat([['set', [property, value]]])).then(n=>0);
        return true;
    }
    deleteProperty(target, property) {
        new Linker(this.target, this.ops.concat([['delete', property]])).then(n=>0);
        return true;
    }
    resolveOps(){
        let val = this.target;
        if (this.target instanceof Linked) {
            return this.target.connection.request(new Resolve(this));
        }
        for(const [opname, args] of this.ops) {
            if (opname === 'get') val = val[args];
            if (opname === 'apply') val = val.apply(val, args);
            if (opname === 'set') val = val[args[0]] = args[1];
            if (opname === 'delete') val = delete val[args];
        }
        return val;
    }
}