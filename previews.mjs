import * as props from './props.mjs';
import * as utils from './utils.mjs';
// ----------------------------------------------------------------------------------

// The sprites of a map are drawn in a single image layer, its image is not saved in the map.
// Tiled has no signal for object changes, the previews are drawn again when the map is opened,
// activated or saved, when the selection or the modified state changes and after a panel edit.
const MAX_PIXELS = 4096 * 4096;
const MIN_FRAME_DURATION = 16;

let refreshPending = false;
const pendingMaps = [];
const connectedMaps = [];

// Played JAS animation: { map, objectId, animIndex, frameIndex, textures }
let player = null;
let timerDialog = null;
let timerButton = null;
const playListeners = [];

export function register() {
  tiled.assetOpened.connect(requestRefresh);
  tiled.activeAssetChanged.connect(requestRefresh);
  tiled.assetAboutToBeSaved.connect(clearPreview);
  tiled.assetSaved.connect(requestRefresh);
  tiled.assetAboutToBeClosed.connect(asset => {
    if (player && player.map === asset) {
      stop();
    }
  });

  for (const asset of tiled.openAssets) {
    requestRefresh(asset);
  }
}

export function requestRefresh(asset) {
  if (!asset || !asset.isTileMap) {
    return;
  }

  connectMap(asset);
  if (!pendingMaps.includes(asset)) {
    pendingMaps.push(asset);
  }

  if (!refreshPending) {
    refreshPending = true;
    Qt.callLater(flushRefresh);
  }
}

function flushRefresh() {
  refreshPending = false;
  for (const map of pendingMaps.splice(0)) {
    if (tiled.openAssets.includes(map)) {
      refresh(map);
    }
  }
}

function connectMap(map) {
  if (connectedMaps.includes(map)) {
    return;
  }

  map.selectedObjectsChanged.connect(() => requestRefresh(map));
  map.modifiedChanged.connect(() => requestRefresh(map));
  connectedMaps.push(map);
}

function clearPreview(asset) {
  const layer = asset && asset.isTileMap ? findPreviewLayer(asset) : null;
  if (layer) {
    layer.setImage(new Image());
  }
}

// ----------------------------------------------------------------------------------
// PLAY
// Scripts have no timer, the clicked signal of a hidden auto repeat button is used instead.
// ----------------------------------------------------------------------------------
export function play(map, object, animIndex) {
  stop(false);
  player = { map: map, objectId: object.id, animIndex: animIndex, frameIndex: 0, textures: {} };

  const anim = getPlayedAnimation();
  if (!anim) {
    player = null;
    return;
  }

  const button = getTimerButton();
  button.autoRepeatDelay = getFrameDuration(anim);
  button.autoRepeatInterval = getFrameDuration(anim);
  button.down = true;

  refresh(map);
  notifyPlay();
}

export function stop(redraw = true) {
  if (!player) {
    return;
  }

  const map = player.map;
  player = null;
  getTimerButton().down = false;

  if (redraw && tiled.openAssets.includes(map)) {
    refresh(map);
  }

  notifyPlay();
}

export function isPlaying(object, animIndex) {
  return player != null && player.map === object.map && player.objectId == object.id && player.animIndex == animIndex;
}

export function onPlayChanged(listener) {
  playListeners.push(listener);
}

function notifyPlay() {
  for (const listener of playListeners) {
    listener();
  }
}

function getTimerButton() {
  if (!timerButton) {
    timerDialog = new Dialog('Legacy Game Maker Timer');
    timerButton = timerDialog.addButton('');
    timerButton.autoRepeat = true;
    timerButton.clicked.connect(onTick);
  }

  return timerButton;
}

/**
 * The animation loops, each frame lasts its frame duration like Gfx2SpriteJAS.update.
 */
function onTick() {
  const anim = player && tiled.openAssets.includes(player.map) ? getPlayedAnimation() : null;
  if (!anim) {
    stop();
    return;
  }

  player.frameIndex = (player.frameIndex + 1) % getFrameCount(anim);
  timerButton.autoRepeatInterval = getFrameDuration(anim);
  refresh(player.map);
}

function getPlayedObject() {
  for (const item of utils.getTypedLayers(player.map, props.LAYER_JAS)) {
    const object = item.layer.objects.find(object => object.id == player.objectId);
    if (object) {
      return object;
    }
  }

  return null;
}

function getPlayedAnimation() {
  const object = getPlayedObject();
  return object ? getAnimation(object, player.animIndex) : null;
}

/**
 * Animation values read from the object, or null if the animation does not exist anymore.
 */
function getAnimation(object, animIndex) {
  const anim = props.getListValues(object, 'Animations', props.OBJECT_FIELDS[props.LAYER_JAS])[animIndex];
  if (!anim) {
    return null;
  }

  return {
    frames: anim.Frames.map(frame => [frame.X, frame.Y, frame.Width, frame.Height]),
    frameDuration: anim.FrameDuration
  };
}

