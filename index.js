import { registerRootComponent } from 'expo';
import { enableScreens } from 'react-native-screens';
import { Platform, UIManager } from 'react-native';

import App from './App';

// Avoid duplicate native view registration in Expo Go (RNSBottomTabs, etc.)
enableScreens(false);

// Android needs LayoutAnimation switched on explicitly. HomeScreen and
// FilterPanel each did this themselves, so a global native flag was being set
// from two component modules depending on which mounted first.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
