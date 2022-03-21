import { Linkable } from "./link.js";

export function log(v) {
    console.log(v);
}

export function sum(a,b) {
    return a + b;
}

export function obj(a,b) {
    return new Linkable({a:a, b:b});
}

export async function onLink(clientApi) {
    if (!clientApi) return;
    if ('log' in clientApi) {
        await clientApi.log('connected');
    }
}

export function throws (m) {
    throw new Error(m);
}