import { StackMachine, C } from "./stack-machine.js";

// base functions used in the pipes
/** Get a value (esmod: refrerenceable). */
export function _get(object, key) {
    return object[key];
}
_get.moduleURL = import.meta.url;

/** If getting a function bind its parent*/
export function _getBind(object, key) {
    if (typeof object[key] === 'function')
        return object[key].bind(object);
    return object[key];
 }
 _getBind.moduleURL = import.meta.url;

 /** Mostly for building a function to check that objects exist*/
export function _defined(object) {
    return object != undefined ? true : false;
 }
 _defined.moduleURL = import.meta.url;

/** Used for extracting the stack out of the SMBuilder */
const STACK = Symbol();
const DEFINED = Symbol();
const HANDLER = Symbol();

// the base pipe builder class which the proxy pretends to be
// always returns a proxy on construction, just pretends to be a class

export class SMBuilder {

    cache = new Map();

    async onThen(){
        return this.stack.resolve();
    }
    
    /** Construct a subNode of this Builder */
    sub(...nodes) {
        return new Proxy(()=>{}, 
            Object.assign(
                Object.create(this.constructor.prototype), 
                {...this, stack: new StackMachine(...nodes)}
            )
        )
    }

    /** Proxy handler function for get */
    get(target, property) {
        // allows this to be presented as a primitive
        if (property === Symbol.toPrimitive) {
            return this[Symbol.toPrimitive]
        }
        if (property === 'toString') {
            return this.toString;
        }
        if (property === 'toNumber') {
            return this.toNumber;
        }
        
        // this here allows the class to pretend to be another
        if (property === 'constructor')
            return this.constructor;

        // make the PipeProxy thenable
        if (property === 'then') {
            if (this.stack.length == 1) return undefined;
            return async (resolved, rejected) => {
                this.onThen(this.stack).then(resolved, rejected);
            };
        }
        if (property === 'catch') {
            if (this.stack.length == 1) return undefined;
            return async (callback) => {
                this.onThen(this.stack).catch(callback);
            };
        }
        if (property === 'finally') {
            if (this.stack.length == 1) return undefined;
            return async (callback) => {
                this.onThen(this.stack).finally(callback);
            };
        }

        if (property === HANDLER) {
            return this;
        }

        if (property === STACK) {
            return this.stack;
        }

        if (property === DEFINED) {
            return this.sub(...this.stack, _defined, 1, C);
        }
        
        // return an extended pipe handler and cache it for future use
        if(this.cache.has(property))
            return this.cache.get(property);
        const sub = this.sub(...this.stack, property, _get, 2, C);
        this.cache.set(property, sub);
        return sub;
    }

    apply(target, thisArg, args) {
        
        const argList = [];
        
        // merge stacks of inputs into this stack
        for(const arg of args) {
            if (arg instanceof SMBuilder)
                argList.push(...arg[STACK]);
            else argList.push(arg);
        }

        // if there is a previous get, the funciton should be bound to the gotten
        const preNodes = [...this.stack];
        if (preNodes[preNodes.length - 3] === _get)
            preNodes[preNodes.length - 3] = _getBind;

        // add calling the function with the args to the stack
        return this.sub(...argList, ...preNodes, args.length, C);
    }

    /** Gets the prototype so that the proxy acts like the class */
    getPrototypeOf(target) {
        return this.constructor.prototype;
    }
}

/** functions which act on SMBuilders via symbols */
export function defined (builder) {
    return builder[DEFINED]
}

/** functions which act on SMBuilders via symbols */
export function stack (builder) {
    return builder[STACK]
}

/** functions which act on SMBuilders via symbols */
export function handler (builder) {
    return builder[HANDLER]
}