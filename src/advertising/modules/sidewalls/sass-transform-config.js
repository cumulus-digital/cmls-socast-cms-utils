const config = require('./config.json');

for (let key in config) {
	if (typeof config[key] === 'string' && config[key].match(/\s/)) {
		config[key] = `'${config[key]}'`;
	}
}

module.exports = config;
