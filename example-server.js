import {Server, StaticFileHandler, WebProxyHandler} from "./server.js";
import {Linkable, WSLink} from './link.js';
import {Always, IsLocal, Never} from './authenticator.js'
//import {RemoteModuleLinker} from './link.js'

// check if launch location is ok
console.log('server started')

// start the bootstrap server for fetching some of the initial files
new Server()
 .route(new WSLink({authenticator: new Always()}))
 .route(new WSLink({path: '/test', authenticator: new Always(), api: new Linkable({a:1})}))
 //.route(new WebProxyHandler({webURL:'http://wulfricc.github.io'}))
 .route(new StaticFileHandler())
 .listen();