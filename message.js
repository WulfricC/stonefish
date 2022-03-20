import { esmodUri } from "../rob/esmod.js";
import { type } from "../rob/encodings/collection-encodings.js";
import { objectFollowPath, randomInt } from "../utils/mod.js";
import { referencable, reference, string, uint32, utf16, struct, int32, float64 } from "../rob/encodings.js";

const moduleURL = import.meta.url;

export class Message {
    static moduleURL = moduleURL;
    static encoding = struct(this, {id: float64});
    constructor(id) {
        this.id = id ?? randomInt();
    }
}

export class Response extends Message {
    static moduleURL = moduleURL;
    static encoding = struct(this, {id: float64, value: reference});
    constructor(id, value) {
        super(id);
        this.value = value;
    }
}

export class Reject extends Message {
    static moduleURL = moduleURL;
    static encoding = struct(this, {id: float64, value: reference});
    constructor(id, value) {
        super(id);
        this.value = value;
    }
}

export class Request extends Message {
    static moduleURL = moduleURL;
    static encoding = struct(this, {id: float64});
    response(value) {
        return new Response(this.id, value);
    }
    error(value) {
        return new Reject(this.id, value);
    }
}

export class Authenicate extends Request {
    static moduleURL = moduleURL;
    static encoding = struct(this, {id: float64, key: utf16});
    constructor(key) {
        super();
        this.key = key;
    }
}

export class Resolve extends Request {
    static moduleURL = moduleURL;
    static encoding = struct(this, {id: float64, resolver: reference, input: reference});
    constructor(resolver, input) {
        super();
        this.resolver = resolver;
        this.input = input;
    }
}

export class Deref extends Message {
    static moduleURL = moduleURL;
    static encoding = struct(this,{id: float64, uri: utf16});
    constructor(uri) {
        super();
        this.uri = uri;
    }
}