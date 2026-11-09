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
    else if (!item.layer.isObjectLayer) {
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
    OffsetX: item.offsetX,
    OffsetY: item.offsetY,
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
    OffsetX: item.offsetX,
    OffsetY: item.offsetY,
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
  const obj = {
    Ident: 'ENT'
  };

  let shape = 'UNKNOWN';
  if (object.shape === MapObject.Rectangle) {
    shape = 'AABB';
  }
  else if (object.shape === MapObject.Ellipse) {
    shape = 'CIRCLE';
  }

  const pos = shape == 'UNKNOWN' ? utils.getObjectPosition(object) : utils.getObjectCenter(object);

  obj['Name'] = object.name;
  obj['Type'] = props.getValue(object, 'Type', fields);
  obj['Shape'] = shape;

  const model = props.getValue(object, 'Model', fields);
  if (model != '') {
    if (!getModelNames(object.map).includes(model)) {
      context.warnings.push(`ENT export: entity "${object.name}" uses the model "${model}" which is not in the JSS or JAS layers`);
    }

    obj['Model'] = model;
    obj['ModelBehavior'] = props.getValue(object, 'ModelBehavior', fields);
  }

  obj['PositionX'] = pos[0];
  obj['PositionY'] = pos[1];
  obj['PositionZ'] = 0;
  obj['RotationX'] = 0;
  obj['RotationY'] = 0;
  obj['RotationZ'] = object.rotation * Math.PI / 180;
  obj['ScaleX'] = 1;
  obj['ScaleY'] = 1;
  obj['ScaleZ'] = 1;
  obj['Width'] = object.width;
  obj['Height'] = object.height;
  obj['Depth'] = 0;
  obj['CustomParams'] = [];

  for (const field of fields.filter(field => field.type == 'slot')) {
    const slot = props.getSlot(object, field.key);
    obj['CustomParams'].push({ Name: slot.name, Value: slot.value });
  }

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

  const obj = {
    Ident: 'JLM',
    NumPoints: -1,
    Points: []
  };

  for (const point of object.polygon) {
    const pos = utils.getObjectPointPosition(object, point.x, point.y);
    obj['Points'].push([pos[0], pos[1], 0]);
  }

  obj['NumPoints'] = obj['Points'].length;
  return obj;
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

  const texturePath = textureExport(object, fields, context);
  const frameWidth = props.getValue(object, 'FrameWidth', fields);
  const frameHeight = props.getValue(object, 'FrameHeight', fields);

  if (!texturePath) {
    throw new Error(`JAS export: sprite "${object.name}" needs a texture to compute its frames`);
  }

  if (frameWidth <= 0 || frameHeight <= 0) {
    throw new Error(`JAS export: sprite "${object.name}" needs a frame width and a frame height`);
  }

  const numCol = Math.floor(new Image(texturePath).width / frameWidth);
  if (numCol <= 0) {
    throw new Error(`JAS export: sprite "${object.name}" has a frame width larger than its texture`);
  }

  for (const anim of props.getValue(object, 'Animations', fields)) {
    const animOwner = { property: key => anim[key] };
    const animFields = props.findField(fields, 'Animations').fields;
    const startFrame = props.getValue(animOwner, 'StartFrame', animFields);
    const endFrame = props.getValue(animOwner, 'EndFrame', animFields);
    const frames = [];

    for (let i = startFrame; i <= endFrame; i++) {
      frames.push({
        X: (i % numCol) * frameWidth,
        Y: Math.floor(i / numCol) * frameHeight,
        Width: frameWidth,
        Height: frameHeight
      });
    }

    if (frames.length == 0) {
      context.warnings.push(`JAS export: animation "${props.getValue(animOwner, 'Name', animFields)}" of sprite "${object.name}" has no frame, its end frame is lower than its start frame`);
    }

    obj['Animations'].push({
      Name: props.getValue(animOwner, 'Name', animFields),
      Frames: frames,
      FrameDuration: props.getValue(animOwner, 'FrameDuration', animFields)
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

    const value = props.getValue(object, field.key, fields);
    if (field.tween) {
      obj[field.key + 'Times'] = value.map(item => props.decodeValue(field.fields[0], item['Time']));
      obj[field.key + 'Values'] = value.map(item => props.decodeValue(field.fields[1], item['Value']));
    }
    else {
      obj[field.exportKey ?? field.key] = value;
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
    const path = FileInfo.joinPaths(context.dir, name + '.' + type.toLowerCase());
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
