import {Server, StaticFileHandler} from "./server.js";
import {RemoteModuleLinker} from './link.js';
//import {RemoteModuleLinker} from './link.js'

// check if launch location is ok
console.log('server started')

new Server()
 .route(new RemoteModuleLinker())
 .route(new StaticFileHandler())
 .listen();