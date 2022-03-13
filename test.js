import { any, extern, referencable, reference } from "./rob/encodings/reference-encodings.js";
import { ExternHandler } from "./rob/extern-handler.js";
import { Write, Read } from "./rob/reader-writer.js";
import "./rob/built-ins.js";
import { get, set, Pipe, IN, del  } from "./sendable-pipe.js";
import { bufferString } from "./utils.js";
import { NOT_FOUND } from "./rob/symbols.js";
import { ascii, utf16 } from "./rob/encodings/string-encodings.js";
import { array, object, struct } from "./rob/encodings/collection-encodings.js";
import {uint32, boolean, float64} from './rob/encodings/base-encodings.js'
import { _Number, _Object, _String } from "./rob/built-ins.js";

/*const test = array(struct(Object,{
      "_id": utf16,
      "index": uint32,
      "guid": utf16,
      "isActive": boolean,
      "balance": utf16,
      "picture": utf16,
      "age": uint32,
      "eyeColor": utf16,
      "name": utf16,
      "gender": utf16,
      "company": utf16,
      "email": utf16,
      "phone": utf16,
      "address": utf16,
      "about": utf16,
      "registered": utf16,
      "latitude": float64,
      "longitude": float64,
      "tags": array(utf16),
      "friends": array(
        struct(Object, {
            "id": uint32,
            "name": utf16
        })
        ),
        
      "greeting": utf16,
      "favoriteFruit": utf16
    }))*/
const test = any ;
const local = new ExternHandler

async function main (value) {
    const head = [Pipe, _Object, _String, _Number]
    const buf = new ArrayBuffer(1024 * 1024 * 50);
    const dv = new DataView(buf);
    //const value = 1//new Segment(() => Array(1000000).fill(1000))//Array(1000000).fill(1000).map(v => Math.random() > 1 ? Math.random().toString() : Math.random());//dta//new Message(1,'awesfrdgtyi8uoiyjhtfx')
    const write = new Write(local, head);
    console.time('write')
    test(write)(value);
    //test(write)('aaaa');
    const buffer = write.toBuffer();
    console.log(bufferString(buffer))
    console.timeEnd('write')
    //console.log(Math.ceil(write._cursor.position/1024),'kb');
    //console.log([...new Uint8Array(buf.slice(0,write._cursor.position))].map(v => String.fromCharCode(v > 32 && v < 127 ? v : v === 255 ? '!'.charCodeAt(0) : '_'.charCodeAt(0))).join(''))
    const read = new Read(local,buffer, head);
    let r;
    let r2;
    try {  
        console.time('read')
        r = await test(read)();
        //r2 = await test(read)();
        console.timeEnd('read')
        
    }
    catch (err){
        console.log(write._references)
        console.log(read._references);
        throw err
    }
   
/*
    console.time('writej')
    const s = JSON.stringify(value);
    console.timeEnd('writej')
    console.log(Math.ceil((s.length*2)/1024),'kb');
    console.time('readj')
    JSON.parse(s);
    console.timeEnd('readj')*/

    return r;
}
//await main(['a', 'a']//)
const obj = {a:{a:3, b:100}};
const v = new Pipe(obj).get('a').set('b', 1000);
const o = v//await main(v);
console.log(o.resolve())
console.log(obj)

//dta//new Message(1,'awesfrdgtyi8uoiyjhtfx'));

//const v = Array(1000000).fill(1000).map(v => Math.random() > 1 ? Math.random().toString() : Math.random());//dta//new Message(1,'awesfrdgtyi8uoiyjhtfx')
//const buf = new ArrayBuffer(1024 * 1024 * 50);
//const dv = new DataView(buf);
//const write = new Write(local,dv);
//test(write)(dta);
//const uint8Array = new Uint8Array(buf.slice(0,write._cursor.position));
//Deno.writeFileSync('./test.rob',uint8Array)
//console.log(await(await main(new Segment(() => Array(1000000).fill(1000)))).resolve());*/