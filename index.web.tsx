import { AppRegistry, View } from 'react-native';
import App from './App';
import InstallApp from './src/components/InstallApp.web';

function WebApp() {
  return <View style={{ flex: 1 }}><InstallApp /><View style={{ flex: 1 }}><App /></View></View>;
}

AppRegistry.registerComponent('OficinaInteligente', () => WebApp);
AppRegistry.runApplication('OficinaInteligente', { rootTag: document.getElementById('root') });
