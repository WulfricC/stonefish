# Todos

## Linst

change approach to linking.... use import('link://') instead of whatever we had before.  I think this is a much more intiuitve way to deal with things;

Simplify the linking system as it is hopeless at the moment and will never be finished. Links are encoded as an object with keys and skeleton functions matching the object which is linked.  No setting, no deletion, just getting and calling methods.

Linst Structure:
    LinkedAccessor -> Accesses an item from target when resolve is called, stores path and item.
        this is one of the items transmitted via the protocol;
    LinkedPlaceholder -> Placeholder for Linked instances in LinkedAccessors
## Server

change the server routing rules to make more sense somehow.  Probably with the objects themselves containing route handling.

