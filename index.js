import { registerRootComponent } from 'expo';
import { enableScreens } from 'react-native-screens';
import { Platform, UIManager } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';

import App from './App';

/**
 * Expo Go registers some native views itself, so react-native-screens
 * registering them again crashes it (RNSBottomTabs and friends). Turning native
 * screens off avoids that — but it also gives up the native navigation
 * container in *every* build, including release, which is a real performance
 * cost paid to work around a problem only the sandbox has.
 *
 * Scoped to Expo Go. Remove entirely once the project stops being run there,
 * or once react-native-screens no longer double-registers under it.
 */
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
if (isExpoGo) {
  enableScreens(false);
}

/**
 * LayoutAnimation on Android has to be switched on explicitly — but only on the
 * legacy (Paper) renderer. This app sets newArchEnabled, so on Fabric the call
 * does nothing; `global.nativeFabricUIManager` is how you tell which renderer
 * you actually got, since the flag in app.json is a request, not a guarantee.
 *
 * Remove this block once no supported build can start on Paper.
 *
 * HomeScreen and FilterPanel each used to do this themselves, so a global
 * native flag was being set from two component modules depending on which
 * mounted first.
 */
const isFabric = global.nativeFabricUIManager != null;
if (Platform.OS === 'android' && !isFabric && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
