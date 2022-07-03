import { defined } from "./stack-machine-generator.js";


export class Authenicator {};

export class Always extends Authenicator {
    authencicate(key) {
        return true;
    }
}

export class Never extends Authenicator {
    authencicate(key) {
        return false;
    }
}

export class KeyMatch extends Authenicator {
    #key;
    constructor (key) {
        super();
        this.#key = key;
    }
    async authencicate(key) {
        return key === this.#key;
    }
}

export class IsLocal extends Authenicator {
    constructor (pingCount = 100, maxAverage = 1, maxStdev = 1, maxPing = 10) {
        super();
        this.pingCount = pingCount;
        this.maxAverage = maxAverage;
        this.maxStdev = maxStdev;
        this.maxPing = maxPing;
    }
    static async ping (key) {
        return key;
    }
    async authencicate(key, clientAuthApi, headers) {
        if(headers.get('host') === '127.0.0.1') {
            console.log(await defined(clientAuthApi.IsLocal));
            if (! (await defined(clientAuthApi.IsLocal))) return false;
            const pingTimes = [];
            const array = new Uint32Array(this.pingCount);
            crypto.getRandomValues(array)
            for(const number of array) {
                const start = performance.now();
                const n = await clientAuthApi.IsLocal.ping(number);
                if (n != number) return false;
                const end = performance.now();
                const pingTime = end - start;
                //console.log(pingTime);
                if(pingTime > this.maxPing) return false;
                pingTimes.push(end - start);
                
            }
            const average = pingTimes.reduce((s,v) => s + v, 0) / pingTimes.length;
            const stdev = Math.sqrt(pingTimes.reduce((s,v) => s + Math.pow(v - average,2), 0) / pingTimes.length);
            console.log(average, stdev)
            return average <= this.maxAverage && stdev <= this.maxStdev;
        }
        return false;
    }
}