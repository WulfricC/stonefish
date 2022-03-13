import { array, struct } from '../rob/encodings/collection-encodings.js';
import { any, extern, referencable } from '../rob/encodings/reference-encodings.js';
import { constant, float64 } from '../rob/encodings.js';
import { setAlias } from '../rob/alias.js';
import { Request } from './message.js';

const moduleURL = import.meta.url;

export const IN = Symbol('input');
export class _IN {
    static moduleURL = moduleURL;
    static encoding = constant(IN);
}
setAlias(IN, _IN);

export function get(object, key) {
    return object[key];
}
get.moduleURL = moduleURL;

export function apply(object, key, ...args) {
    return object[key](...args);
}
apply.moduleURL = moduleURL;

export function set(object, key, value) {
    return object[key] = value;
}
set.moduleURL = moduleURL;

export function del(object, key) {
    return delete object[key];
}
del.moduleURL = moduleURL;

export class PipeNode {
    static moduleURL = moduleURL;
    static encoding = struct(this, { func: referencable(extern('esmod')), args: array(any) });
    constructor(func, args) {
        this.func = func;
        this.args = args;
    }
}
/** a request which runs a set list of operations on its requested item (likely a linked object) */

export class Pipe extends Request{
    static moduleURL = moduleURL;
    static encoding = struct(this, { input: any, nodes: array(PipeNode.encoding), id:float64 });
    constructor(input = undefined, nodes = []) {
        super();
        this.input = input;
        this.nodes = nodes;
    }
    /** add an operation onto the pipe */
    pipe(func, ...args) {
        return new Pipe(this.input, this.nodes.concat(new PipeNode(func, args)));
    }
    get(key) {
        return this.pipe(get, IN, key);
    }
    set(key, value) {
        return this.pipe(set, IN, key, value);
    }
    apply(key, ...args) {
        return this.pipe(apply, IN, key, ...args);
    }
    del(key){
        return this.del(apply, IN, key);
    }
    /** run the list of operations and return result */
    resolve(input = this.input) {
        let feed = input;
        for (const node of this.nodes) {
            const args = node.args.slice(0).map(v => v === IN ? feed : v);
            feed = node.func(...args);
        }
        return feed;
    }
}
