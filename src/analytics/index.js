window._CMLS = window._CMLS || {};
window._CMLS.libsLoaded = window._CMLS.libsLoaded || [];
if (
	window._CMLS.libsLoaded?.length &&
	window._CMLS.libsLoaded.indexOf('analytics') > -1
) {
	throw new Error('Analytics library already loaded!');
}

const log = new window.__CMLSINTERNAL.Logger('ANALYTICS');

log.info({
	message: `
                      __
 ______ ____ _  __ __/ /_ _____
/ __/ // /  ' \\/ // / / // (_-<
\\__/\\_,_/_/_/_/\\_,_/_/\\_,_/___/
 ANALYTICS LIBRARY LOADED
 BUILD DATE: ${__BUILDDATE__}`,
	headerLength: Infinity,
});

// Log that analytics has been loaded
window._CMLS.libsLoaded.push('analytics');

const imports = [];
window.__CMLSINTERNAL.libs.doDynamicImports(imports);
