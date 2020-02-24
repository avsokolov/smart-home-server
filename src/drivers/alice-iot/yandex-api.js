module.exports = {
    v1: '/v1.0',
    ping() { return this.v1; },
    unlinkUser() { return this.v1 + '/user/unlink'; },
    getDevices() { return this.v1 + '/user/devices'; },
    getDevicesState() { return this.v1 + '/user/devices/query'; },
    setDeviceState() { return this.v1 + '/user/devices/action'; },
};
