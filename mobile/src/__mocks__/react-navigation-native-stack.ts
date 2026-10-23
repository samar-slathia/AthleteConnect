import React from 'react';

export const createNativeStackNavigator = () => {
  const Navigator: React.FC<any> = ({ children, initialRouteName, screenOptions }) => {
    return React.createElement(
      'NativeStackNavigator',
      { initialRouteName, screenOptions },
      children
    );
  };
  Navigator.displayName = 'NativeStackNavigator';

  const Screen: React.FC<any> = ({ name, component, options }) => {
    return React.createElement('NativeStackScreen', { name, component, options });
  };
  Screen.displayName = 'NativeStackScreen';

  return {
    Navigator,
    Screen,
  };
};

export default {
  createNativeStackNavigator,
};
