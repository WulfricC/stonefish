import {Server, StaticFileHandler, webSocketAt, httpUnder,webSocketUnder, httpAt, httpHost} from "./server.js";
import {RemoteModuleLinker} from './link.js';
//import {RemoteModuleLinker} from './link.js'

// check if launch location is ok
const locationURL = new URL(location?.origin ?? 'http://localhost');
if (locationURL.hostname !== 'localhost') throw new Error('stonefish may only be run on localhost');
console.log('server started')

new Server()
 .route(webSocketUnder('/'), new RemoteModuleLinker())
 .route(httpUnder('/'), new StaticFileHandler())
 .listen();