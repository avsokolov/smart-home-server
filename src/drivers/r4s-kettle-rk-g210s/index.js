const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const AbstractDriver = require('../abstract-driver');

const HANDLES = {
  init: '0x000c',
  uart: '0x000e',
};
const COMMANDS = {
  auth: 'ff',
  status: '06',
  turnOn: '03',
  turnOff: '04',
  setKeep: '05',
  setAlerts: '3c'
};
const TOKEN = 'place token here';
const UPDATE_INTERVAL = 1000;

class Kettle extends AbstractDriver {
  constructor(name) {
    super(name);
    this.interface = {
      getState: () => this._cashedState,
      boil: this.boil.bind(this),
      keepTemp: this.keepTemp.bind(this),
      turnOff: this.turnOff.bind(this),
      setAlerts: this.setAlerts.bind(this)
    };

    this._cashedState = undefined;
    this._cmdId = 0;
    this._activeRequest = Promise.resolve();
  }

  async init() {
    this._mac = fs.readFileSync(path.join(__dirname, 'kettle.mac'), 'utf-8').trim();
    this._logger.info(`kettle mac is ${this._mac}`);
    return this._updateState().then(() => super.init()).catch(err => {
      this._logger.warn(`init error: ${err}`);
    });
  }

  boil() {
  }

  keepTemp(temp) {
  }

  turnOff() {
  }

  setAlerts(enable) {
  }

  _updateState() {
    this._logger.info('await current request if it in progress');
    this._activeRequest = this._activeRequest
      .then(() => this._beforeSession())
      //read state
      .then(() => this._execCmd(COMMANDS.status, ''))
      //parse state
      .then((answer) => {
        this._logger.info('parse state');

        let changed = false;
        if (!this._cashedState) {
          changed = true;
          this._cashedState = {};
        }

        if (this._cashedState.isTurnedOn !== (answer[8] !== 0)) {
          changed = true;
          this._cashedState.isTurnedOn = answer[8] !== 0;
        }

        if (this._cashedState.keepTemp !== answer[2]) {
          changed = true;
          this._cashedState.keepTemp = answer[2];
        }

        if (this._cashedState.tepm !== answer[5]) {
          changed = true;
          this._cashedState.tepm = answer[5];
        }

        if (changed) {
          this._logger.info('emit new state:' + JSON.stringify(this._cashedState));
          this.emit('stateChanged', this._cashedState);
        }
      }).catch(ex => {
        this._logger.warn(ex);
      }).then(() => {
        //update state periodicaly
        setTimeout(() => this._updateState(), UPDATE_INTERVAL);
      });
    return this._activeRequest;
  }

  _beforeSession() {
    this._logger.info('init ssesin');

    return this._btRequest(HANDLES.init, '0100')
      //check auth
      .then(() => this._execCmd(COMMANDS.auth, TOKEN));
  }

  _execCmd(cmd, args) {
    this._logger.info(`sending cmd ${cmd} with args ${args}`);

    const id = ('00' + this._cmdId.toString(16)).substr(-2);
    this._cmdId++;
    if (this._cmdId > 100) {
      this._cmdId = 0;
    }

    return this._btRequest(HANDLES.uart, `55${id}${cmd}${args}aa`, true)
      .then(res => {
        const parse = /value:\s55([0-9A-z\s]+)aa/.exec(res);
        if (!parse) {
          throw new Error(`can not parse answer: "${res}"`);
        }

        //TODO check cmdId (posible concurency requests)

        return parse[1].trim().split(' ').splice(2).map(val => parseInt(val, 16));
      });
  }

  _btRequest(handle, value, waitAnswer = false) {
    return new Promise((resolve, reject) => {
      const args = `-b ${this._mac} -t random --char-write-req --handle=${handle} --value=${value}${waitAnswer ? ' --listen' : ''}`;
      const cmd = 'gatttool';
      this._logger.info(`send request ${cmd} ${args}`);
      let createdProcess = spawn(cmd, args.split(' '));
      let tm = null;
      let result = '';
      let err = '';

      if (waitAnswer) {
        tm = setTimeout(() => {
          if (!tm) return;

          try {
            this._logger.info(`killing process ${createdProcess.pid}`);
            tm = null;
            createdProcess.kill('SIGINT');
            createdProcess = null;
            if (err) {
              reject(err);
            } else {
              resolve(result);
            }
          } catch (ex) {
            this._logger.warn(`error while kill process: ${ex.message}`);
          }
        }, 1000);
      }

      createdProcess.stdout.on('data', (data) => {
        result += data;
      });

      createdProcess.stderr.on('data', (data) => {
        err += data;
      });

      createdProcess.on('close', (code) => {
        if (!createdProcess) return;
        if (tm) {
          clearTimeout(tm);
          tm = null;
        }

        createdProcess = null;
        this._logger.info(`process closed with code ${code}`);
        if (code === 0) {
          resolve(result);
          return;
        }

        this._logger.warn(`error while exec cmd: ${cmd}`);
        this._logger.warn(`shell exit code: ${code}, log: ${err}`);
        reject(`Error while ${description}`);
      });
    });
  }
}

module.exports = Kettle;
