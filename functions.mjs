import * as props from './props.mjs';
import * as utils from './utils.mjs';
// ----------------------------------------------------------------------------------

// ----------------------------------------------------------------------------------
// JTM
// ----------------------------------------------------------------------------------
/**
 * Convert a Tiled map to the JTM format loaded by Gfx2TileMap.
 * Only the first tileset of the map is exported, tiles from other tilesets are left empty.
 * Object layers named like a plugin type (ENT, JLM, ...) are exported in their own files.
 *
 * @param {TileMap} map - The Tiled map.
 * @returns {{ data: object, warnings: string[] }} The JTM data and the conversion warnings.
 * @throws An error if the map cannot be represented in JTM.
 */
export function jtmExport(map) {
  if (map.infinite) {
    throw new Error('JTM export: infinite maps are not supported, convert the map to a fixed size (Map > Map Properties > Infinite)');
  }

  if (map.orientation !== TileMap.Orthogonal && map.orientation !== TileMap.Isometric) {
    throw new Error('JTM export: only orthogonal and isometric maps are supported');
  }

  const warnings = [];
  const tileset = map.tilesets.length > 0 ? map.tilesets[0] : null;

  for (const used of map.usedTilesets()) {
    if (used !== tileset) {
      warnings.push(`JTM export: tileset "${used.name}" is not the first tileset of the map, its tiles are exported as empty cells`);
    }
  }

  const obj = {
    Ident: 'JTM',
    Rows: map.height,
    Columns: map.width,
    TileHeight: map.tileHeight,
    TileWidth: map.tileWidth,
    Layers: []
  };

  const frameDuration = props.getValue(map, 'FrameDuration', props.MAP_FIELDS);
  if (tileset) {
    const textureDir = props.getValue(map, 'TextureDir', props.MAP_FIELDS);
    obj.Tileset = tilesetExport(tileset, textureDir, warnings);
  }

  for (const item of utils.collectLayers(map.layers)) {
    if (item.layer.isTileLayer) {
      obj.Layers.push(tileLayerExport(item, tileset, frameDuration, warnings));
    }
    else if (item.layer.isObjectLayer && !utils.isTypedLayer(item.layer)) {
      obj.Layers.push(objectLayerExport(item, map));
    }
    else if (!item.layer.isObjectLayer && !utils.isPreviewLayer(item.layer)) {
      warnings.push(`JTM export: layer "${item.layer.name}" is skipped, only tile and object layers are supported`);
    }
  }

  return { data: obj, warnings: warnings };
}

function tilesetExport(tileset, textureDir, warnings) {
  if (tileset.isCollection) {
    throw new Error(`JTM export: tileset "${tileset.name}" is an image collection, the engine needs a tileset based on a single image`);
  }

  if (tileset.margin !== 0 || tileset.tileSpacing !== 0) {
    warnings.push(`JTM export: tileset "${tileset.name}" uses margin or spacing, the engine ignores them and tiles will be misplaced`);
  }

  const animations = {};
  const slopes = {};
  const properties = {};

  for (const tile of tileset.tiles) {
    const tileId = tile.id + 1;

    const animation = props.getValue(tile, 'Animation', props.TILE_FIELDS);
    if (animation != '') {
      animations[tileId] = parseTileIds(animation);
    }

    if (tile.property('SlopeLeft') !== undefined || tile.property('SlopeRight') !== undefined) {
      slopes[tileId] = [
        props.getValue(tile, 'SlopeLeft', props.TILE_FIELDS),
        props.getValue(tile, 'SlopeRight', props.TILE_FIELDS)
      ];
    }

    const tileProperties = {};
    for (const [name, value] of Object.entries(tile.properties())) {
      if (!props.findField(props.TILE_FIELDS, name)) {
        tileProperties[name] = propertyValueExport(value);
      }
    }

    if (Object.keys(tileProperties).length > 0) {
      properties[tileId] = tileProperties;
    }
  }

  return {
    Columns: tileset.columnCount,
    TileWidth: tileset.tileWidth,
    TileHeight: tileset.tileHeight,
    TextureFile: textureDir + FileInfo.fileName(tileset.image),
    Animations: animations,
    Slopes: slopes,
    Properties: properties
  };
}

export function parseTileIds(text) {
  return String(text).split(',').map(v => v.trim()).filter(v => v != '').map(v => Number(v)).filter(v => Number.isInteger(v));
}

