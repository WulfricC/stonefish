export const todos = new Set();

export class Todo {
    constructor(text) {
        this.text = text;
        this.completed = false;
    }
}

export function addTodo(text){
    todos.add(new Todo(text));
}

export function removeTodo(todo) {
    todos.delete(todo);
}