import { esmodUri } from "./rob/esmod.js";
import { type } from "./rob/encodings/collection-encodings.js";
import { objectFollowPath, randomInt } from "./utils.js";

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

export class LinstAction extends Request {
    static moduleURL = moduleURL;
    static encoding = type(this);
}

export class Get extends LinstAction {
    static moduleURL = moduleURL;
    static encoding = type(this);
    constructor(linst, path) {
        super();
        this.linst = linst;
        this.path = path;
    }
    resolve() {
        return objectFollowPath(this.linst, this.path);
    }
}
export class Set extends Request {
    static moduleURL = moduleURL;
    static encoding = type(this);
    constructor(instanceId, property, value) {
        super();
        this.instanceId = instanceId;
        this.property = property;
        this.value = value;
    }
}
export class Apply extends Request {
    static moduleURL = moduleURL;
    static encoding = type(this);
    constructor(instanceId, property, args) {
        super();
        this.instanceId = instanceId;
        this.property = property;
        this.args = args;
    }
}
export class Delete extends Request {
    static moduleURL = moduleURL;
    static encoding = type(this);
    constructor(instanceId, property) {
        super();
        this.instanceId = instanceId;
        this.property = property;
    }
}