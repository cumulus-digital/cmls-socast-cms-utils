import waitFor from 'Utils/waitFor';

window._CMLS = window._CMLS || {};
window._CMLS.libsLoaded = window._CMLS.libsLoaded || [];
if (
	window._CMLS.libsLoaded?.length &&
	window._CMLS.libsLoaded.indexOf('advertising') > -1
) {
	throw new Error('Advertising library already loaded!');
}

if (window._CMLS.libsLoaded.includes('main')) {
	require('./advertising/index');
} else {
	waitFor(() => window._CMLS.libsLoaded.indexOf('main') > -1).then(
		() => {
			require('./advertising/index');
		},
		() => {
			console.warn(
				'CMLS Advertising Support: Timed out waiting for main library!'
			);
		}
	);
}
