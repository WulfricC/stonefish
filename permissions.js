export function newToken() {

}

export class AuthentificationInterface {

}

export class AllowAll extends AuthentificationInterface {
    async authenticate () {return true};
}

export class AllowNone extends AuthentificationInterface {
    async authenticate () {return false};
}