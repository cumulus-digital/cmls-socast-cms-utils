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
		'feed_posts-template',
		'feed_posts-template-single',
		'feed_posts-template-default',
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

	let entry = doc.querySelector(
		`.wrapper-content .column-1 #post-${postId},` +
			//`.express-content .wp-block-post-content:has(.themify_builder_content[data-postid="${postId}"]),` +
			'.express-content .wp-block-post-content'
	);
	if (!entry) {
		log.info('Could not discover post content.');
		return false;
	}
	// For FSE, let's try to get the themify block within post content to ensure we get the right post
	if (entry.classList.contains('wp-block-post-content')) {
		let themify = doc.querySelector(
			`.themify_builder_content[data-postid="${postId}"]`
		);
		if (
			themify?.parentElement?.classList.contains('wp-block-post-content')
		) {
			entry = themify.parentElement;
		}
	}

	const entryBox = entry.getBoundingClientRect();
	if (entryBox.width > 800 || entryBox.width < 400) {
		log.info('Post content width is suspicious.', entryBox.width);
		return false;
	}

	return entry;
}
export default getBasicPost;
