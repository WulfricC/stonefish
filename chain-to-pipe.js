import { extern } from '../rob/encodings/reference-encodings.js';
import { randomInt } from '../utils/random-utils.js';
import { moduleURL, Pipe, IN, PREV } from './sendable-pipe';

/** Get a value (esmod: refrerenceable). */

export function get(object, key) {
    return object[key];
}
get.moduleURL = moduleURL;
/** Run a function on an object (esmod: refrerenceable). */

export function apply(func, thisArg, ...args) {
    if (typeof func !== 'function')
        throw new TypeError('attepting to call non function');
    return func.apply(thisArg, args);
}
apply.moduleURL = moduleURL;
/**Set a value an object (esmod: refrerenceable). */

export function set(object, key, value) {
    return object[key] = value;
}
set.moduleURL = moduleURL;
/**Get the typeof the result of a pipe (esmod: refrerenceable). */

export function typeOf(object) {
    return typeof object;
}
typeOf.moduleURL = moduleURL;
/** Delete a property of an object (esmod: refrerenceable). */

export function deleteProperty(object, key) {
    return delete object[key];
}
deleteProperty.moduleURL = moduleURL;
/** proxy handler which converts a chain into a pipe */


export class ChainToPipeHandler {
    static moduleURL = moduleURL;
    static encoding = extern('link');
    #cache = {};
    constructor(pipe = new Pipe(), resolve = async (pipe) => pipe.resolve()) {
        this.pipe = pipe;
        this.resolve = resolve;
        this.randId = randomInt().toString(32);
    }
    sub(...args) {
        return new Proxy(() => { }, new ChainToPipeHandler(this.pipe.pipe(...args), this.resolve));
    }
    proxy() {
        return new Proxy(() => { }, this);
    }
    toPrimitive(hint) {
        if (hint === 'string' || hint === 'default')
            return `<linked ${this.randId}>`;
        if (hint === 'number')
            return NaN;
    }
    get(target, property) {
        if (property === Symbol.toPrimitive)
            return this.toPrimitive.bind(this);
        if (property === 'constructor')
            return this.constructor;
        if (property === 'then') {
            if (this.pipe.length === 0)
                return undefined;
            else
                return async (success, failure) => this.resolve(this.pipe).then(success, failure);
        }
        if (property === 'catch') {
            if (this.pipe.length === 0)
                return undefined;
            else
                return async (callback) => this.resolve(this.pipe).then().catch(callback);
        }
        if (property === 'packed') {
            return async (...args) => await this.proxy()(...args);
        }
        if (property in this.#cache)
            return this.#cache[property];
        const subnode = this.sub(get, IN, property);
        this.#cache[property] = subnode;
        return subnode;
    }
    apply(target, thisArg, args) {
        return this.sub(apply, IN, PREV, ...args);
    }
    set(target, property, value) {
        const subnode = this.sub(set, IN, property, value);
        return subnode.then();
    }
    deleteProperty(target, property, value) {
        const subnode = this.sub(deleteProperty, IN, property, value);
        return subnode.then();
    }
    throw(err) {
        throw err;
    }
}
