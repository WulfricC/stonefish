import { array, struct } from '../rob/encodings/collection-encodings.js';
import { any, extern, referencable } from '../rob/encodings/reference-encodings.js';
import { constant, float64 } from '../rob/encodings.js';
import { setAlias } from '../rob/alias.js';
import { Request } from './message.js';

const moduleURL = import.meta.url;

export const IN = Symbol('IN');
export class _IN {
    static moduleURL = moduleURL;
    static encoding = constant(IN);
}
setAlias(IN, _IN);

export const PREV = Symbol('PREV');
export class _PREV {
    static moduleURL = moduleURL;
    static encoding = constant(PREV);
}
setAlias(PREV, _PREV);

export class PipeNode {
    static moduleURL = moduleURL;
    static encoding = struct(this, { func: referencable(extern('esmod')), args: array(any) });
    constructor(func, args) {
        this.func = func;
        this.args = args;
    }
    toString() {
        return `${this.func.name}(${this.args.map(v => v.toString()).join(', ')})`
    }
}

/** a request which runs a set list of operations on its requested item (likely a linked object) */
export class Pipe extends Request{
    static moduleURL = moduleURL;
    static encoding = struct(this, { input: any, nodes: array(PipeNode.encoding), id:float64 });
    constructor(nodes = []) {
        super();
        this.nodes = nodes;
    }
    /** add an operation onto the pipe */
    pipe(func, ...args) {
        return new Pipe(this.nodes.concat(new PipeNode(func, args)));
    }
    get length () {
        return this.nodes.length;
    }

    /** run the list of operations and return result */
    resolve(input) {
        let feed = input;
        let prev = globalThis;
        for (const node of this.nodes) {
            const args = node.args.slice(0).map(v => {
                if (v === IN) return feed;
                if (v === PREV) return prev;
                return v;
            });
            prev = feed;
            feed = node.func(...args);
        }
        return feed;
    }

    toString() {
        return `Pipe[\n\t${this.nodes.join(',\n\t')}\n]`
    }
}

export function get(object, key) {
    return object[key];
}
get.moduleURL = moduleURL;

export function apply(object, thisArg, ...args) {
    return object.apply(thisArg, args);
}
apply.moduleURL = moduleURL;

export function set(object, key, value) {
    return object[key] = value;
}
set.moduleURL = moduleURL;

export function deleteProperty(object, key) {
    return delete object[key];
}
deleteProperty.moduleURL = moduleURL;


/** proxy handler which converts a chain into a pipe */
export class ChainToPipeHandler {
    #cache = {};
    constructor (pipe = new Pipe(), resolve = pipe => pipe.resolve(), constructor = this) {
        this.pipe = pipe;
        this.resolve = resolve;
        this.defaultConstructor = constructor;
    }
    sub (...args) {
        return new Proxy(()=>{}, new ChainToPipeHandler(this.pipe.pipe(...args), this.resolve));
    }
    toPrimitive (hint) {
        if (hint === 'string' || hint === 'default')
            return this.pipe.toString();
        if (hint === 'number')
            return NaN;
    }
    get (target, property) {
        if (property === Symbol.toPrimitive) return this.toPrimitive.bind(this);
        if (property === 'constructor') return this.defaultConstructor;
        if (property === 'then') {
            if (this.pipe.length === 0) return undefined;
            else return (resolve = v=>v) => resolve(this.resolve(this.pipe));
        }
        if (property in this.#cache)
            return this.#cache[property];
        const subnode = this.sub(get, IN, property);
        this.#cache[property] = subnode;
        return subnode;
    }
    apply (target, thisArg, args) {
        return this.sub(apply, IN, PREV, ...args);
    }
    set (target, property, value) {
        const subnode = this.sub(set, IN, property, value);
        return subnode.then();
    }
    deleteProperty (target, property, value) {
        const subnode = this.sub(deleteProperty, IN, property, value);
        return subnode.then();
    }
}