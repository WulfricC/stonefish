import { extern } from '../rob/encodings/reference-encodings.js';
import { randomInt } from '../utils/random-utils.js';
import { Linkable } from './link.js';
import { Pipe, IN, PREV } from './sendable-pipe.js';

//** constants that are used in the definitions of chain to pipes */
export const HANDLER = Symbol('handler');

export const moduleURL = import.meta.url;

/** Get a value (esmod: refrerenceable). */
export function get(object, key) {
    return object[key];
}
get.moduleURL = moduleURL;

/** Run a function on an object (esmod: refrerenceable). */
export function apply(func, thisArg, ...args) {
    if (!(typeof func === 'function' || func instanceof Linkable))
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
        this.proxy = new Proxy(() => { }, this);
    }
    sub(...args) {
        return new ChainToPipeHandler(this.pipe.pipe(...args), this.resolve);
        //return new Proxy(() => { }, new ChainToPipeHandler(this.pipe.pipe(...args), this.resolve));
    }
    toPrimitive(hint) {
        if (hint === 'string' || hint === 'default')
            return `<chain-to-pipe ${this.randId}>`;
        if (hint === 'number')
            return NaN;
    }
    get(target, property) {
        if (property === Symbol.toPrimitive)
            return this.toPrimitive.bind(this);
        if (property === HANDLER) {
            return this;
        }
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
            return async (...args) => await this.proxy(...args);
        }
        if (property in this.#cache)
            return this.#cache[property];
        const subnode = this.sub(get, IN, property).proxy;
        this.#cache[property] = subnode;
        return subnode;
    }
    apply(target, thisArg, args) {
        return this.sub(apply, IN, PREV, ...args).proxy;
    }
    set(target, property, value) {
        const subnode = this.sub(set, IN, property, value).proxy;
        return subnode.then();
    }
    deleteProperty(target, property, value) {
        const subnode = this.sub(deleteProperty, IN, property, value).proxy;
        return subnode.then();
    }
    throw(err) {
        throw err;
    }
}