/**
 * The engine draws a layer at position - offset (Gfx2Drawable.render), the Tiled offset is negated.
 * The offset of the map (Export section of the panel) is already applied to the Tiled layers.
 */
function tileLayerExport(item, tileset, frameDuration, warnings) {
  const layer = item.layer;
  const grid = [];
  let numForeignTiles = 0;
  let numFlippedTiles = 0;

  for (let y = 0; y < layer.height; y++) {
    for (let x = 0; x < layer.width; x++) {
      const cell = layer.cellAt(x, y);
      if (cell.empty) {
        grid.push(0);
        continue;
      }

      const tile = layer.tileAt(x, y);
      if (!tile || tile.tileset !== tileset) {
        numForeignTiles++;
        grid.push(0);
        continue;
      }

      if (cell.flippedHorizontally || cell.flippedVertically || cell.flippedAntiDiagonally) {
        numFlippedTiles++;
      }

      grid.push(tile.id + 1);
    }
  }

  if (numForeignTiles > 0) {
    warnings.push(`JTM export: layer "${layer.name}" has ${numForeignTiles} tile(s) from another tileset than the first one, exported as empty cells`);
  }

  if (numFlippedTiles > 0) {
    warnings.push(`JTM export: layer "${layer.name}" has ${numFlippedTiles} flipped or rotated tile(s), the engine draws them unflipped`);
  }

  return {
    Name: layer.name,
    Rows: layer.height,
    Columns: layer.width,
    OffsetX: -item.offsetX,
    OffsetY: -item.offsetY,
    Visible: item.visible,
    FrameDuration: frameDuration,
    Grid: grid,
    Objects: []
  };
}

function objectLayerExport(item, map) {
  const objects = [];
  for (const object of item.layer.objects) {
    objects.push({
      Id: String(object.id),
      Position: tileObjectPositionExport(map, object),
      Name: object.name,
      Type: object.className || (object.tile ? object.tile.className : ''),
      Visible: object.visible,
      Size: [object.width, object.height],
      Properties: propertiesExport(object.resolvedProperties())
    });
  }

  return {
    Name: item.layer.name,
    Rows: 0,
    Columns: 0,
    OffsetX: -item.offsetX,
    OffsetY: -item.offsetY,
    Visible: item.visible,
    FrameDuration: 0,
    Grid: [],
    Objects: objects
  };
}

/**
 * Position of a Gfx2TileObject, relative to its layer.
 * Orthogonal: tile objects have their origin at the bottom-left in Tiled, converted to the top-left.
 */
function tileObjectPositionExport(map, object) {
  if (map.orientation === TileMap.Isometric) {
    return utils.getEnginePosition(map, object.x, object.y);
  }

  return [object.x, object.tile ? object.y - object.height : object.y];
}

function propertiesExport(properties) {
  const obj = {};
  for (const [name, value] of Object.entries(properties)) {
    obj[name] = propertyValueExport(value);
  }

  return obj;
}

function propertyValueExport(value) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'object') {
    return value;
  }

  // Class and enum values
  if ('typeName' in value && 'value' in value) {
    return typeof value.value === 'object' ? propertiesExport(value.value) : value.value;
  }

  // Object references and objects
  if ('id' in value) {
    return value.id;
  }

  // File paths, only the file name is kept like the textures
  if ('localFile' in value || 'url' in value) {
    return FileInfo.fileName(value.localFile || value.url.toString());
  }

  return String(value);
}

// ----------------------------------------------------------------------------------
// ENT
// ----------------------------------------------------------------------------------
export function entExport(object, context) {
  const fields = props.OBJECT_FIELDS[props.LAYER_ENT];
  const keys = {};

  const model = props.getValue(object, 'Model', fields);
  if (model != '') {
    if (!getModelNames(object.map).includes(model)) {
      context.warnings.push(`ENT export: entity "${object.name}" uses the model "${model}" which is not in the JSS or JAS layers`);
    }

    keys['Model'] = model;
  }

  keys['OnActionBlockId'] = props.getValue(object, 'OnActionBlockId', fields);
  return entityFileExport(object, fields, keys);
}

// ----------------------------------------------------------------------------------
// TRG
// ----------------------------------------------------------------------------------
/**
 * A trigger is exported as an entity file (loaded by EnginePack2D) with its block ids.
 */
export function trgExport(object, context) {
  const fields = props.OBJECT_FIELDS[props.LAYER_TRG];
  return entityFileExport(object, fields, {
    OnEnterBlockId: props.getValue(object, 'OnEnterBlockId', fields),
    OnLeaveBlockId: props.getValue(object, 'OnLeaveBlockId', fields),
    OnActionBlockId: props.getValue(object, 'OnActionBlockId', fields)
  });
}

