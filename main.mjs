import * as functions from './functions.mjs';
import * as operators from './operators.mjs';
import * as panels from './panels.mjs';
import * as previews from './previews.mjs';
import * as utils from './utils.mjs';
// ----------------------------------------------------------------------------------

operators.register();
panels.register();
previews.register();

if (tiled.menus.includes('Map')) {
  tiled.extendMenu('Map', [
    { separator: true },
    { action: 'LegacyMakerPanel' },
    { action: 'LegacyMakerExportPack' },
    { action: 'LegacyMakerExportObjects' }
  ]);
}

tiled.registerMapFormat('jtm', {
  name: 'Legacy Game Maker Tilemap (*.jtm)',
  extension: 'jtm',

  write(map, fileName) {
    try {
      const { data, warnings } = functions.jtmExport(map);
      for (const warning of warnings) {
        tiled.warn(warning, () => {});
      }

      utils.writeJson(fileName, data);
    }
    catch (e) {
      return e.message;
    }

    return undefined;
  }
});
