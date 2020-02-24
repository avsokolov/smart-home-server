const dgram = require('dgram');
const http = require('http');
const AbstractDriver = require('../abstract-driver');
const {
  DeviceInfo,
  DeviceFeatureType,
  DeviceSensorType,
  DriverPropertyInfo,
  PropTypes
} = require('../../shared');

const STRIPS = [0, 14, 34, 35, 37, 30, 3];

module.exports = class AlexSkIoT extends AbstractDriver {
  constructor(name) {
    super(
      name,
      'AlexSk devices driver',
      {
        methods: [],
        state: [
          new DriverPropertyInfo('devices',
            'found device list',
            PropTypes.array,
            {
              arrayType: PropTypes.deviceInfo
            }
          ),
        ],
      },
    );

    this._devices = {};
    this._udpClient = dgram.createSocket('udp4');
    this._udpServer = dgram.createSocket('udp4');
    this._udpServer.once('listening', () => this._udpServer.setBroadcast(true));
    this._udpServer.bind(19005);
    this._udpServer.on('message', this._onDeviceMessage);

    this._udpClient.once('listening', () => {
      this._udpClient.setBroadcast(true);
      this.ping();
    });
    this._udpClient.bind();
    this._strip = 0;
  }

  _onDeviceMessage = message => {
    this._logger.info('dev-msg: ' + message);
    const info = message.toString().split(',').reduce((state, item) => {
      const [key, value] = item.split('=');
      if (key === undefined || value === undefined) return;

      let parsed;
      try {
        parsed = JSON.parse(value);
      } catch (e) {
        parsed = value;
      }

      if (state[key] === undefined) {
        state[key] = parsed;
      } else {
        if (!(state[key] instanceof Array)) {
          state[key] = [ state[key] ];
        }

        state[key].push(parsed);
      }

      return state;
    }, {});
    this._logger.info('message from device', info);

    if (!info.from || !info.ip) return;

    const name = info.from;
    if (!this._devices[name]) {
      this._devices[name] = {
        name,
        ip: info.ip,
      };

      this.emit('deviceAdded', this._devices[name]);
      this._logger.info('new device found', info);
    }

    if (info.feat) {
      if (!(info.feat instanceof Array)) {
        info.feat = [info.feat];
      }

      this._devices[name].features = info.feat.map(feat => DeviceFeatureType[feat]);
    }
    if (info.sense) {
      if (!(info.sense instanceof Array)) {
        info.sense = [info.sense];
      }

      this._devices[name].sensors = info.sense.map(sense => DeviceSensorType[sense]);
    }

    if (typeof info.ready === 'number') {
      this._devices[name].ready = info.ready;
      this._logger.info(`Device ${name} ready state: ${info.ready}`);
      this.emit('deviceStateChanged', this._devices[name]);

      this.setState({
        devices: Object.keys(this._devices).map(name => (
          new DeviceInfo(
            name,
            this._devices[name].features,
            this._devices[name].sensors,
          )
        )),
      });
    }

    if (info.action) {
      this.emit('deviceAction', {
        device: this._devices[name],
        action: info.action,
        button: info.button,
      });
    }

    //TODO update top-highlighter firmware
    if (info.button === 3) {
      if (info.action === 'click') {
        this._strip++;
        if (this._strip >= STRIPS.length) {
          this._strip = 0;
        }
      } else if (info.action === 'long-press') {
        this._strip = 0;
      } else if (info.action === 'dbl-click') {
        this._strip = 35;
      }

      http.get(`http://192.168.0.30/setMode?mode=${STRIPS[this._strip]}`);
    }

    if (info.button === 1 && info.action === 'click') {
      this._logger.info('toggle kitchen light');
      this.extRequest('yeelight', 'toggle', 'kitchen-main');
    }
  };

  ping() {
    const msg = Buffer.from('ping smart devices');
    this._udpClient.send(msg, 0, msg.length, 8888, '192.168.0.255');
    setTimeout(() => this.ping(), 20000);
  }
};