/**
 * Entity file of an entity or a trigger: the keys of its type follow the shape, then the
 * position (center of an AABB or a circle), rotation, scale, size and custom params.
 */
function entityFileExport(object, fields, keys) {
  let shape = 'UNKNOWN';
  if (object.shape === MapObject.Rectangle) {
    shape = 'AABB';
  }
  else if (object.shape === MapObject.Ellipse) {
    shape = 'CIRCLE';
  }

  const pos = shape == 'UNKNOWN' ? utils.getObjectPosition(object) : utils.getObjectCenter(object);
  const obj = Object.assign({
    Ident: 'ENT',
    Name: object.name,
    Type: props.getValue(object, 'Type', fields),
    Shape: shape
  }, keys, {
    PositionX: pos[0],
    PositionY: pos[1],
    PositionZ: 0,
    RotationX: 0,
    RotationY: 0,
    RotationZ: object.rotation * Math.PI / 180,
    ScaleX: 1,
    ScaleY: 1,
    ScaleZ: 1,
    Width: object.width,
    Height: object.height,
    Depth: 0,
    CustomParams: fields.filter(field => field.type == 'slot').map(field => {
      const slot = props.getSlot(object, field.key);
      return { Name: slot.name, Value: slot.value };
    })
  });

  if (shape == 'CIRCLE') {
    obj['Radius'] = object.width / 2;
  }

  return obj;
}

/**
 * Names of the sprite files that can be used as entity model.
 */
export function getModelNames(map) {
  const names = [];
  for (const type of [props.LAYER_JSS, props.LAYER_JAS]) {
    for (const item of utils.getTypedLayers(map, type)) {
      for (const object of item.layer.objects) {
        names.push(utils.getExportName(object) + '.' + type.toLowerCase());
      }
    }
  }

  return names;
}

// ----------------------------------------------------------------------------------
// JLM
// ----------------------------------------------------------------------------------
export function jlmExport(object, context) {
  if (object.shape !== MapObject.Polyline && object.shape !== MapObject.Polygon) {
    context.warnings.push(`JLM export: object "${object.name}" is skipped, only polylines and polygons are supported`);
    return null;
  }

  const points = object.polygon.map(point => {
    const pos = utils.getObjectPointPosition(object, point.x, point.y);
    return [pos[0], pos[1], 0];
  });

  return {
    Ident: 'JLM',
    NumPoints: points.length,
    Points: points
  };
}

// ----------------------------------------------------------------------------------
// JSS
// ----------------------------------------------------------------------------------
export function jssExport(object, context) {
  const fields = props.OBJECT_FIELDS[props.LAYER_JSS];
  const obj = {
    Ident: 'JSS'
  };

  textureExport(object, fields, context);

  for (const key of ['X', 'Y', 'Width', 'Height']) {
    obj[key] = props.getValue(object, key, fields);
  }

  offsetExport(object, fields, obj);
  return obj;
}

// ----------------------------------------------------------------------------------
// JAS
// ----------------------------------------------------------------------------------
export function jasExport(object, context) {
  const fields = props.OBJECT_FIELDS[props.LAYER_JAS];
  const obj = {
    Ident: 'JAS',
    Animations: []
  };

  textureExport(object, fields, context);

  for (const anim of props.getListValues(object, 'Animations', fields)) {
    if (anim.Frames.length == 0) {
      context.warnings.push(`JAS export: animation "${anim.Name}" of sprite "${object.name}" has no frame`);
    }

    obj['Animations'].push({
      Name: anim.Name,
      Frames: anim.Frames,
      FrameDuration: anim.FrameDuration
    });
  }

  offsetExport(object, fields, obj);
  return obj;
}

function offsetExport(object, fields, obj) {
  for (const key of ['OffsetX', 'OffsetY', 'OffsetFactorX', 'OffsetFactorY', 'OffsetFactorEnabled', 'FlipX', 'FlipY']) {
    obj[key] = props.getValue(object, key, fields);
  }
}

/**
 * Copy the texture of an object in the export directory.
 *
 * @returns The absolute path of the texture, or an empty string.
 */
function textureExport(object, fields, context) {
  const texture = props.getValue(object, 'Texture', fields);
  if (texture == '') {
    return '';
  }

  const texturePath = utils.resolvePath(object.map, texture);
  utils.copyFile(texturePath, context.dir, context.files);
  return texturePath;
}

