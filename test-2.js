import { Linkable } from "./link.js";

export function log (message) {
    console.log(message);
}

export function add (a, b) {
    return a + b;
}

export function func (text) {
    return (blah) => text + blah; 
}

export function newLinkable(obj) {
    return (new Linkable(obj))
}

/*
const {link} = await import('./stonefish/link.js');
const module = await link('./stonefish/link.js');

*/