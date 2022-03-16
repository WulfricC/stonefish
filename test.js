import {Linked, Linkable, LinkScheme} from './link.js';
import { COMMUNICATION_SCHEMES } from '../rob/extern-handler.js';

// handles reading and writing to buffers etc
import { Read, Write } from "../rob/reader-writer.js";

// handles how externs (objects referenced by URIs) are handled
import { ExternHandler } from "../rob/extern-handler.js";

// the most general encoding type
import { any } from "../rob/encodings.js";

// import all default encodings
import '../rob/built-ins.js'


const objectToEncode = new Linkable({a:1});
const eh = new ExternHandler({...COMMUNICATION_SCHEMES, link: new LinkScheme(this)});

// encoding the data to an arrayBuffer
const writer = new Write(eh);
any(writer)(objectToEncode);
const buffer = writer.toBuffer();

// send or recieve data here

// decoding the data from an arrayBuffer
const reader = new Read(eh, buffer);
const output = await any(reader)();
console.log(await output.a);