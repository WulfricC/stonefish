console.log('test was loaded');
export function log(v) {
    console.log(v);
}

export async function onLink(clientApi) {
    console.log('connected');
    await clientApi.log('connected');
}

export function throws (m) {
    throw new Error(m);
}