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