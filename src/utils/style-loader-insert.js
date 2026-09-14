function insertIntoTarget(element, options) {
	if (options && options.attributes) {
		Object.entries(options.attributes).forEach(([name, value]) =>
			element.setAttribute(name, value)
		);
	}
	var parent =
		options && options.target
			? options.target
			: document.head;
	parent.appendChild(element);
}

export default insertIntoTarget;