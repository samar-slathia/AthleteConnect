import React from 'react';

export const NavigationContainer: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  return React.createElement('NavigationContainer', null, children);
};

export const useNavigation = () => ({
  navigate: () => {},
  goBack: () => {},
  replace: () => {},
  canGoBack: () => true,
});

export const useRoute = () => ({
  params: {},
});

export default {
  NavigationContainer,
  useNavigation,
  useRoute,
};
