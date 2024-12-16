import waitFor from 'Utils/waitFor';

window._CMLS = window._CMLS || {};
window._CMLS.libsLoaded = window._CMLS.libsLoaded || [];
if (
	window._CMLS.libsLoaded?.length &&
	window._CMLS.libsLoaded.indexOf('advertising') > -1
) {
	throw new Error('Advertising library already loaded!');
}

waitFor(() => window._CMLS.libsLoaded.indexOf('main') > -1).then(
	() => {
		const log = new window.__CMLSINTERNAL.Logger('ADVERTISING');

		log.info({
			message: `
                      __
 ______ ____ _  __ __/ /_ _____
/ __/ // /  ' \\/ // / / // (_-<
\\__/\\_,_/_/_/_/\\_,_/_/\\_,_/___/
 SoCast ADVERTISING LIBRARY LOADED
 BUILD DATE: ${__BUILDDATE__}`,
			headerLength: Infinity,
		});
		require('./advertising/index');

		// Log that lib has been loaded
		window._CMLS.libsLoaded.push('advertising');
	},
	() => {
		console.warn(
			'CMLS Advertising Support: Timed out waiting for main library!'
		);
	}
);
