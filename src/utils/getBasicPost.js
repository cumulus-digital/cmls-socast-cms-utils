/**
 * Returns the DOM node of a generic, regular post
 */
//import Logger from 'Utils/Logger';

function getBasicPost(additional_classes = []) {
	const scriptName = 'GET BASIC POST',
		nameSpace = 'getBasicPost',
		version = '0.1';

	const log = new window.__CMLSINTERNAL.Logger(`${scriptName} ${version}`);

	const doc = window.self.document;

	let postClasses = [
		'post-template-default',
		'single-post',
		'single-format-standard',
	];
	if (additional_classes?.length) {
		postClasses = postClasses.concat(additional_classes);
	}
	if (!postClasses.some((cl) => doc.body.classList.contains(cl))) {
		log.info('Not the default post template.', doc.body.classList);
		return false;
	}

	const postId = [...doc.body.classList]
		.find((name) => name.match(/(post|page)\-?id\-/))
		?.replace(/(post|page)\-?id\-/, '');

	if (!postId) {
		log.info('Could not discover post ID');
		return false;
	}

	let entry = doc.querySelector('#sc-content-area .sc-content .mainArticle');
	if (!entry) {
		log.info('Could not discover post content.');
		return false;
	}

	const entryBox = entry.getBoundingClientRect();
	if (entryBox.width > 900 || entryBox.width < 300) {
		log.info('Post content width is suspicious.', entryBox.width);
		return false;
	}

	return entry;
}
export default getBasicPost;
