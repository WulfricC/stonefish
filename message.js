import { esmodUri } from "../rob/esmod.js";
import { type } from "../rob/encodings/collection-encodings.js";
import { objectFollowPath, randomInt } from "../utils/mod.js";
import { referencable, reference, string, uint32, utf16, struct, int32, float64 } from "../rob/encodings.js";

const moduleURL = import.meta.url;

/** generic message wrapper */
export class Message {
    static moduleURL = moduleURL;
    static encoding = struct(this, {id: float64});
    constructor(id) {
        this.id = id ?? randomInt();
    }
}

/** message for responding to previous messages */
export class Response extends Message {
    static moduleURL = moduleURL;
    static encoding = struct(this, {id: float64, value: reference});
    constructor(id, value) {
        super(id);
        this.value = value;
    }
}

/** message for rejecting previous messages */
export class Reject extends Message {
    static moduleURL = moduleURL;
    static encoding = struct(this, {id: float64, value: reference});
    constructor(id, value) {
        super(id);
        this.value = value;
    }
}

/** message for requesting a response */
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

/** request the server to grant access to the api */
export class Authenticate extends Request {
    static moduleURL = moduleURL;
    static encoding = struct(this, {id: float64, key: utf16, api: reference});
    constructor(key, api) {
        super();
        this.key = key;
        this.api = api;
    }
}

/** request the server to resolve the resolvable object sent (sendable pipe for example) */
export class Resolve extends Request {
    static moduleURL = moduleURL;
    static encoding = struct(this, {id: float64, resolver: reference});
    constructor(resolver, input) {
        super();
        this.resolver = resolver;
    }
}

/** request the server to derefence an internally cached item as the client no longer needs it */
export class Deref extends Message {
    static moduleURL = moduleURL;
    static encoding = struct(this,{id: float64, uri: utf16});
    constructor(uri) {
        super();
        this.uri = uri;
    }
}