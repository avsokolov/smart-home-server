module.exports = config => {
  config.entry = {
    'main': require.resolve('./src/main.ts'),
    'driver-loader': require.resolve('./src/driver-loader.ts'),
    'shared': require.resolve('./src/shared/index.ts'),
  };
  config.output.filename = '[name].js';

  if (config.module.noParse) {
    if (Array.isArray(config.module.noParse)) {
      config.module.noParse.push(/native-require/);
    } else {
      config.module.noParse = [config.module.noParse, /native-require/];
    }
  } else {
    config.module.noParse = [/native-require/];
  }

  return config;
};