// ----------------------------------------------------------------------------------
// PRT
// ----------------------------------------------------------------------------------
export function prtExport(object, context) {
  const fields = props.OBJECT_FIELDS[props.LAYER_PRT];
  const obj = {
    Ident: 'PRT'
  };

  obj['Position'] = utils.getObjectPosition(object);

  const texturePath = textureExport(object, fields, context);
  obj['Texture'] = texturePath ? FileInfo.fileName(texturePath) : '';

  for (const field of fields) {
    if (field.type == 'file') {
      continue;
    }

    if (field.tween) {
      const items = props.getListValues(object, field.key, fields);
      obj[field.key + 'Times'] = items.map(item => item.Time);
      obj[field.key + 'Values'] = items.map(item => item.Value);
    }
    else {
      obj[field.exportKey ?? field.key] = props.getValue(object, field.key, fields);
    }
  }

  return obj;
}

// ----------------------------------------------------------------------------------
// CAM
// ----------------------------------------------------------------------------------
export function camExport(object, context) {
  const fields = props.OBJECT_FIELDS[props.LAYER_CAM];
  const pos = utils.getObjectCenter(object);

  return {
    Ident: 'CAM',
    PositionX: pos[0],
    PositionY: pos[1],
    ScaleX: props.getValue(object, 'ScaleX', fields),
    ScaleY: props.getValue(object, 'ScaleY', fields)
  };
}

// ----------------------------------------------------------------------------------
// PACK
// ----------------------------------------------------------------------------------
const EXPORTERS = {
  [props.LAYER_ENT]: entExport,
  [props.LAYER_TRG]: trgExport,
  [props.LAYER_JLM]: jlmExport,
  [props.LAYER_JSS]: jssExport,
  [props.LAYER_JAS]: jasExport,
  [props.LAYER_PRT]: prtExport,
  [props.LAYER_CAM]: camExport
};

export function getExportDir(map) {
  const exportPath = props.getValue(map, 'ExportPath', props.MAP_FIELDS);
  const dir = exportPath != '' ? utils.resolvePath(map, exportPath) : utils.getMapDir(map);
  if (!dir || !FileInfo.isAbsolutePath(dir)) {
    throw new Error('Export: save the map or set an absolute Output Path');
  }

  return dir;
}

/**
 * Export the map and all the objects of the plugin layers in the output directory.
 *
 * @param {TileMap} map - The Tiled map.
 * @param {MapObject[] | null} objects - The objects to export, or null to export the whole map.
 * @returns {{ files: string[], warnings: string[] }} The written files and the export warnings.
 */
export function packExport(map, objects = null) {
  const context = {
    dir: getExportDir(map),
    files: [],
    warnings: []
  };

  File.makePath(context.dir);

  if (objects === null) {
    const res = jtmExport(map);
    context.warnings.push(...res.warnings);

    const path = FileInfo.joinPaths(context.dir, FileInfo.completeBaseName(map.fileName || 'map') + '.jtm');
    utils.writeJson(path, res.data);
    context.files.push(path);

    if (map.tilesets.length > 0 && map.tilesets[0].image) {
      utils.copyFile(map.tilesets[0].image, context.dir, context.files);
    }

    objects = [];
    for (const type of props.TYPED_LAYERS) {
      for (const item of utils.getTypedLayers(map, type)) {
        objects.push(...item.layer.objects);
      }
    }
  }

  let cameraExported = false;
  for (const object of objects) {
    const type = utils.getObjectType(object);
    if (type == '') {
      continue;
    }

    if (type == props.LAYER_CAM && cameraExported) {
      context.warnings.push(`CAM export: camera "${object.name}" is skipped, only one camera can be exported`);
      continue;
    }

    const data = EXPORTERS[type](object, context);
    if (!data) {
      continue;
    }

    const name = type == props.LAYER_CAM ? 'camera' : utils.getExportName(object);
    const path = FileInfo.joinPaths(context.dir, name + '.' + props.getFileExtension(type));
    if (context.files.includes(path)) {
      context.warnings.push(`Export: "${FileInfo.fileName(path)}" is written by several objects, give them different names`);
    }
    else {
      context.files.push(path);
    }

    utils.writeJson(path, data);
    cameraExported = cameraExported || type == props.LAYER_CAM;
  }

  return { files: context.files, warnings: context.warnings };
}
