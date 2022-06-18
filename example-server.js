import {Server, StaticFileHandler, WebProxyHandler} from "./server.js";
import {RemoteModuleLinker} from './link.js';
//import {RemoteModuleLinker} from './link.js'

// check if launch location is ok
console.log('server started')

// start the bootstrap server for fetching some of the initial files
new Server()
 .route(new RemoteModuleLinker())
 .route(new WebProxyHandler({webURL:'http://wulfricc.github.io'}))
 //.route(new StaticFileHandler())
 .listen();

 