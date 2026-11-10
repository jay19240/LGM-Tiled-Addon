import { TYPED_LAYERS, PREVIEW_LAYER } from './props.mjs';
// ----------------------------------------------------------------------------------

// ----------------------------------------------------------------------------------
// LAYERS
// ----------------------------------------------------------------------------------
/**
 * Flatten the layer tree, group layers transmit their offset and visibility to their children.
 */
export function collectLayers(layers, offsetX = 0, offsetY = 0, visible = true, result = []) {
  for (const layer of layers) {
    const layerOffsetX = offsetX + layer.offset.x;
    const layerOffsetY = offsetY + layer.offset.y;
    const layerVisible = visible && layer.visible;

    if (layer.isGroupLayer) {
      collectLayers(layer.layers, layerOffsetX, layerOffsetY, layerVisible, result);
    }
    else {
      result.push({ layer: layer, offsetX: layerOffsetX, offsetY: layerOffsetY, visible: layerVisible });
    }
  }

  return result;
}

export function isTypedLayer(layer) {
  return layer.isObjectLayer && TYPED_LAYERS.includes(layer.name);
}

/**
 * Layers exported in the JTM file.
 */
export function isJtmLayer(layer) {
  return layer.isTileLayer || (layer.isObjectLayer && !isTypedLayer(layer));
}

export function isPreviewLayer(layer) {
  return layer.isImageLayer && layer.name == PREVIEW_LAYER;
}

/**
 * Return the type of an object given by the name of its object layer, or an empty string.
 */
export function getObjectType(object) {
  return object.layer && isTypedLayer(object.layer) ? object.layer.name : '';
}

export function getTypedLayers(map, type) {
  return collectLayers(map.layers).filter(item => item.layer.isObjectLayer && item.layer.name == type);
}

export function getOrCreateObjectLayer(map, type) {
  const items = getTypedLayers(map, type);
  if (items.length > 0) {
    return items[0].layer;
  }

  const layer = new ObjectGroup(type);
  map.addLayer(layer);
  return layer;
}

export function getLayerOffset(layer) {
  let x = 0;
  let y = 0;
  for (let current = layer; current; current = current.parentLayer) {
    x += current.offset.x;
    y += current.offset.y;
  }

  return [x, y];
}

// ----------------------------------------------------------------------------------
// POSITIONS
// ----------------------------------------------------------------------------------
/**
 * Convert a position of the Tiled object space to the engine space.
 * Isometric: Tiled stores positions in a grid space where a tile measures tileHeight on both axes,
 * converted to the engine projection (Gfx2TileMap.getPositionIso returns the bottom vertex of a tile).
 */
export function getEnginePosition(map, x, y) {
  if (map.orientation === TileMap.Isometric) {
    const col = x / map.tileHeight;
    const row = y / map.tileHeight;
    return [
      (col - row) * map.tileWidth * 0.5,
      (col + row) * map.tileHeight * 0.5 - map.tileHeight
    ];
  }

  return [x, y];
}

/**
 * Convert a point given relatively to an object (before its rotation) to the engine space.
 */
export function getObjectPointPosition(object, px, py) {
  const angle = object.rotation * Math.PI / 180;
  const x = object.x + px * Math.cos(angle) - py * Math.sin(angle);
  const y = object.y + px * Math.sin(angle) + py * Math.cos(angle);
  const pos = getEnginePosition(object.map, x, y);
  const offset = getLayerOffset(object.layer);
  return [pos[0] + offset[0], pos[1] + offset[1]];
}

export function getObjectPosition(object) {
  return getObjectPointPosition(object, 0, 0);
}

export function getObjectCenter(object) {
  return getObjectPointPosition(object, object.width * 0.5, object.height * 0.5);
}

// ----------------------------------------------------------------------------------
// FILES
// ----------------------------------------------------------------------------------
export function getMapDir(map) {
  return map.fileName ? FileInfo.path(map.fileName) : '';
}

export function resolvePath(map, path) {
  if (!path || FileInfo.isAbsolutePath(path)) {
    return path;
  }

  return FileInfo.cleanPath(FileInfo.joinPaths(getMapDir(map), path));
}

export function relativePath(map, path) {
  const dir = getMapDir(map);
  if (!path || !dir) {
    return path;
  }

  return FileInfo.relativePath(dir, path);
}

export function getExportName(object) {
  return object.name || getObjectType(object) + '_' + object.id;
}

export function writeJson(path, data) {
  const file = new TextFile(path, TextFile.WriteOnly);
  file.write(JSON.stringify(data));
  file.commit();
}

/**
 * Copy a file in the export directory, once per export.
 */
export function copyFile(sourcePath, dir, copiedFiles) {
  const targetPath = FileInfo.joinPaths(dir, FileInfo.fileName(sourcePath));
  if (copiedFiles.includes(targetPath)) {
    return;
  }

  if (!File.exists(sourcePath)) {
    throw new Error(`File not found: ${sourcePath}`);
  }

  if (FileInfo.cleanPath(sourcePath) != FileInfo.cleanPath(targetPath)) {
    if (File.exists(targetPath)) {
      File.remove(targetPath);
    }

    File.copy(sourcePath, targetPath);
  }

  copiedFiles.push(targetPath);
}

// ----------------------------------------------------------------------------------
// COLORS
// ----------------------------------------------------------------------------------
export function colorToRgb(color) {
  const hex = String(color).replace('#', '');
  const rgb = hex.length == 8 ? hex.substring(2) : hex;
  return [0, 2, 4].map(i => parseInt(rgb.substring(i, i + 2), 16) / 255);
}

export function rgbToColor(rgb) {
  return tiled.color(rgb[0], rgb[1], rgb[2]);
}
