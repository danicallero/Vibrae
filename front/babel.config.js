module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'babel-plugin-dotenv-import',
        {
          moduleName: '@env',
          path: '.env',
          allowUndefined: true,
        },
      ],
      // NOTE: This plugin must be listed last
      'react-native-reanimated/plugin',
    ],
  };
};
 
