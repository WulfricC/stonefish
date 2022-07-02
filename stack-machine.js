/** A replacement for sendable pipe.  A bit lower level but simpler*/
import { setAlias } from '../rob/alias.js';
import { constant, reference, array, struct } from '../rob/encodings.js';

/** Indicates to do a function call */
export const C = Symbol('C');
export class _C {
    static moduleURL = import.meta.url;
    static encoding = constant(C);
}
setAlias(C, _C);

/** The stack machine */
export class StackMachine {
    static moduleURL = import.meta.url;
    static encoding = struct(this, {nodes: array(reference) });

    constructor(...nodes) {
        this.nodes = nodes ?? [];
    }
    
    *[Symbol.iterator] () {
        for(const v of this.nodes) yield v;
    }

    async resolve(...input) {
        const stack = input ?? [];
        for (const node of this.nodes) {
            if (node === C) {
                const count = stack.pop();
                const func = stack.pop();
                const args = stack.splice(-count, count);
                stack.push(await func(...args));
            }
            else {
                stack.push(node);
            }
        }
        return stack.pop();
    }

    get length () {
        return this.nodes.length;
    }
}

