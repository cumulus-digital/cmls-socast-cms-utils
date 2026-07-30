export default () => {
	const { h, Fragment, Logger } = window.__CMLSINTERNAL.libs;
	const scriptName = 'PAID CONTENT / TOPICALFRUIT';
	const version = '0.1';
	const log = new Logger(`${scriptName} ${version}`);

	/**
	 * Topical Fruit is not allowed on News, Talk, and Urban stations.
	 */
	const DISALLOWED_SGROUPS = ['news', 'talk', 'urban'];

	const valid_containers = [
		'body:is(.single-post, .home) .sc-content',
		'body#playerBody .entry-content .wpb_column:first-child .blogNewsWidget',
	];

	window.self.googletag = window.self.googletag || {};
	window.self.googletag.cmd = window.self.googletag.cmd || [];
	window.self.googletag.cmd.push(function () {
		var sgroups = window.self.googletag.pubads().getTargeting('cms-sgroup');
		if (!sgroups || !sgroups.length) {
			log.info('No sgroups found.');
			return;
		}

		var not_valid_sgroup = sgroups.find((sg) => {
			var sg_lower = sg.toLowerCase();
			return DISALLOWED_SGROUPS.includes(sg_lower);
		});

		if (not_valid_sgroup) {
			log.info(
				'Topical Fruit is not allowed on this sgroup.',
				not_valid_sgroup
			);
			return;
		}

		var contentContainer = document.querySelector(
			valid_containers.join(',')
		);
		if (!contentContainer) {
			log.info('Could not find content container.');
			return;
		}

		const className = 'dml-widget-container';
		const scrSrc = 'https://c.go-fet.ch/a/embed.js';

		var div = (
			<div
				id={`${className}-${(Math.random() + 1).toString(36).substring(5)}`}
				class={className}
				data-stackid="4666fe9ba13f1d4e76775a7209cd2de4"
				data-items="4"
			></div>
		);
		var scr = <script async src={scrSrc}></script>;

		let injectedDiv = false,
			injectedScript = false;
		if (!document.querySelector(`.${className}`)) {
			contentContainer.append(div);
			injectedDiv = true;
		}
		if (!document.querySelector(`script[src="${scrSrc}"]`)) {
			contentContainer.append(scr);
			import(
				/* webpackChunkName: "advertising/paid-content/topical-fruit" */
				'./styles.scss'
			).then((style) => {
				if (style?.default?.use)
					style.default.use({ target: contentContainer });
			});
			injectedScript = true;
		}
		if (injectedDiv || injectedScript) {
			log.info('Topical Fruit injected.', {
				div: injectedDiv,
				script: injectedScript,
			});
		} else {
			log.info('Topical Fruit already exists.');
		}
	});
};
