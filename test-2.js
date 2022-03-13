import { Read, Write } from "./rob/reader-writer.js";
import { ExternHandler } from "./rob/extern-handler.js";
import { branch, float32, utf16 } from "./rob/encodings.js";
import { array } from "./rob/encodings.js";
import { bufferString } from "./utils.js";
import { any, struct,ascii } from "./rob/encodings.js";
import { Mossage } from "./module.js";
import './rob/built-ins.js'
import { _Number, _Object, _String } from "./rob/built-ins.js";

import { Request, Response, Message } from "./message.js";


import { UNINITIALIZED } from "./rob/symbols.js";

const encoding = any;


const obj = new Mossage();

const local = new ExternHandler;
const preload = []//[_Object, _Number, _String];

const writer = new Write(new ExternHandler, preload);
encoding(writer)(obj);

const buffer = writer.toBuffer();

console.log(bufferString(buffer))

const reader = new Read(new ExternHandler, buffer, preload);
const output = await encoding(reader)();
                          
console.log(output);

/*
const str = JSON.stringify(obj2);
const o = JSON.parse(str);
console.log('json',o.a === o.b);*/