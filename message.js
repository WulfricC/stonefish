import { esmodUri } from "../rob/esmod.js";
import { type } from "../rob/encodings/collection-encodings.js";
import { objectFollowPath, randomInt } from "../utils/mod.js";

const moduleURL = import.meta.url;

export class Message {
    static moduleURL = moduleURL;
    static encoding = type(this);
    constructor(id) {
        this.id = id ?? randomInt();
    }
}

export class Response extends Message {
    static moduleURL = moduleURL;
    static encoding = type(Response);
    constructor(id, value) {
        super(id);
        this.value = value;
    }
}

export class Request extends Message {
    static moduleURL = moduleURL;
    static encoding = type(Request);
    response(value) {
        return new Response(this.id, value);
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

export class Resolve extends Request {
    static moduleURL = moduleURL;
    static encoding = type(this);
    constructor(resolver, input) {
        super();
        this.resolver = resolver;
        this.input = input;
    }
}

export class Deref extends Message {
    static moduleURL = moduleURL;
    static encoding = type(this);
    constructor(uri) {
        super();
        this.uri = uri;
    }
}