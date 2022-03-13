import { Message } from "./message.js";
import { type } from "../rob/encodings.js";

export class Mossage extends Message {
    static moduleURL = import.meta.url;
    static encoding = type(this);
}

export class HttpData {
    static moduleURL = import.meta.url;
    static encoding = extern('http');
}