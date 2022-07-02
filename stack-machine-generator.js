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

 /** Set a value on an object*/
export function _set(object, key, value) {
        return object[key] = value;
 }
 _set.moduleURL = import.meta.url;

 /** Mostly for building a function to check that objects exist*/
export function _defined(object) {
    return object != undefined ? true : false;
 }
 _defined.moduleURL = import.meta.url;

/** Used for extracting the stack out of the SMBuilder */
const STACK = Symbol();
const DEFINED = Symbol();
const HANDLER = Symbol();
const SET = Symbol();

// the base pipe builder class which the proxy pretends to be
// always returns a proxy on construction, just pretends to be a class

export class SMBuilder {

    cache = new Map();

    /** the function called on then */
    async onThen(){
        return (await this.stack.normalize).resolve();
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

    /** return whether the item should be expanded or not */
    expandDef(item) {
        return item instanceof SMBuilder;
    }

    apply(target, thisArg, args) {
        const argList = [];
        
        // merge stacks of inputs into this stack if the class says they should defined in this.expand
        for(const arg of args) {
            if (this.expandDef(arg))
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

    set(target, property, value) {
        // merge stacks of inputs into this stack if the class says they should defined in this.expand
        if (this.expandDef(value))
            value = value[STACK];
        else value = [value];

        // add calling the function with the args to the stack and call it to immediatly run the set
        this.sub(...this.stack, property, ...value, _set, 3, C).then();
        return true;
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

export function set(builder, property, value) {
    // merge stacks of inputs into this stack if the class says they should defined in this.expand
    if (builder[HANDLER].expandDef(value))
        value = value[STACK];
    else value = [value];

    if (builder[HANDLER].expandDef(property))
        property = property[STACK];
    else property = [property];

    // add calling the function with the args to the stack
    return builder[HANDLER].sub(...builder[STACK], ...property, ...value, _set, 3, C);
}

// TODOS
/*
There is a fair bit of code duplication and things could really be cleaned up

*/