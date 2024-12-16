function insertIntoTarget(element, options) {
	var parent =
		options && options.target
			? options.target
			: document.head;
	parent.appendChild(element);
}

module.exports = insertIntoTarget;