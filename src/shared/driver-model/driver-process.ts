export enum PropTypes {
  boolean = 'boolean',
  string = 'string',
  number = 'number',
  enum = 'enum',
  structure = 'structure',
  array = 'array',
  binary = 'binary',
  void = 'void',
  deviceInfo = 'deviceInfo',
}

export enum DeviceFeatureType {
  onOff = 'onOff',
  toggle = 'toggle',
  numericLevel = 'numericLevel',
  percentLevel = 'percentLevel',
  rgb = 'rgb',
  mode = 'mode',
}

export enum DeviceSensorType {
  button = 'button',
  move = 'move',
  temperature = 'temperature',
  humidity = 'humidity',
  pressure = 'pressure',
  lightness = 'lightness',
  numericValue = 'numericValue',
  percentValue = 'percentValue',
  enumValue = 'enumValue',
}

export class DeviceInfo {
  constructor(public name: string, public features: DeviceFeatureType[], public sensors: DeviceSensorType[]) {
    Object.preventExtensions(this);
  }
}

export class DriverMethodArgument {
  constructor(public name, public type) {
    Object.preventExtensions(this);
  }
}

export class DriverMethodInfo {
  constructor(public name: string, public args: Array<DriverMethodArgument>, public resultType: PropTypes) {
    Object.preventExtensions(this);
  }
}

export type DriverPropertyValueDescription = {
  units?: string;
  enumValues?: Array<string>;
  arrayType?: PropTypes;
  structureProps?: Array<DriverPropertyInfo>;
};

export class DriverPropertyInfo {
  units?: string;
  enumValues?: Array<string>;
  arrayType?: PropTypes;
  structureProps?: Array<DriverPropertyInfo>;

  constructor(
    public name: string, public description: string, public type: PropTypes,
    valueDescription: DriverPropertyValueDescription = {}
  ) {
    const { units, arrayType, enumValues, structureProps } = valueDescription;

    if (valueDescription.units) {
      this.units = units;
    }
    if (type === PropTypes.enum) {
      if (!enumValues || !(enumValues instanceof Array)) {
        throw new Error(`Enum values should be defined for property ${this.name}`);
      }
      this.enumValues = enumValues;
    }

    if (type === PropTypes.array) {
      if (!arrayType || !PropTypes[arrayType]) {
        throw new Error(`Array values type should be defined for property ${this.name}`);
      }
      this.arrayType = arrayType;
    }

    if (type === PropTypes.structure) {
      if (!structureProps || !(structureProps instanceof Array)) {
        throw new Error(`Structure props should be defined for property ${this.name}`);
      }
      this.structureProps = structureProps;
    }

    Object.preventExtensions(this);
  }
}

/**
 * Driver process class
 * @constructor
 */
export class DriverProcess {
  queueSize = 0;
  pid = 0;
  name = '';
  state = DriverProcess.STATE_STARTING;
  memUsage = 0;
  description = '';
  apiMeta = {
    methods: [] as Array<DriverMethodInfo>,
    state: null as Array<DriverPropertyInfo> | null,
  };
  devices = null;

  constructor() {
    Object.preventExtensions(this);
  }

  static STATE_STARTING = 'starting';
  static STATE_INITIALIZING = 'initializing';
  static STATE_IDLE = 'idle';
  static STATE_REQUEST = 'process-request';
  static STATE_FAULT = 'fault';
  static STATE_CLOSED = 'closed';
  static STATE_STOPPING = 'stopping';
}