function getFrameCount(anim) {
  return Math.max(1, anim.frames.length);
}

function getFrameDuration(anim) {
  return Math.max(MIN_FRAME_DURATION, anim.frameDuration);
}

// ----------------------------------------------------------------------------------
// REFRESH
// ----------------------------------------------------------------------------------
export function refresh(map) {
  if (map.readOnly || !isOrientationSupported(map)) {
    return;
  }

  const items = utils.collectLayers(map.layers).filter(item => {
    return item.layer.isObjectLayer && (item.layer.name == props.LAYER_JSS || item.layer.name == props.LAYER_JAS);
  });

  let layer = findPreviewLayer(map);
  if (!layer) {
    if (items.length == 0) {
      return;
    }

    layer = createPreviewLayer(map, items[0].layer);
  }

  const textures = player && player.map === map ? player.textures : {};
  const sprites = [];
  for (const item of items) {
    if (!item.visible) {
      continue;
    }

    for (const object of item.layer.objects) {
      const sprite = object.visible ? createSprite(map, item, object, textures).sprite : null;
      if (sprite) {
        sprites.push(sprite);
      }
    }
  }

  layer.setImage(drawSprites(sprites));
}

function isOrientationSupported(map) {
  return map.orientation === TileMap.Orthogonal || map.orientation === TileMap.Isometric;
}

function findPreviewLayer(map) {
  const item = findPreviewItem(map);
  return item ? item.layer : null;
}

function findPreviewItem(map) {
  return utils.collectLayers(map.layers).find(item => utils.isPreviewLayer(item.layer));
}

// ----------------------------------------------------------------------------------
// PROBLEMS
// Reasons why a sprite or an animation is not drawn, shown in the panel.
// ----------------------------------------------------------------------------------
export function getProblem(map, object) {
  if (!isOrientationSupported(map)) {
    return 'only orthogonal and isometric maps are supported';
  }

  const previewItem = findPreviewItem(map);
  if (previewItem && !previewItem.visible) {
    return `the layer "${props.PREVIEW_LAYER}" is hidden`;
  }

  const item = utils.collectLayers(map.layers).find(item => item.layer.id == object.layer.id);
  if (!item.visible) {
    return `the layer "${item.layer.name}" is hidden`;
  }

  if (!object.visible) {
    return 'the object is hidden';
  }

  return createSprite(map, item, object, {}).problem;
}

export function getAnimationProblem(map, object, animIndex) {
  const fields = props.OBJECT_FIELDS[props.LAYER_JAS];
  const anim = getAnimation(object, animIndex);
  const res = loadTexture(map, object, fields, {});
  if (!anim || res.problem) {
    return '';
  }

  if (anim.frames.length == 0) {
    return 'the animation has no frame';
  }

  for (let i = 0; i < anim.frames.length; i++) {
    const problem = getRectProblem(anim.frames[i], res.texture);
    if (problem) {
      return `frame ${i + 1}: ${problem}`;
    }
  }

  return '';
}

function getRectProblem(rect, texture) {
  if (rect[2] <= 0 || rect[3] <= 0) {
    return 'Width and Height must be greater than 0';
  }

  if (rect[0] < 0 || rect[1] < 0 || rect[0] + rect[2] > texture.width || rect[1] + rect[3] > texture.height) {
    return `the area is outside the texture (${texture.width}x${texture.height} pixels)`;
  }

  return '';
}

/**
 * The preview layer is inserted below the top-level layer containing the first sprite layer.
 */
function createPreviewLayer(map, spriteLayer) {
  let root = spriteLayer;
  while (root.parentLayer) {
    root = root.parentLayer;
  }

  const index = map.layers.findIndex(layer => layer.id == root.id);
  const layer = new ImageLayer(props.PREVIEW_LAYER);
  layer.locked = true;
  map.insertLayerAt(index < 0 ? map.layerCount : index, layer);
  return layer;
}

// ----------------------------------------------------------------------------------
// SPRITES
// ----------------------------------------------------------------------------------
/**
 * Texture area and screen position of a sprite, placed like Gfx2Drawable.render (position - offset).
 * Returns { sprite } or { problem }, a sprite partially outside its texture has both.
 */
