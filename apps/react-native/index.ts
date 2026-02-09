// Polyfills must be imported before anything else
import 'react-native-get-random-values';

import { registerRootComponent } from 'expo';

import App from './App';

registerRootComponent(App);
