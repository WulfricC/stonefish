/**
 * main module for the server side of stonefish
 * will not create a server on the client so do not use for that
 */


import {serveFile} from 'https://deno.land/std@0.109.0/http/file_server.ts';
import {existsSync, } from "https://deno.land/std@0.109.0/fs/mod.ts";
import {posix} from "https://deno.land/std@0.109.0/path/mod.ts";
//import { AllowAll } from './permissions.js';

const statSync = Deno.statSync;

export class Server {
    routers = [];
    routeCache = new Map();
    listening = false;

    constructor ({port = 80} = {}) {
        this.port = port;
    }   
    
    route(handler) {
        if (this.listening) throw new Error(`Cannot add routes once listening`)
        this.routers.push(handler);
        return this;
    }
    async listen() {
        this.listening = true;
        for await (const conn of Deno.listen({port: this.port})) {
            this.handleHttp(conn);
        }
    }
    async handleHttp(conn) {
        for await (const {request, respondWith} of Deno.serveHttp(conn)) {
            for (const handler of this.routers) {
                if (handler.route(request)) {
                    handler.onRequest(request, respondWith);
                    break;
                }
            }
        }
    }
}

export class StaticFileHandler {
    constructor({
            urlRoot = '.',
            fileRoot = '.',
            indexFiles = ['.', './index.html', './index.htm', './default.html', './default.html'],
            dirRedirect = '/',
            cors = true,
            } = {}) {
        this.fileRoot = fileRoot;
        this.indexFiles = indexFiles;
        this.dirRedirect = dirRedirect;
        this.cors = cors;
        this.urlRoot = urlRoot;
    }
    route (request){
        return request.method === 'GET'
            && !request.headers.has('upgrade')
    }
    async onRequest (request, respondWith) {
        respondWith(this.onGet(request));
        //respondWith (new Response(null, {status : 301, headers :{Location: urlPath + '/'}}))
    }    
    async onGet (request) {
        // config
        const urlPath = new URL(request.url).pathname
        const pathObj = posix.parse(urlPath)
        pathObj.root = '/';
        const path = this.fileRoot + posix.format(pathObj);

        // redirect directories to trailing slash or non trailing slash versions
        if (existsSync(path) && statSync(path).isDirectory) {
            if (this.dirRedirect === '/' && urlPath[urlPath.length-1] != '/')
                return new Response(null, {status : 301, headers :{Location: urlPath + '/'}})
            else if (this.dirRedirect === '' && urlPath[urlPath.length-1] == '/')
                return new Response(null, {status : 301, headers :{Location: urlPath.slice(0,-1)}})
        }

        // find and return the index file of a directory
        for (const fileName of this.indexFiles) {
            
            const filePath = posix.join(path, fileName);
            if (existsSync(filePath) && statSync(filePath).isFile) {
                const res = await serveFile(request, filePath);
                if (this.cors) {
                    res.headers.append("access-control-allow-origin", "*");
                    res.headers.append(
                        "access-control-allow-headers",
                        "Origin, X-Requested-With, Content-Type, Accept, Range",
                    );
                }
                return res;
            }   
        }

        // if no file is found, return a 404s
        return new Response(null, {status : 404, headers : {Location: path, 'Referrer-Policy': 'no-referrer'}})
    }
}