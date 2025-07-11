function TodoItem({ text, onDelete }) {
    return (
        <li className="todo-item">
            <span>{text}</span>
            <button onClick={onDelete}>Delete</button>
        </li>
    );
}

export default TodoItem;
