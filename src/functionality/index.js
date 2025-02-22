import shouldImportCMPTools from './cmp/shouldImport';

const imports = [
	{
		name: 'functionality/cmp',
		check: shouldImportCMPTools,
		loadImmediately: true,
		loaderOptions: { async: true, defer: true },
	},
];
window.__CMLSINTERNAL.libs.doDynamicImports(imports);
