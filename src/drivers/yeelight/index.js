const Yeeligghts = require('yeelight-wifi');
const AbstractDriver = require('../abstract-driver');
const { camelCase } = require('lodash');
const {
  DeviceInfo,
  DriverMethodInfo,
  DriverMethodArgument,
  DeviceFeatureType,
  DriverPropertyInfo,
  PropTypes
} = require('../../shared');

module.exports = class Yeelights extends AbstractDriver {
  constructor(name) {
    super(
      name,
      'Yeelights devices driver',
      {
        methods: [
          new DriverMethodInfo(
            'toggle',
            [new DriverMethodArgument('name', PropTypes.string)],
            PropTypes.boolean,
          ),
          //TODO
        ],
        state: [
          new DriverPropertyInfo('devices',
            'found yeelighs device list',
            PropTypes.array,
            {
              arrayType: PropTypes.deviceInfo
            }
          ),
        ],
      },
    );

    this._devices = {};
    this._yee = new Yeeligghts();
    this._yee.on('found', this._onDeviceFound);
    this.ping();
    this.interface.toggle = name => {
      if (this._devices[name]) {
        this._devices[name].device.toggle();
      } else {
        this._logger.warn('unknown device ' + name)
      }
    };
  }

  _onDeviceFound = device => {
    this._logger.info('found a new yeelights device', device.name);
    device.once('response', (requestId, result) => {
      const [name, power, bright, colorMode, activeMode, colorTemperature, rgb] = result;
      const id = name || device.getId();
      this._devices[id] = {
        name,
        device,
        state: {
          power,
          bright,
          colorMode,
          activeMode,
          colorTemperature,
          rgb,
        }
      };
      this.emit('deviceAdded', this._devices[id]);

      this.setState({
        devices: Object.keys(this._devices).map(name => (
          new DeviceInfo(
            name,
            [
              DeviceFeatureType.onOff,
              DeviceFeatureType.mode,
              DeviceFeatureType.percentLevel,
              DeviceFeatureType.toggle,
              DeviceFeatureType.rgb
            ],
            [],
          )
        )),
      });

      device.on('notifcation', ({method, params}) => {
        if (method === 'props') {
          this._devices[id].state = {
            ...this._devices[id].state,
            ...Object.keys(params).reduce((res, item) => {
              if (item === 'ct') {
                res.colorTemperature = params[item];
              } else {
                res[camelCase(item)] = params[item];
              }

              return res;
            }, {}),
          };

          this.emit('deviceStateChanged', this._devices[id]);
        }
      });
    });

    device.getValues('name', 'power', 'bright', 'color_mode', 'active_mode', 'ct', 'rgb');
  };

  ping() {
    this._yee.refresh();
  }
};
