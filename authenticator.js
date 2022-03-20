export class Authenicator {};

export class Always extends Authenicator {
    authencicate(key) {
        return true;
    }
}