function createSprite(map, item, object, textures) {
  const type = item.layer.name;
  const fields = props.OBJECT_FIELDS[type];
  const res = loadTexture(map, object, fields, textures);
  if (res.problem) {
    return res;
  }

  const texture = res.texture;
  const area = type == props.LAYER_JSS ? getJSSRect(object, fields) : getJASRect(object);
  if (!area.rect) {
    return area;
  }

  const rect = area.rect;
  let offset = [props.getValue(object, 'OffsetX', fields), props.getValue(object, 'OffsetY', fields)];
  if (props.getValue(object, 'OffsetFactorEnabled', fields)) {
    offset = [rect[2] * props.getValue(object, 'OffsetFactorX', fields), rect[3] * props.getValue(object, 'OffsetFactorY', fields)];
  }

  const pos = map.pixelToScreen(object.x, object.y);
  const sprite = {
    texture: texture,
    rect: rect,
    x: Math.round(pos.x + item.offsetX - offset[0]),
    y: Math.round(pos.y + item.offsetY - offset[1]),
    flipX: props.getValue(object, 'FlipX', fields),
    flipY: props.getValue(object, 'FlipY', fields)
  };

  if (sprite.x + rect[2] <= 0 || sprite.y + rect[3] <= 0) {
    return { problem: 'the sprite is above or left of the map origin, it cannot be drawn' };
  }

  return { sprite: sprite, problem: getRectProblem(rect, texture) };
}

function loadTexture(map, object, fields, textures) {
  const path = utils.resolvePath(map, props.getValue(object, 'Texture', fields));
  if (!path) {
    return { problem: 'no texture' };
  }

  if (!textures[path]) {
    textures[path] = new Image(path);
  }

  if (textures[path].width == 0) {
    return { problem: `the texture "${path}" cannot be loaded` };
  }

  return { texture: textures[path] };
}

function getJSSRect(object, fields) {
  const rect = ['X', 'Y', 'Width', 'Height'].map(key => props.getValue(object, key, fields));
  if (rect[2] <= 0 || rect[3] <= 0) {
    return { problem: 'Width and Height must be greater than 0' };
  }

  return { rect: rect };
}

/**
 * Current frame of the played animation, otherwise first frame of the first animation.
 */
function getJASRect(object) {
  const playedAnim = player && player.map === object.map && player.objectId == object.id ? getAnimation(object, player.animIndex) : null;
  const anim = playedAnim ?? getAnimation(object, 0);
  if (!anim) {
    return { problem: 'add an animation to see the sprite' };
  }

  if (anim.frames.length == 0) {
    return { problem: 'the animation has no frame' };
  }

  const index = playedAnim ? player.frameIndex % anim.frames.length : 0;
  const rect = anim.frames[index];
  if (rect[2] <= 0 || rect[3] <= 0) {
    return { problem: `frame ${index + 1}: Width and Height must be greater than 0` };
  }

  return { rect: rect };
}

// ----------------------------------------------------------------------------------
// DRAW
// ----------------------------------------------------------------------------------
/**
 * The image starts at the map origin (the layer offset is never changed, it would create undo
 * commands) and stops at the last sprite. Sprites above or left of the origin are cut.
 */
function drawSprites(sprites) {
  let width = 0;
  let height = 0;
  for (const sprite of sprites) {
    width = Math.max(width, sprite.x + sprite.rect[2]);
    height = Math.max(height, sprite.y + sprite.rect[3]);
  }

  if (width <= 0 || height <= 0) {
    return new Image();
  }

  if (width * height > MAX_PIXELS) {
    tiled.warn(`Preview: the sprites are too far from the map origin to be drawn (${width}x${height} pixels)`, () => {});
    return new Image();
  }

  const pixels = new Uint32Array(width * height);
  for (const sprite of sprites) {
    drawSprite(sprite, pixels, width, height);
  }

  // An image created from a buffer does not own its pixels, they are freed with the script
  // object while the layer still uses them. The copy owns its pixels.
  return new Image(pixels.buffer, width, height, Image.Format_ARGB32).copy(0, 0, width, height);
}

function drawSprite(sprite, pixels, width, height) {
  const [rx, ry, rw, rh] = sprite.rect;
  for (let y = 0; y < rh; y++) {
    const dy = sprite.y + y;
    const sy = ry + (sprite.flipY ? rh - 1 - y : y);
    if (dy < 0 || dy >= height || sy < 0 || sy >= sprite.texture.height) {
      continue;
    }

    for (let x = 0; x < rw; x++) {
      const dx = sprite.x + x;
      const sx = rx + (sprite.flipX ? rw - 1 - x : x);
      if (dx < 0 || dx >= width || sx < 0 || sx >= sprite.texture.width) {
        continue;
      }

      const index = dy * width + dx;
      pixels[index] = blend(sprite.texture.pixel(sx, sy) >>> 0, pixels[index]);
    }
  }
}

/**
 * Source over destination, colors are not premultiplied (ARGB32).
 */
function blend(src, dst) {
  const sa = src >>> 24;
  const da = dst >>> 24;
  if (sa == 255 || da == 0) {
    return src;
  }

  if (sa == 0) {
    return dst;
  }

  const a = sa + da * (255 - sa) / 255;
  const channel = shift => {
    const s = (src >>> shift) & 255;
    const d = (dst >>> shift) & 255;
    return Math.round((s * sa + d * da * (255 - sa) / 255) / a);
  };

  return ((Math.round(a) << 24) | (channel(16) << 16) | (channel(8) << 8) | channel(0)) >>> 0;
}
