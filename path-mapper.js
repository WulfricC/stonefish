/*
PathMapper Unifies the mapping of paths for server side stonefish

The aim of this is to allow a server to fetch information from a variety of places
Unification is all through the use of URIs and Schemes.

The ExternHandler in ROB may be 'blended' with this at some point possibly, or service workers will be used

Path Handling Functionality

if the path is to the same domain as the server is running on:
find the root location of the file, whether it is a file:// url or another url

Where paths lead to should be handled in the routing table
*/