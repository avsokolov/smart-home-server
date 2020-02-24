const _ = require('lodash');
const path = require('path');
const { driverManager } = require('../driver-manager');
const { DriverActions } = require('../../shared');
const requireFunction  = require('../../shared/native-require');
const { notify } = require('../server/web-socket');

const startUp = new Date().getTime();
const ver = requireFunction(path.resolve(process.cwd(),'package.json')).version;

const state = {};

driverManager.on(driverManager.Events.driverEvent, ({source, eventName, params}) => {
	if (eventName === 'setState') {
		state[source] = _.merge(state[source] || {}, params);
		notify({
			action: DriverActions.DiverStateUpdated,
			name: source,
			state: state[source],
		});
	}
});

exports.get = function(req, res) {
	res.json({
		upTime: new Date() - startUp,
		memoryState: process.memoryUsage(),
		appVersion: ver,
		...state,
	});
};
