import * as props from './props.mjs';
import * as utils from './utils.mjs';
import * as functions from './functions.mjs';
// ----------------------------------------------------------------------------------

export const CREATE_OPERATORS = [
  { id: 'LegacyMakerCreateEntityAABB', text: 'Entity AABB', type: props.LAYER_ENT, shape: MapObject.Rectangle, name: 'Entity' },
  { id: 'LegacyMakerCreateEntityCircle', text: 'Entity Circle', type: props.LAYER_ENT, shape: MapObject.Ellipse, name: 'Entity' },
  { id: 'LegacyMakerCreateLine', text: 'Line', type: props.LAYER_JLM, shape: MapObject.Polyline, name: 'Line' },
  { id: 'LegacyMakerCreateStaticSprite', text: 'Static Sprite', type: props.LAYER_JSS, shape: MapObject.Rectangle, name: 'Sprite' },
  { id: 'LegacyMakerCreateAnimatedSprite', text: 'Animated Sprite', type: props.LAYER_JAS, shape: MapObject.Rectangle, name: 'AnimatedSprite' },
  { id: 'LegacyMakerCreateParticles', text: 'Particles', type: props.LAYER_PRT, shape: MapObject.Point, name: 'Particles' },
  { id: 'LegacyMakerCreateCamera', text: 'Camera', type: props.LAYER_CAM, shape: MapObject.Rectangle, name: 'Camera', size: [320, 240] }
];

export function register() {
  for (const operator of CREATE_OPERATORS) {
    const action = tiled.registerAction(operator.id, () => createObject(operator));
    action.text = 'Legacy Game Maker: Create ' + operator.text;
  }

  tiled.registerAction('LegacyMakerExportPack', () => exportPack(false)).text = 'Legacy Game Maker: Export Pack';
  tiled.registerAction('LegacyMakerExportObjects', () => exportPack(true)).text = 'Legacy Game Maker: Export Selected Objects';
}

function getActiveMap() {
  const map = tiled.activeAsset;
  if (!map || !map.isTileMap) {
    tiled.alert('Open a map first.', 'Legacy Game Maker');
    return null;
  }

  return map;
}

// ----------------------------------------------------------------------------------
// CREATE
// ----------------------------------------------------------------------------------
export function createObject(operator, map = getActiveMap()) {
  if (!map) {
    return null;
  }

  const width = operator.size ? operator.size[0] : map.tileWidth;
  const height = operator.size ? operator.size[1] : map.tileHeight;
  const center = getViewCenter(map);

  const object = new MapObject(operator.shape, operator.name);
  object.x = Math.round(center.x - width * 0.5);
  object.y = Math.round(center.y - height * 0.5);

  if (operator.shape === MapObject.Polyline) {
    object.polygon = [Qt.point(0, 0), Qt.point(width * 2, 0)];
  }
  else if (operator.shape !== MapObject.Point) {
    object.width = width;
    object.height = height;
  }

  props.setDefaultValues(object, props.OBJECT_FIELDS[operator.type]);

  map.macro('Create ' + operator.text, () => {
    const layer = utils.getOrCreateObjectLayer(map, operator.type);
    layer.addObject(object);
    map.currentLayer = layer;
  });

  map.selectedObjects = [object];
  return object;
}

function getViewCenter(map) {
  const view = tiled.mapEditor ? tiled.mapEditor.currentMapView : null;
  if (!view || tiled.activeAsset !== map) {
    return Qt.point(0, 0);
  }

  return map.screenToPixel(view.center);
}

// ----------------------------------------------------------------------------------
// EXPORT
// ----------------------------------------------------------------------------------
export function exportPack(selectedOnly, map = getActiveMap()) {
  if (!map) {
    return;
  }

  try {
    const res = functions.packExport(map, selectedOnly ? map.selectedObjects : null);
    for (const warning of res.warnings) {
      tiled.warn(warning, () => {});
    }

    for (const file of res.files) {
      tiled.log('Legacy Game Maker: ' + file);
    }

    tiled.log(`Legacy Game Maker: export successful ✔ (${res.files.length} files)`);
  }
  catch (e) {
    tiled.error('Legacy Game Maker: ' + e.message, () => {});
  }
}
