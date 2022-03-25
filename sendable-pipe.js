import { array, struct } from '../rob/encodings/collection-encodings.js';
import { any, extern, referencable, reference } from '../rob/encodings/reference-encodings.js';
import { constant, float64 } from '../rob/encodings.js';
import { setAlias } from '../rob/alias.js';
import { _Error, _Null, _Number, _Object, _String, _Undefined } from '../rob/built-ins.js';
import { checkEsmod } from '../rob/esmod.js';

export const moduleURL = import.meta.url;

/** Indicates the argument should be the output of the previous function. */
export const IN = Symbol('IN');
export class _IN {
    static moduleURL = moduleURL;
    static encoding = constant(IN);
}
setAlias(IN, _IN);

/** Indicates the argument's value should be the previous value (used for calling functions of instances).*/
export const PREV = Symbol('PREV');
export class _PREV {
    static moduleURL = moduleURL;
    static encoding = constant(PREV);
}
setAlias(PREV, _PREV);

/** A node of the pipe's flow.  Stores argument and function data.  Functions must be referenceable if pipe is to be encoded. */
export class PipeNode {
    static moduleURL = moduleURL;
    static encoding = struct(this, { func: referencable(extern('esmod')), args: array(reference) });
    constructor(func, args) {
        this.func = func;
        this.args = args;
    }
    async awaitAll () {
        const newArgs = [];
        for(let i = 0; i < this.args.length; i ++) {
            newArgs[i] = await this.args[i];
        }
        return new PipeNode(this.func, newArgs);
    }
    toString() {
        return `${this.func.name}(${this.args.map(v => v.toString()).join(', ')})`
    }
}

/** A request which stores a set list of operations on its requested item*/
export class Pipe {
    static moduleURL = moduleURL;
    static encoding = struct(this, {nodes: array(PipeNode.encoding)});
    constructor(nodes = []) {
        this.nodes = nodes;
    }
    /** Add an operation onto the pipe. */
    pipe(func, ...args) {
        return new Pipe(this.nodes.concat(new PipeNode(func, args)));
    }

    async awaitAll() {
        const newNodes = [];
        for(const node of this.nodes) {
            newNodes.push(await node.awaitAll());
        }
        return new Pipe(newNodes);
    }

    /** Get the number of operations of the pipe. */
    get length () {
        return this.nodes.length;
    }

    /** Run the list of operations and return result. */
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

    /** Create a string representation of the pipe. */
    toString() {
        return `Pipe[\n\t${this.nodes.join(',\n\t')}\n]`
    }
}

